import { Response } from 'express';
import { Types } from 'mongoose';
import { Logger } from 'pino';
import ApiError from '../utils/ApiError';
import ChapterModel, { Chapter } from '../models/Chapter';
import GenJobModel, { GenerationJobDocument } from '../models/GenJob';
import ProjectModel, { ProjectDocument, StyleProfile as ProjectStyleProfile } from '../models/Project';
import OutlineNodeModel, { OutlineNode as StoredOutlineNode } from '../models/OutlineNode';
import MemoryModel from '../models/Memory';
import StyleProfileModel, { StyleProfileAttributes, StyleProfileDocument } from '../models/StyleProfile';
import CharacterModel, { CharacterAttributes } from '../models/Character';
import OpenAIService, { StreamChapterOptions, UsageRecord } from './openai';
import MemoryService from './memoryService';
import { ChapterContinuationInput, ChapterGenerationInput } from '../validators/chapter';
import { chapterMetaJsonSchema, chapterMetaSchema, ChapterMeta } from '../validators/chapterMeta';
import {
  buildChapterMetaPrompt,
  PromptCharacter,
  PromptMemoryFragment,
  PromptOutlineNode,
  PromptStyleProfile,
} from '../utils/promptTemplates';
import baseLogger from '../utils/logger';
import { jsonrepair } from 'jsonrepair';
import { ZodError } from 'zod';

const HEARTBEAT_INTERVAL_MS = 15_000;
const TARGET_PARAGRAPH_TOKEN_ESTIMATE = 80;
const CHARACTER_TOKEN_RATIO = 3.2;

class ChapterMetaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChapterMetaParseError';
  }
}

class ChapterMetaValidationError extends Error {
  issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'ChapterMetaValidationError';
    this.issues = issues;
  }
}

type TargetLengthInput = { unit: 'characters' | 'paragraphs'; value: number } | undefined;
type StyleOverrideInput =
  | ChapterGenerationInput['styleOverride']
  | ChapterContinuationInput['styleOverride'];
type MemoryFragmentInput =
  | ChapterGenerationInput['memoryFragments']
  | ChapterContinuationInput['memoryFragments'];

interface SseSubscription {
  res: Response;
  heartbeat: NodeJS.Timeout;
}

interface JobExecutionContext {
  job: GenerationJobDocument;
  signal: AbortSignal;
}

class GenerationService {
  private openAI: OpenAIService;

  private memoryService?: MemoryService;

  private streamSubscriptions: Map<string, Set<SseSubscription>>;

  private jobControllers: Map<string, AbortController>;

  private cancelledJobReasons: Map<string, string>;

  private disconnectTimers: Map<string, NodeJS.Timeout>;

  private disconnectGraceMs: number;

  private costPer1KTokens: number;

  private logger: Logger;

  constructor({
    openAIService,
    memoryService,
    logger,
  }: {
    openAIService?: OpenAIService;
    memoryService?: MemoryService;
    logger?: Logger;
  } = {}) {
    this.openAI = openAIService ?? new OpenAIService();
    this.memoryService = memoryService;
    this.streamSubscriptions = new Map();
    this.jobControllers = new Map();
    this.cancelledJobReasons = new Map();
    this.disconnectTimers = new Map();
    this.disconnectGraceMs = Math.max(0, Number(process.env.GENERATION_STREAM_DISCONNECT_GRACE_MS ?? 0));
    this.costPer1KTokens = Number(process.env.OPENAI_COST_PER_1K_TOKENS ?? '0') || 0;
    this.logger = logger ?? baseLogger.child({ module: 'generation-service' });
  }

  registerStream(jobId: string, res: Response): void {
    if (!this.streamSubscriptions.has(jobId)) {
      this.streamSubscriptions.set(jobId, new Set());
    }

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write('event: heartbeat\ndata: {}\n\n');
      }
    }, HEARTBEAT_INTERVAL_MS);

    const subscription: SseSubscription = { res, heartbeat };
    const subscribers = this.streamSubscriptions.get(jobId)!;
    subscribers.add(subscription);
    this.clearDisconnectTimer(jobId);

    const handleClose = () => {
      clearInterval(heartbeat);
      const currentSubscribers = this.streamSubscriptions.get(jobId);
      currentSubscribers?.delete(subscription);

      this.logger.debug({ jobId, subscribers: currentSubscribers?.size ?? 0 }, 'sse subscriber disconnected');

      if (!currentSubscribers || currentSubscribers.size === 0) {
        this.scheduleDisconnect(jobId);
      }
    };

    res.on('close', handleClose);
    res.on('error', handleClose);
  }

  private scheduleDisconnect(jobId: string): void {
    if (this.disconnectTimers.has(jobId)) {
      return;
    }

    const execute = () => {
      this.disconnectTimers.delete(jobId);
      const subscribers = this.streamSubscriptions.get(jobId);
      if (subscribers && subscribers.size > 0) {
        return;
      }

      if (this.jobControllers.has(jobId)) {
        const graceMs = this.disconnectGraceMs;
        this.logger.warn({ jobId, graceMs }, graceMs > 0
          ? 'no active SSE subscribers; cancelling job after grace period'
          : 'no active SSE subscribers; cancelling job');
        this.cancelJob(jobId, 'Client disconnected from stream');
        return;
      }

      this.streamSubscriptions.delete(jobId);
    };

    if (this.disconnectGraceMs <= 0) {
      execute();
      return;
    }

    const timer = setTimeout(execute, this.disconnectGraceMs);
    timer.unref?.();
    this.disconnectTimers.set(jobId, timer);
  }

  private clearDisconnectTimer(jobId: string): void {
    const pending = this.disconnectTimers.get(jobId);
    if (pending) {
      clearTimeout(pending);
      this.disconnectTimers.delete(jobId);
    }
  }

  cancelJob(jobId: string, reason?: string): void {
    const controller = this.jobControllers.get(jobId);
    if (!controller || controller.signal.aborted) {
      return;
    }

    this.clearDisconnectTimer(jobId);

    const message = reason ?? 'Generation job cancelled by client';
    if (!this.cancelledJobReasons.has(jobId)) {
      this.cancelledJobReasons.set(jobId, message);
    }

    this.logger.warn({ jobId, reason: message }, 'aborting generation job');
    controller.abort();
  }

  private getJobRequestId(metadata: GenerationJobDocument['metadata']): string | undefined {
    if (!metadata || typeof metadata !== 'object') {
      return undefined;
    }
    const value = (metadata as Record<string, unknown>).requestId;
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return undefined;
  }

  private setJobRequestId(job: GenerationJobDocument, requestId: string): void {
    if (!requestId) {
      return;
    }

    const existing = this.getJobRequestId(job.metadata);
    if (existing === requestId) {
      return;
    }

    const metadata = (job.metadata && typeof job.metadata === 'object')
      ? (job.metadata as Record<string, unknown>)
      : {};

    job.metadata = {
      ...metadata,
      requestId,
    };

    job.markModified?.('metadata');
    this.emit(job.id, 'meta', { requestId });
  }

  async createChapterGenerationJob(
    projectId: string,
    payload: ChapterGenerationInput
  ): Promise<GenerationJobDocument> {
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    const outlineNodes = await this.loadOutlineNodes(project);
    const outlineNode = this.findOutlineNode(outlineNodes, payload.outlineNodeId);
    if (!outlineNode) {
      throw new ApiError(404, '未找到项目对应的大纲节点');
    }

    const styleProfile = await this.resolveStyleProfile(project, payload.styleProfileId, payload.styleOverride);
    const memoryFragments = await this.resolveMemoryFragments(project, payload.memoryIds, payload.memoryFragments);
    const characters = await this.resolveCharacters(project, payload.characterIds);

    const job = await GenJobModel.create({
      project: project._id,
      type: 'chapter_generation',
      status: 'queued',
      metadata: {
        outlineNodeId: outlineNode.nodeId,
        styleProfileId: payload.styleProfileId,
        memoryIds: payload.memoryIds,
        characterIds: payload.characterIds,
        targetLength: payload.targetLength,
        instructions: payload.instructions,
        model: payload.model,
      },
    });

    this.logger.info({
      jobId: job._id.toString(),
      projectId: project._id.toString(),
      type: job.type,
    }, 'created chapter generation job');

    const additionalOutline = this.buildAdditionalOutline(outlineNodes, outlineNode);

    this.executeJob(job._id.toString(), async ({ job, signal }) => {
      const baseChapterTitle = outlineNode.title || (await this.generateChapterTitle(project._id));
      const planning = await this.prepareChapterPlan({
        job,
        project,
        outlineNode,
        additionalOutline,
        memoryFragments,
        characters,
        styleProfile,
        continuation: false,
        previousSummary: undefined,
        targetLength: payload.targetLength,
        instructions: payload.instructions,
        model: payload.model,
      });

      const effectiveStyleProfile = planning.styleProfile ?? styleProfile;
      const effectiveTargetLength = planning.targetLength ?? payload.targetLength;
      const resolvedChapterTitle = planning.meta.outline.title?.trim() || baseChapterTitle;

      const metadata = (job.metadata && typeof job.metadata === 'object')
        ? { ...(job.metadata as Record<string, unknown>) }
        : {};
      metadata.planning = {
        meta: planning.meta,
        fallback: planning.usedFallback,
        targetLength: effectiveTargetLength,
      };
      if (effectiveStyleProfile) {
        metadata.styleProfileResolved = effectiveStyleProfile;
      }
      job.metadata = metadata;
      job.markModified('metadata');

      job.metaValidationFailures = planning.failures;
      job.metaRetryDurationMs = planning.retryDurationMs;
      job.retryCount = planning.failures;

      const metaPayload: Record<string, unknown> = {
        meta: planning.meta,
        targetLength: effectiveTargetLength,
        fallback: planning.usedFallback,
        retryCount: planning.failures,
      };
      const metaRequestId = this.getJobRequestId(job.metadata);
      if (metaRequestId) {
        metaPayload.requestId = metaRequestId;
      }
      this.emit(job._id.toString(), 'meta', metaPayload);

      const promptOptions: StreamChapterOptions = {
        projectTitle: project.name,
        synopsis: project.synopsis,
        chapterTitle: resolvedChapterTitle,
        outlineNode: this.normaliseOutlineNode(outlineNode),
        additionalOutline,
        memoryFragments,
        characters,
        styleProfile: effectiveStyleProfile,
        continuation: false,
        targetLength: effectiveTargetLength,
        instructions: payload.instructions,
        model: payload.model,
        chapterMeta: planning.meta,
        signal,
      };

      const streamResult = await this.streamAndCollect(job, promptOptions, effectiveTargetLength);

      const chapterDoc = await this.persistNewChapter({
        projectId: project._id,
        jobId: job._id,
        chapterTitle: resolvedChapterTitle,
        outlineNode,
        context: {
          memoryFragments,
          characters,
          styleProfile: effectiveStyleProfile,
        },
        content: streamResult.content,
        meta: planning.meta,
      });

      job.chapter = chapterDoc._id;
      const resultPayload: Record<string, unknown> = {
        chapterId: chapterDoc._id,
        version: 1,
        content: chapterDoc.content,
        meta: planning.meta,
      };
      if (streamResult.requestId) {
        resultPayload.requestId = streamResult.requestId;
      }
      job.result = resultPayload;
      job.markModified('result');

      await this.triggerMemorySync({
        project,
        chapterId: chapterDoc._id,
        chapterTitle: resolvedChapterTitle,
        content: chapterDoc.content ?? streamResult.content,
        chapterOrder: chapterDoc.order ?? undefined,
      });

      this.applyUsageToJob(job, streamResult.usage, streamResult.estimatedTokens, streamResult.model);
      await job.save();
    });

    return job;
  }

  async createChapterContinuationJob(
    projectId: string,
    chapterId: string,
    payload: ChapterContinuationInput
  ): Promise<GenerationJobDocument> {
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    const chapter = await ChapterModel.findOne({ _id: chapterId, project: project._id });
    if (!chapter) {
      throw new ApiError(404, 'Chapter not found for project');
    }

    const outlineNodes = await this.loadOutlineNodes(project);
    const outlineNode = payload.outlineNodeId
      ? this.findOutlineNode(outlineNodes, payload.outlineNodeId)
      : null;

    const styleProfile = await this.resolveStyleProfile(project, payload.styleProfileId, payload.styleOverride);
    const memoryFragments = await this.resolveMemoryFragments(project, payload.memoryIds, payload.memoryFragments);
    const characters = await this.resolveCharacters(project, payload.characterIds);

    const job = await GenJobModel.create({
      project: project._id,
      chapter: chapter._id,
      type: 'chapter_continuation',
      status: 'queued',
      metadata: {
        outlineNodeId: outlineNode?.nodeId ?? null,
        styleProfileId: payload.styleProfileId,
        memoryIds: payload.memoryIds,
        characterIds: payload.characterIds,
        targetLength: payload.targetLength,
        instructions: payload.instructions,
        model: payload.model,
      },
    });

    this.logger.info({
      jobId: job._id.toString(),
      projectId: project._id.toString(),
      chapterId: chapter._id.toString(),
      type: job.type,
    }, 'created chapter continuation job');

    const additionalOutline = outlineNode
      ? this.buildAdditionalOutline(outlineNodes, outlineNode)
      : this.buildRootOutlineContext(outlineNodes);

    this.executeJob(job._id.toString(), async ({ job, signal }) => {
      const previousSummary = this.summariseText(chapter.content);
      const planning = await this.prepareChapterPlan({
        job,
        project,
        outlineNode,
        additionalOutline,
        memoryFragments,
        characters,
        styleProfile,
        continuation: true,
        previousSummary,
        targetLength: payload.targetLength,
        instructions: payload.instructions,
        model: payload.model,
      });

      const effectiveStyleProfile = planning.styleProfile ?? styleProfile;
      const effectiveTargetLength = planning.targetLength ?? payload.targetLength;

      const metadata = (job.metadata && typeof job.metadata === 'object')
        ? { ...(job.metadata as Record<string, unknown>) }
        : {};
      metadata.planning = {
        meta: planning.meta,
        fallback: planning.usedFallback,
        targetLength: effectiveTargetLength,
      };
      if (effectiveStyleProfile) {
        metadata.styleProfileResolved = effectiveStyleProfile;
      }
      job.metadata = metadata;
      job.markModified('metadata');

      job.metaValidationFailures = planning.failures;
      job.metaRetryDurationMs = planning.retryDurationMs;
      job.retryCount = planning.failures;

      const metaPayload: Record<string, unknown> = {
        meta: planning.meta,
        targetLength: effectiveTargetLength,
        fallback: planning.usedFallback,
        retryCount: planning.failures,
      };
      const metaRequestId = this.getJobRequestId(job.metadata);
      if (metaRequestId) {
        metaPayload.requestId = metaRequestId;
      }
      this.emit(job._id.toString(), 'meta', metaPayload);

      const promptOptions: StreamChapterOptions = {
        projectTitle: project.name,
        synopsis: project.synopsis,
        chapterTitle: chapter.title,
        outlineNode: outlineNode ? this.normaliseOutlineNode(outlineNode) : undefined,
        additionalOutline,
        memoryFragments,
        characters,
        styleProfile: effectiveStyleProfile,
        continuation: true,
        previousSummary,
        targetLength: effectiveTargetLength,
        instructions: payload.instructions,
        model: payload.model,
        chapterMeta: planning.meta,
        signal,
      };

      const streamResult = await this.streamAndCollect(job, promptOptions, effectiveTargetLength);
      const updatedChapter = await this.persistContinuation({
        chapter,
        jobId: job._id,
        continuation: streamResult.content,
        context: {
          memoryFragments,
          characters,
          styleProfile: effectiveStyleProfile,
        },
        meta: planning.meta,
      });

      const continuationResult: Record<string, unknown> = {
        chapterId: updatedChapter._id,
        version: updatedChapter.versions[updatedChapter.versions.length - 1]?.version,
        content: updatedChapter.content,
        delta: streamResult.content,
        meta: planning.meta,
      };
      if (streamResult.requestId) {
        continuationResult.requestId = streamResult.requestId;
      }
      job.result = continuationResult;
      job.markModified('result');

      await this.triggerMemorySync({
        project,
        chapterId: updatedChapter._id,
        chapterTitle: updatedChapter.title,
        content: updatedChapter.content ?? streamResult.content,
        chapterOrder: updatedChapter.order ?? undefined,
      });

      this.applyUsageToJob(job, streamResult.usage, streamResult.estimatedTokens, streamResult.model);
      await job.save();
    });

    return job;
  }

  private executeJob(jobId: string, handler: (ctx: JobExecutionContext) => Promise<void>): void {
    const controller = new AbortController();
    this.jobControllers.set(jobId, controller);

    (async () => {
      const job = await GenJobModel.findById(jobId);
      if (!job) {
        this.logger.error({ jobId }, 'generation job not found for execution');
        this.jobControllers.delete(jobId);
        this.cancelledJobReasons.delete(jobId);
        this.finish(jobId);
        return;
      }

      job.status = 'running';
      job.startedAt = new Date();
      await job.save();
      this.emit(jobId, 'start', { jobId, status: 'running' });

      const startedAt = Date.now();

      this.logger.info({
        jobId,
        projectId: job.project?.toString(),
        chapterId: job.chapter?.toString(),
        type: job.type,
        requestId: this.getJobRequestId(job.metadata),
      }, 'generation job started');

      try {
        await handler({ job, signal: controller.signal });

        job.status = 'completed';
        job.completedAt = new Date();
        job.progress = 100;
        await job.save();

        const durationMs = Date.now() - startedAt;

        this.logger.info({
          jobId,
          projectId: job.project?.toString(),
          chapterId: job.chapter?.toString(),
          type: job.type,
          durationMs,
          tokensGenerated: job.tokensGenerated ?? 0,
          completionTokens: job.completionTokens ?? 0,
          promptTokens: job.promptTokens ?? 0,
          cost: job.cost ?? 0,
          retryCount: job.retryCount ?? 0,
          requestId: this.getJobRequestId(job.metadata),
        }, 'generation job completed');

        const requestId = this.getJobRequestId(job.metadata);
        const donePayload: Record<string, unknown> = {
          jobId,
          status: 'completed',
          durationMs,
          retryCount: job.retryCount ?? 0,
        };
        if (requestId) {
          donePayload.requestId = requestId;
        }

        this.emit(jobId, 'done', donePayload);
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const cancellationReason = this.cancelledJobReasons.get(jobId);
        if (cancellationReason) {
          await this.failJob(
            job,
            new ApiError(499, cancellationReason, undefined, 'CLIENT_CLOSED_REQUEST'),
            durationMs,
            'CLIENT_CLOSED_REQUEST'
          );
        } else {
          await this.failJob(job, error, durationMs);
        }
      } finally {
        this.jobControllers.delete(jobId);
        this.cancelledJobReasons.delete(jobId);
        this.finish(jobId);
      }
    })().catch((error) => {
      this.logger.error({ jobId, err: error }, 'unexpected generation job execution error');
      this.jobControllers.delete(jobId);
      this.cancelledJobReasons.delete(jobId);
    });
  }

  private truncateMetaText(text: string, limit = 160): string {
    const normalised = text?.replace(/\s+/g, ' ').trim();
    if (!normalised) {
      return '';
    }
    if (normalised.length <= limit) {
      return normalised;
    }
    return `${normalised.slice(0, limit - 1)}…`;
  }

  private cloneStyleProfile(profile?: PromptStyleProfile): PromptStyleProfile | undefined {
    if (!profile) {
      return undefined;
    }
    return {
      ...profile,
      authors: Array.isArray(profile.authors) ? [...profile.authors] : profile.authors,
    };
  }

  private adjustPlanningFallback(
    styleProfile: PromptStyleProfile | undefined,
    targetLength: TargetLengthInput,
    level: number
  ): { styleProfile?: PromptStyleProfile; targetLength?: TargetLengthInput } {
    const nextStyle = this.cloneStyleProfile(styleProfile);
    const nextTarget = targetLength ? { ...targetLength } : undefined;

    if (nextStyle) {
      if (level >= 1) {
        if (typeof nextStyle.styleStrength === 'number') {
          nextStyle.styleStrength = Math.min(nextStyle.styleStrength, 0.65);
        } else {
          nextStyle.styleStrength = 0.6;
        }
        if (nextStyle.authors && nextStyle.authors.length > 3) {
          nextStyle.authors = nextStyle.authors.slice(0, 3);
        }
        if (nextStyle.instructions && nextStyle.instructions.length > 200) {
          nextStyle.instructions = this.truncateMetaText(nextStyle.instructions, 200);
        }
      }

      if (level >= 2) {
        nextStyle.styleStrength = Math.min(nextStyle.styleStrength ?? 0.5, 0.5);
        nextStyle.authors = nextStyle.authors ? nextStyle.authors.slice(0, 2) : nextStyle.authors;
        nextStyle.notes = undefined;
        nextStyle.instructions = undefined;
      }
    }

    if (nextTarget) {
      const reduceFactor = level >= 2 ? 0.75 : 0.85;
      const minimum = nextTarget.unit === 'characters' ? 480 : 3;
      nextTarget.value = Math.max(minimum, Math.round(nextTarget.value * reduceFactor));
    }

    if (level >= 3) {
      return { styleProfile: undefined, targetLength: nextTarget };
    }

    return { styleProfile: nextStyle, targetLength: nextTarget };
  }

  private parseChapterMeta(payload: string): ChapterMeta {
    const raw = payload?.trim();
    if (!raw) {
      throw new ChapterMetaParseError('章节元数据返回为空');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      try {
        const repaired = jsonrepair(raw);
        parsed = JSON.parse(repaired);
      } catch (repairError) {
        throw new ChapterMetaParseError('章节元数据 JSON 解析失败');
      }
    }

    try {
      return chapterMetaSchema.parse(parsed);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
        throw new ChapterMetaValidationError('章节元数据未通过模式校验', issues);
      }
      throw error;
    }
  }

  private buildFallbackChapterMeta({
    outlineNode,
    additionalOutline,
    memoryFragments,
    targetLength,
    continuation,
  }: {
    outlineNode?: StoredOutlineNode | null;
    additionalOutline: PromptOutlineNode[];
    memoryFragments: PromptMemoryFragment[];
    targetLength?: TargetLengthInput;
    continuation: boolean;
  }): ChapterMeta {
    const normalisedOutline = outlineNode ? this.normaliseOutlineNode(outlineNode) : undefined;

    const beatsSource = normalisedOutline?.beats?.length
      ? normalisedOutline.beats
      : additionalOutline.find((item) => item.beats && item.beats.length)?.beats
        ?? [];

    const beats: ChapterMeta['outline']['beats'] = beatsSource.map((beat, index) => ({
      order: beat.order ?? index + 1,
      title: beat.title || `节拍${index + 1}`,
      summary: this.truncateMetaText(beat.summary || '补充描写，推进剧情。', 240),
      focus: beat.focus || undefined,
    }));

    while (beats.length < 3) {
      const order = beats.length + 1;
      const templates = [
        { title: '承接前情', summary: '承接上一章节的情节点，点明本章目标。' },
        { title: '主要冲突推进', summary: '通过行动或对话推动冲突升级，揭示关键信息。' },
        { title: '阶段性收束', summary: '给出当前冲突的阶段性结果，并埋下下一章节的悬念。' },
      ];
      const template = templates[Math.min(order - 1, templates.length - 1)];
      beats.push({ order, title: template.title, summary: template.summary });
    }

    const scenes: ChapterMeta['scenes'] = beats.slice(0, Math.max(3, Math.min(5, beats.length))).map((beat, index) => ({
      order: index + 1,
      title: beat.title,
      objective: beat.summary.length > 0 ? this.truncateMetaText(beat.summary, 200) : '推进剧情发展。',
      beatRef: beat.order,
    }));

    while (scenes.length < 2 && beats[scenes.length]) {
      const beat = beats[scenes.length];
      scenes.push({
        order: scenes.length + 1,
        title: beat.title,
        objective: this.truncateMetaText(beat.summary, 200),
        beatRef: beat.order,
      });
    }

    const tabooNotes = memoryFragments
      .filter((fragment) => fragment.type === 'taboo')
      .map((fragment) => this.truncateMetaText(fragment.content, 160))
      .filter(Boolean)
      .slice(0, 4);

    const continuityChecklist = memoryFragments
      .filter((fragment) => fragment.type && fragment.type !== 'taboo')
      .map((fragment) => this.truncateMetaText(`${fragment.label}：保持${fragment.content}`, 200))
      .filter(Boolean)
      .slice(0, 5);

    const fallbackTarget = targetLength
      ? (() => {
          const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
          const lowerBound = targetLength.unit === 'characters' ? 360 : 3;
          const upperBound = targetLength.unit === 'characters' ? 7000 : 20;
          const step = targetLength.unit === 'characters' ? 200 : 1;
          const baseMin = Math.max(lowerBound, Math.round(targetLength.value * 0.7));
          const rawMin = Math.min(baseMin, upperBound - step);
          const rawMaxCandidate = Math.min(
            targetLength.unit === 'characters' ? 6800 : 12,
            Math.round(targetLength.value * 1.2)
          );
          const ensuredMax = Math.min(upperBound, Math.max(rawMaxCandidate, rawMin + step));
          const ideal = clampValue(targetLength.value, rawMin, ensuredMax);
          return {
            unit: targetLength.unit,
            ideal,
            min: rawMin,
            max: ensuredMax,
          };
        })()
      : undefined;

    const outline: ChapterMeta['outline'] = {
      title: normalisedOutline?.title || beats[0]?.title || '章节规划',
      summary: normalisedOutline?.summary
        ? this.truncateMetaText(normalisedOutline.summary, 300)
        : beats[0]?.summary || '根据大纲推进剧情，保持节奏明确。',
      beats,
      tabooNotes: tabooNotes.length ? tabooNotes : undefined,
    };

    const meta: ChapterMeta = {
      outline,
      scenes,
      closingStrategy: continuation
        ? '承接上一章节冲突，使局势发生推进，并为下一章留下悬念。'
        : '在主要冲突后形成阶段性结果，同时埋设下一章节的驱动力。',
      continuityChecklist: continuityChecklist.length ? continuityChecklist : undefined,
      targetLength: fallbackTarget,
    };

    return chapterMetaSchema.parse(meta);
  }

  private async prepareChapterPlan({
    job,
    project,
    outlineNode,
    additionalOutline,
    memoryFragments,
    characters,
    styleProfile,
    continuation,
    previousSummary,
    targetLength,
    instructions,
    model,
  }: {
    job: GenerationJobDocument;
    project: ProjectDocument;
    outlineNode?: StoredOutlineNode | null;
    additionalOutline: PromptOutlineNode[];
    memoryFragments: PromptMemoryFragment[];
    characters: PromptCharacter[];
    styleProfile?: PromptStyleProfile;
    continuation: boolean;
    previousSummary?: string;
    targetLength?: TargetLengthInput;
    instructions?: string;
    model?: string;
  }): Promise<{
    meta: ChapterMeta;
    styleProfile?: PromptStyleProfile;
    targetLength?: TargetLengthInput;
    failures: number;
    retryDurationMs: number;
    usedFallback: boolean;
  }> {
    const maxRetries = 2;
    let effectiveStyle = this.cloneStyleProfile(styleProfile);
    let effectiveTarget = targetLength ? { ...targetLength } : undefined;
    let usedFallback = false;
    let failures = 0;
    let retryStart: number | null = null;
    let meta: ChapterMeta | undefined;

    const outlinePromptNode = outlineNode ? this.normaliseOutlineNode(outlineNode) : null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const prompt = buildChapterMetaPrompt({
          projectTitle: project.name,
          synopsis: project.synopsis,
          outlineNode: outlinePromptNode,
          additionalOutline,
          memoryFragments,
          characters,
          continuation,
          previousSummary,
          targetLength: effectiveTarget,
          instructions,
          fallbackLevel: attempt,
          model,
        });

        const response = await this.openAI.completeChat({
          model: prompt.model,
          temperature: prompt.temperature,
          topP: prompt.topP,
          presencePenalty: prompt.presencePenalty,
          messages: prompt.messages,
          responseFormat: {
            type: 'json_schema',
            json_schema: {
              name: 'chapter_meta_plan',
              strict: true,
              schema: chapterMetaJsonSchema,
            },
          } as Record<string, unknown>,
          metadata: {
            stage: 'chapter_planning',
            projectId: project._id.toString(),
            jobId: job._id.toString(),
            continuation,
          },
        });

        meta = this.parseChapterMeta(response.content);
        break;
      } catch (error) {
        if (error instanceof ChapterMetaParseError || error instanceof ChapterMetaValidationError) {
          failures += 1;
          if (retryStart === null) {
            retryStart = Date.now();
          }
          this.logger.warn({
            jobId: job._id.toString(),
            projectId: project._id.toString(),
            attempt,
            issues: error instanceof ChapterMetaValidationError ? error.issues : undefined,
            message: error.message,
          }, 'chapter planning validation failed');

          if (attempt >= maxRetries) {
            break;
          }

          usedFallback = true;
          const adjustment = this.adjustPlanningFallback(effectiveStyle, effectiveTarget, attempt + 1);
          effectiveStyle = adjustment.styleProfile;
          effectiveTarget = adjustment.targetLength;
          continue;
        }
        throw error;
      }
    }

    if (!meta) {
      usedFallback = true;
      meta = this.buildFallbackChapterMeta({
        outlineNode,
        additionalOutline,
        memoryFragments,
        targetLength: effectiveTarget ?? targetLength,
        continuation,
      });
    }

    const retryDurationMs = retryStart !== null ? Date.now() - retryStart : 0;

    return {
      meta,
      styleProfile: effectiveStyle ?? styleProfile,
      targetLength: effectiveTarget ?? targetLength,
      failures,
      retryDurationMs,
      usedFallback,
    };
  }

  private async failJob(job: GenerationJobDocument, error: unknown, durationMs?: number, code?: string): Promise<void> {
    const serialisedError = this.serialiseError(error);
    job.status = 'failed';
    job.error = serialisedError;
    job.completedAt = new Date();
    await job.save();

    this.logger.error({
      jobId: job.id,
      projectId: job.project?.toString(),
      chapterId: job.chapter?.toString(),
      type: job.type,
      durationMs,
      tokensGenerated: job.tokensGenerated ?? 0,
      completionTokens: job.completionTokens ?? 0,
      promptTokens: job.promptTokens ?? 0,
      cost: job.cost ?? 0,
      retryCount: job.retryCount ?? 0,
      error: serialisedError.message,
      code,
      requestId: this.getJobRequestId(job.metadata),
    }, 'generation job failed');

    const errorPayload: Record<string, unknown> = { message: serialisedError.message };
    if (code) {
      errorPayload.code = code;
    }
    const requestId = this.getJobRequestId(job.metadata);
    if (requestId) {
      errorPayload.requestId = requestId;
    }
    this.emit(job.id, 'error', errorPayload);

    const donePayload: Record<string, unknown> = { jobId: job.id, status: 'failed', retryCount: job.retryCount ?? 0 };
    if (code) {
      donePayload.code = code;
    }
    if (requestId) {
      donePayload.requestId = requestId;
    }
    this.emit(job.id, 'done', donePayload);
  }

  private serialiseError(error: unknown): { message: string; stack?: string } {
    if (error instanceof ApiError) {
      return {
        message: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      };
    }

    return { message: 'Unknown error during generation job' };
  }

  private finish(jobId: string): void {
    this.clearDisconnectTimer(jobId);

    const subscribers = this.streamSubscriptions.get(jobId);
    if (!subscribers) {
      return;
    }

    subscribers.forEach(({ res, heartbeat }) => {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        res.end();
      }
    });

    this.streamSubscriptions.delete(jobId);
  }

  private emit(jobId: string, event: string, payload?: unknown): void {
    const subscribers = this.streamSubscriptions.get(jobId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const serialised = payload === undefined ? '' : JSON.stringify(payload);
    for (const { res } of subscribers) {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${serialised}\n\n`);
      }
    }
  }

  private createOpenAISignal(external?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const timeoutMs = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 60_000);
    let timeout: NodeJS.Timeout | undefined;

    if (timeoutMs > 0) {
      const timeoutError = new Error(`OpenAI request timed out after ${timeoutMs}ms`);
      (timeoutError as Error & { status?: number }).status = 504;
      timeout = setTimeout(() => {
        if (!controller.signal.aborted) {
          controller.abort(timeoutError);
        }
      }, timeoutMs);
      timeout.unref?.();
    }

    const abortFromExternal = () => {
      if (!controller.signal.aborted) {
        if (external?.reason !== undefined) {
          controller.abort(external.reason);
        } else {
          controller.abort();
        }
      }
    };

    if (external) {
      if (external.aborted) {
        abortFromExternal();
      } else {
        external.addEventListener('abort', abortFromExternal, { once: true });
      }
    }

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (external) {
        external.removeEventListener('abort', abortFromExternal);
      }
    };

    controller.signal.addEventListener('abort', cleanup, { once: true });

    return {
      signal: controller.signal,
      cleanup,
    };
  }

  private async streamAndCollect(
    job: GenerationJobDocument,
    options: StreamChapterOptions,
    targetLength?: TargetLengthInput
  ): Promise<{ content: string; usage?: UsageRecord; model: string; estimatedTokens: number; requestId?: string }> {
    let tokensGenerated = 0;
    let lastProgress = 0;
    let requestId: string | undefined;

    const { signal, cleanup } = this.createOpenAISignal(options.signal);

    const getEffectiveRequestId = () => requestId ?? this.getJobRequestId(job.metadata);

    try {
      const streamResult = await this.openAI.streamChapter({
        ...options,
        signal,
        onRequestId: (value: string) => {
          requestId = value;
          this.setJobRequestId(job, value);
        },
        onDelta: (delta: string) => {
          tokensGenerated += this.estimateTokens(delta);
          const progress = this.estimateProgress(tokensGenerated, targetLength);
          if (progress > lastProgress) {
            lastProgress = progress;
            job.progress = progress;
            const progressPayload: Record<string, unknown> = {
              jobId: job.id,
              progress,
              tokensGenerated,
              retryCount: job.retryCount ?? 0,
            };
            const effectiveRequestId = getEffectiveRequestId();
            if (effectiveRequestId) {
              progressPayload.requestId = effectiveRequestId;
            }
            this.emit(job.id, 'progress', progressPayload);
          }
          const deltaPayload: Record<string, unknown> = {
            text: delta,
            retryCount: job.retryCount ?? 0,
          };
          const effectiveRequestId = getEffectiveRequestId();
          if (effectiveRequestId) {
            deltaPayload.requestId = effectiveRequestId;
          }
          this.emit(job.id, 'delta', deltaPayload);
        },
      });

      if (streamResult.usage) {
        tokensGenerated = Math.max(tokensGenerated, streamResult.usage.completionTokens);
      }

      job.tokensGenerated = tokensGenerated;
      job.progress = Math.max(job.progress ?? 0, lastProgress);

      if (streamResult.requestId) {
        requestId = streamResult.requestId;
        this.setJobRequestId(job, streamResult.requestId);
      }

      return {
        content: streamResult.content,
        usage: streamResult.usage,
        model: streamResult.model,
        estimatedTokens: tokensGenerated,
        requestId: getEffectiveRequestId(),
      };
    } finally {
      cleanup();
    }
  }

  private applyUsageToJob(
    job: GenerationJobDocument,
    usage: UsageRecord | undefined,
    estimatedTokens: number,
    model: string
  ): void {
    job.tokensGenerated = usage?.completionTokens ?? estimatedTokens;
    job.promptTokens = usage?.promptTokens ?? job.promptTokens ?? 0;
    job.completionTokens = usage?.completionTokens ?? job.completionTokens ?? estimatedTokens;
    job.model = model;
    const cost = this.calculateCost(usage);
    if (cost > 0) {
      job.cost = cost;
    }
    job.progress = 100;
  }

  private calculateCost(usage?: UsageRecord): number {
    if (!usage || this.costPer1KTokens <= 0) {
      return 0;
    }
    return Number(((usage.totalTokens / 1000) * this.costPer1KTokens).toFixed(4));
  }

  private estimateTokens(text: string): number {
    if (!text.trim()) {
      return 0;
    }
    const wordLikeSegments = text.trim().split(/\s+/).filter(Boolean).length;
    if (wordLikeSegments > 1) {
      return wordLikeSegments;
    }
    return Math.max(1, Math.round(text.length / CHARACTER_TOKEN_RATIO));
  }

  private estimateProgress(tokensGenerated: number, targetLength?: TargetLengthInput): number {
    if (!targetLength) {
      return Math.min(95, Math.round(Math.log(tokensGenerated + 1) * 18));
    }

    const targetTokens = targetLength.unit === 'paragraphs'
      ? targetLength.value * TARGET_PARAGRAPH_TOKEN_ESTIMATE
      : Math.max(1, Math.round(targetLength.value / CHARACTER_TOKEN_RATIO));

    if (targetTokens <= 0) {
      return Math.min(99, tokensGenerated);
    }

    return Math.min(99, Math.round((tokensGenerated / targetTokens) * 100));
  }

  private normaliseOutlineNode(node: StoredOutlineNode): PromptOutlineNode {
    return {
      id: node.nodeId,
      key: node.nodeId,
      title: node.title,
      summary: node.summary,
      order: node.order ?? 0,
      status: node.status ?? undefined,
      tags: Array.isArray(node.tags) ? node.tags : undefined,
      beats: (node.beats ?? []).map((beat) => ({
        id: beat.beatId,
        title: beat.title,
        summary: beat.summary,
        order: beat.order ?? 0,
        focus: beat.focus,
        outcome: beat.outcome,
      })),
    };
  }

  private async generateChapterTitle(projectId: Types.ObjectId): Promise<string> {
    const count = await ChapterModel.countDocuments({ project: projectId });
    return `章节 ${count + 1}`;
  }

  private async loadOutlineNodes(project: ProjectDocument): Promise<StoredOutlineNode[]> {
    const docs = await OutlineNodeModel.find({ project: project._id })
      .sort({ order: 1, createdAt: 1 })
      .lean<StoredOutlineNode[]>();

    if (docs.length > 0) {
      return docs;
    }

    if (!Array.isArray(project.outlineNodes) || project.outlineNodes.length === 0) {
      return [];
    }

    return project.outlineNodes.map((legacyNode, index) => {
      const node = legacyNode as unknown as {
        key?: string;
        title?: string;
        summary?: string;
        order?: number;
        metadata?: Record<string, unknown> | null;
      };
      return {
        project: project._id,
        nodeId: node.key || `${project._id.toString()}-${index}`,
        parentId: null,
        order: node.order ?? index,
        title: node.title ?? `大纲节点 ${index + 1}`,
        summary: node.summary ?? '',
        beats: [],
        status: 'legacy',
        tags: [],
        meta: node.metadata ?? null,
        createdAt: undefined,
        updatedAt: undefined,
      } as unknown as StoredOutlineNode;
    });
  }

  private findOutlineNode(nodes: StoredOutlineNode[], outlineNodeId?: string | null): StoredOutlineNode | null {
    if (!outlineNodeId) {
      return null;
    }
    return nodes.find((node) => node.nodeId === outlineNodeId) ?? null;
  }

  private buildAdditionalOutline(nodes: StoredOutlineNode[], current: StoredOutlineNode): PromptOutlineNode[] {
    const related: PromptOutlineNode[] = [];

    if (current.parentId) {
      const parent = nodes.find((node) => node.nodeId === current.parentId);
      if (parent) {
        related.push(this.normaliseOutlineNode(parent));
      }
    }

    const siblings = nodes
      .filter((node) => node.parentId === (current.parentId ?? null) && node.nodeId !== current.nodeId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    siblings.forEach((node) => related.push(this.normaliseOutlineNode(node)));

    const children = nodes
      .filter((node) => node.parentId === current.nodeId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    children.forEach((node) => related.push(this.normaliseOutlineNode(node)));

    return this.dedupeOutline(related).slice(0, 16);
  }

  private buildRootOutlineContext(nodes: StoredOutlineNode[]): PromptOutlineNode[] {
    const roots = nodes
      .filter((node) => !node.parentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const context = roots.map((node) => this.normaliseOutlineNode(node));
    return this.dedupeOutline(context).slice(0, 16);
  }

  private dedupeOutline(nodes: PromptOutlineNode[]): PromptOutlineNode[] {
    const seen = new Set<string>();
    const result: PromptOutlineNode[] = [];
    nodes.forEach((node) => {
      const identifier = (node.id ?? node.key ?? node.title ?? '').toString();
      if (identifier && seen.has(identifier)) {
        return;
      }
      if (identifier) {
        seen.add(identifier);
      }
      result.push(node);
    });
    return result;
  }

  private async resolveMemoryFragments(
    project: ProjectDocument,
    memoryIds?: string[],
    inlineFragments?: MemoryFragmentInput
  ): Promise<PromptMemoryFragment[]> {
    const pipelineFragments = this.memoryService
      ? await this.memoryService.getPromptFragments(project._id)
      : await MemoryModel.find({ project: project._id })
          .sort({ weight: -1, updatedAt: -1 })
          .limit(36)
          .lean()
          .then((docs) => docs.map((doc) => this.fromStoredMemory(doc)));

    const bankFragments = (project.memoryBank || []).map((fragment) => ({
      label: fragment.label || fragment.key || '记忆',
      content: fragment.content || '',
      type: fragment.metadata?.type ? String(fragment.metadata.type) : 'fact',
      tags: fragment.tags || [],
    }));

    const selectedFragments = memoryIds?.length
      ? this.memoryService
        ? await this.memoryService.getPromptFragmentsByIds(project._id, memoryIds)
        : await MemoryModel.find({
            _id: { $in: memoryIds },
            project: project._id,
          })
            .lean()
            .then((docs) => docs.map((doc) => this.fromStoredMemory(doc)))
      : [];

    const inline: PromptMemoryFragment[] = (inlineFragments || []).map((fragment) => ({
      label: fragment.label,
      content: fragment.content,
      type: fragment.type,
      tags: fragment.tags,
      strength: fragment.strength,
    }));

    return this.deduplicateMemoryFragments([
      ...pipelineFragments,
      ...bankFragments,
      ...selectedFragments,
      ...inline,
    ]);
  }

  private deduplicateMemoryFragments(fragments: PromptMemoryFragment[]): PromptMemoryFragment[] {
    const seen = new Set<string>();
    const result: PromptMemoryFragment[] = [];
    fragments.forEach((fragment) => {
      const key = `${fragment.label}::${fragment.content}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(fragment);
      }
    });
    return result.slice(0, 50);
  }

  private async resolveCharacters(
    project: ProjectDocument,
    characterIds?: string[]
  ): Promise<PromptCharacter[]> {
    if (!characterIds?.length) {
      return [];
    }

    const docs = await CharacterModel.find({
      _id: { $in: characterIds },
      project: project._id,
    })
      .lean<(CharacterAttributes & { _id: Types.ObjectId })[]>();

    const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]));
    return characterIds
      .map((id) => byId.get(id))
      .filter((doc): doc is CharacterAttributes & { _id: Types.ObjectId } => Boolean(doc))
      .map((doc) => this.fromStoredCharacter(doc));
  }

  private fromStoredCharacter(character: CharacterAttributes & { _id?: Types.ObjectId }): PromptCharacter {
    return {
      id: character._id ? character._id.toString() : undefined,
      name: character.name,
      role: character.role || undefined,
      background: character.background || undefined,
      goals: character.goals || undefined,
      conflicts: character.conflicts || undefined,
      quirks: character.quirks || undefined,
      voice: character.voice || undefined,
      notes: character.notes || undefined,
    };
  }

  private fromStoredMemory(doc: { key: string; content: string; type?: string; weight?: number }): PromptMemoryFragment {
    const type = (doc.type as PromptMemoryFragment['type']) ?? 'fact';
    const labelMap: Record<string, string> = {
      world: '世界设定',
      fact: '剧情事实',
      prior_summary: '章节概要',
      taboo: '禁忌事项',
    };
    const prefix = labelMap[type as string] ?? '记忆片段';
    return {
      label: `【${prefix}】${doc.key}`,
      content: doc.content,
      type,
      strength: this.weightToStrength(doc.weight),
    };
  }

  private weightToStrength(weight?: number): string | undefined {
    if (typeof weight !== 'number') {
      return undefined;
    }
    if (weight >= 0.75) {
      return 'high';
    }
    if (weight >= 0.5) {
      return 'medium';
    }
    if (weight > 0) {
      return 'low';
    }
    return undefined;
  }

  private async resolveStyleProfile(
    project: ProjectDocument,
    styleProfileId?: string,
    overrides?: StyleOverrideInput
  ): Promise<PromptStyleProfile | undefined> {
    const base: (PromptStyleProfile & { name?: string }) = project.styleProfile
      ? this.fromProjectStyleProfile(project.styleProfile)
      : {};

    if (styleProfileId) {
      const styleProfileDoc = await StyleProfileModel.findOne({ _id: styleProfileId, project: project._id });
      if (!styleProfileDoc) {
        throw new ApiError(404, 'Style profile not found for project');
      }
      Object.assign(base, this.fromStoredStyleProfile(styleProfileDoc));
    }

    if (overrides) {
      if (overrides.tone !== undefined) {
        base.tone = overrides.tone?.trim() || undefined;
      }
      if (overrides.pacing !== undefined) {
        base.pacing = overrides.pacing?.trim() || undefined;
      }
      if (overrides.pov !== undefined) {
        base.pov = overrides.pov?.trim() || undefined;
      }
      if (overrides.diction !== undefined) {
        base.diction = overrides.diction?.trim() || undefined;
      }
      if (overrides.authors) {
        base.authors = overrides.authors.map((author) => author.trim()).filter(Boolean);
      }
      if (overrides.language !== undefined) {
        base.language = overrides.language?.trim() || undefined;
      }
      if (overrides.notes !== undefined) {
        base.notes = overrides.notes?.trim() || undefined;
      }
      if (overrides.instructions !== undefined) {
        base.instructions = overrides.instructions?.trim() || undefined;
      }
      if (typeof overrides.styleStrength === 'number') {
        base.styleStrength = overrides.styleStrength;
      } else if (typeof overrides.strength === 'number') {
        base.styleStrength = overrides.strength;
      }
    }

    const hasDetail =
      (base.tone && base.tone.trim())
      || (base.pacing && base.pacing.trim())
      || (base.pov && base.pov.trim())
      || (base.diction && base.diction.trim())
      || (base.authors && base.authors.length > 0)
      || typeof base.styleStrength === 'number'
      || (base.instructions && base.instructions.trim())
      || (base.notes && base.notes.trim());

    const language = base.language?.trim();

    if (!hasDetail && !language) {
      return undefined;
    }

    const normalised: PromptStyleProfile & { name?: string } = {};

    if (base.tone?.trim()) {
      normalised.tone = base.tone.trim();
    }
    if (base.pacing?.trim()) {
      normalised.pacing = base.pacing.trim();
    }
    if (base.pov?.trim()) {
      normalised.pov = base.pov.trim();
    }
    if (base.diction?.trim()) {
      normalised.diction = base.diction.trim();
    }
    if (base.authors?.length) {
      normalised.authors = base.authors.filter(Boolean);
    }
    if (typeof base.styleStrength === 'number') {
      normalised.styleStrength = Math.min(Math.max(base.styleStrength, 0), 1);
    }
    if (base.instructions?.trim()) {
      normalised.instructions = base.instructions.trim();
    }
    if (base.notes?.trim()) {
      normalised.notes = base.notes.trim();
    }
    if ((base as { name?: string }).name) {
      normalised.name = (base as { name?: string }).name;
    }

    normalised.language = language || '中文';

    return normalised;
  }

  private fromProjectStyleProfile(style: ProjectStyleProfile): PromptStyleProfile & { name?: string } {
    return {
      tone: style.tone?.trim() || undefined,
      pacing: style.pacing?.trim() || undefined,
      pov: style.pov?.trim() || undefined,
      diction: style.diction?.trim() || undefined,
      authors: Array.isArray(style.authors)
        ? style.authors.map((author) => author.trim()).filter(Boolean)
        : undefined,
      styleStrength: typeof style.styleStrength === 'number' ? style.styleStrength : undefined,
      language: style.language?.trim() || undefined,
      notes: style.notes?.trim() || undefined,
    };
  }

  private fromStoredStyleProfile(profile: StyleProfileDocument | StyleProfileAttributes): PromptStyleProfile & { name?: string } {
    return {
      name: 'name' in profile ? profile.name : undefined,
      tone: profile.tone?.trim() || undefined,
      pacing: profile.pacing?.trim() || undefined,
      pov: profile.pov?.trim() || undefined,
      diction: profile.diction?.trim() || undefined,
      authors: Array.isArray(profile.authors)
        ? profile.authors.map((author) => (typeof author === 'string' ? author.trim() : '')).filter(Boolean)
        : undefined,
      styleStrength: typeof profile.styleStrength === 'number' ? profile.styleStrength : undefined,
      language: profile.language?.trim() || undefined,
      notes: 'notes' in profile ? profile.notes?.trim() || undefined : undefined,
    };
  }

  private async persistNewChapter({
    projectId,
    jobId,
    chapterTitle,
    outlineNode,
    context,
    content,
    meta,
  }: {
    projectId: Types.ObjectId;
    jobId: Types.ObjectId;
    chapterTitle: string;
    outlineNode: StoredOutlineNode;
    context: {
      memoryFragments: PromptMemoryFragment[];
      characters: PromptCharacter[];
      styleProfile?: PromptStyleProfile;
    };
    content: string;
    meta?: ChapterMeta;
  }) {
    const order = (await ChapterModel.countDocuments({ project: projectId })) + 1;
    return ChapterModel.create({
      project: projectId,
      title: chapterTitle,
      order,
      synopsis: outlineNode.summary,
      content,
      versions: [
        {
          version: 1,
          content,
          metadata: {
            outlineNodeId: outlineNode.nodeId,
            memory: context.memoryFragments,
            characters: context.characters,
            styleProfile: context.styleProfile,
            chapterMeta: meta,
          },
          job: jobId,
        },
      ],
    });
  }

  private async persistContinuation({
    chapter,
    jobId,
    continuation,
    context,
    meta,
  }: {
    chapter: Chapter;
    jobId: Types.ObjectId;
    continuation: string;
    context: {
      memoryFragments: PromptMemoryFragment[];
      characters: PromptCharacter[];
      styleProfile?: PromptStyleProfile;
    };
    meta?: ChapterMeta;
  }) {
    const updatedContent = chapter.content
      ? `${chapter.content.trimEnd()}\n\n${continuation.trim()}`
      : continuation.trim();

    const versionNumber = (chapter.versions?.length || 0) + 1;
    chapter.content = updatedContent;
    chapter.versions.push({
      version: versionNumber,
      content: updatedContent,
      delta: continuation,
      metadata: {
        memory: context.memoryFragments,
        characters: context.characters,
        styleProfile: context.styleProfile,
        chapterMeta: meta,
      },
      job: jobId,
    });
    await chapter.save();
    return chapter;
  }

  private async triggerMemorySync({
    project,
    chapterId,
    chapterTitle,
    content,
    chapterOrder,
  }: {
    project: ProjectDocument;
    chapterId: Types.ObjectId;
    chapterTitle?: string;
    content: string;
    chapterOrder?: number;
  }): Promise<void> {
    if (!this.memoryService) {
      return;
    }

    try {
      await this.memoryService.syncFromChapter({
        projectId: project._id,
        projectName: project.name,
        synopsis: project.synopsis,
        chapterId,
        chapterTitle,
        chapterContent: content,
        chapterOrder,
      });
    } catch (error) {
      console.error('[GenerationService] Memory extraction failed', error);
    }
  }

  private summariseText(text: string | undefined | null, maxLength = 640): string | undefined {
    if (!text) {
      return undefined;
    }
    const normalised = text.replace(/\s+/g, ' ').trim();
    if (normalised.length <= maxLength) {
      return normalised;
    }
    return `${normalised.slice(0, maxLength - 1)}…`;
  }
}

export default GenerationService;
