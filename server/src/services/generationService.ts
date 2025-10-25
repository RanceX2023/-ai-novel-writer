import { Response } from 'express';
import { Types } from 'mongoose';
import ApiError from '../utils/ApiError';
import ChapterModel, { Chapter } from '../models/Chapter';
import GenJobModel, { GenerationJobDocument } from '../models/GenJob';
import ProjectModel, { ProjectDocument, OutlineNode, StyleProfile as ProjectStyleProfile } from '../models/Project';
import MemoryModel from '../models/Memory';
import StyleProfileModel, { StyleProfileAttributes, StyleProfileDocument } from '../models/StyleProfile';
import OpenAIService, { StreamChapterOptions, UsageRecord } from './openai';
import MemoryService from './memoryService';
import { ChapterContinuationInput, ChapterGenerationInput } from '../validators/chapter';
import { PromptMemoryFragment, PromptStyleProfile } from '../utils/promptTemplates';

const HEARTBEAT_INTERVAL_MS = 15_000;
const TARGET_PARAGRAPH_TOKEN_ESTIMATE = 80;
const CHARACTER_TOKEN_RATIO = 3.2;

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

  private costPer1KTokens: number;

  constructor({ openAIService, memoryService }: { openAIService?: OpenAIService; memoryService?: MemoryService } = {}) {
    this.openAI = openAIService ?? new OpenAIService();
    this.memoryService = memoryService;
    this.streamSubscriptions = new Map();
    this.jobControllers = new Map();
    this.costPer1KTokens = Number(process.env.OPENAI_COST_PER_1K_TOKENS ?? '0') || 0;
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
    this.streamSubscriptions.get(jobId)!.add(subscription);

    res.on('close', () => {
      clearInterval(heartbeat);
      const subscribers = this.streamSubscriptions.get(jobId);
      subscribers?.delete(subscription);
      if (!subscribers || subscribers.size === 0) {
        this.streamSubscriptions.delete(jobId);
      }
    });
  }

  async createChapterGenerationJob(
    projectId: string,
    payload: ChapterGenerationInput
  ): Promise<GenerationJobDocument> {
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    const outlineNode = this.findOutlineNode(project, payload.outlineNodeId);
    if (!outlineNode) {
      throw new ApiError(404, 'Outline node not found for project');
    }

    const styleProfile = await this.resolveStyleProfile(project, payload.styleProfileId, payload.styleOverride);
    const memoryFragments = await this.resolveMemoryFragments(project, payload.memoryIds, payload.memoryFragments);

    const job = await GenJobModel.create({
      project: project._id,
      type: 'chapter_generation',
      status: 'queued',
      metadata: {
        outlineNodeId: payload.outlineNodeId,
        styleProfileId: payload.styleProfileId,
        memoryIds: payload.memoryIds,
        targetLength: payload.targetLength,
        instructions: payload.instructions,
      },
    });

    const additionalOutline = (project.outlineNodes || []).filter((node) => node !== outlineNode);

    this.executeJob(job._id.toString(), async ({ job, signal }) => {
      const chapterTitle = outlineNode.title || (await this.generateChapterTitle(project._id));
      const promptOptions: StreamChapterOptions = {
        projectTitle: project.name,
        synopsis: project.synopsis,
        chapterTitle,
        outlineNode: this.normaliseOutlineNode(outlineNode),
        additionalOutline: additionalOutline.map((node) => this.normaliseOutlineNode(node)),
        memoryFragments,
        styleProfile,
        continuation: false,
        targetLength: payload.targetLength,
        instructions: payload.instructions,
        signal,
      };

      const streamResult = await this.streamAndCollect(job, promptOptions, payload.targetLength);

      const chapterDoc = await this.persistNewChapter({
        projectId: project._id,
        jobId: job._id,
        chapterTitle,
        outlineNode,
        context: {
          memoryFragments,
          styleProfile,
        },
        content: streamResult.content,
      });

      job.chapter = chapterDoc._id;
      job.result = {
        chapterId: chapterDoc._id,
        version: 1,
        content: chapterDoc.content,
      };
      job.markModified('result');

      await this.triggerMemorySync({
        project,
        chapterId: chapterDoc._id,
        chapterTitle,
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

    const outlineNode = payload.outlineNodeId
      ? this.findOutlineNode(project, payload.outlineNodeId)
      : null;

    const styleProfile = await this.resolveStyleProfile(project, payload.styleProfileId, payload.styleOverride);
    const memoryFragments = await this.resolveMemoryFragments(project, payload.memoryIds, payload.memoryFragments);

    const job = await GenJobModel.create({
      project: project._id,
      chapter: chapter._id,
      type: 'chapter_continuation',
      status: 'queued',
      metadata: {
        outlineNodeId: payload.outlineNodeId,
        styleProfileId: payload.styleProfileId,
        memoryIds: payload.memoryIds,
        targetLength: payload.targetLength,
        instructions: payload.instructions,
      },
    });

    const additionalOutline = outlineNode
      ? (project.outlineNodes || []).filter((node) => node !== outlineNode)
      : project.outlineNodes || [];

    this.executeJob(job._id.toString(), async ({ job, signal }) => {
      const promptOptions: StreamChapterOptions = {
        projectTitle: project.name,
        synopsis: project.synopsis,
        chapterTitle: chapter.title,
        outlineNode: outlineNode ? this.normaliseOutlineNode(outlineNode) : undefined,
        additionalOutline: additionalOutline.map((node) => this.normaliseOutlineNode(node)),
        memoryFragments,
        styleProfile,
        continuation: true,
        previousSummary: this.summariseText(chapter.content),
        targetLength: payload.targetLength,
        instructions: payload.instructions,
        signal,
      };

      const streamResult = await this.streamAndCollect(job, promptOptions, payload.targetLength);
      const updatedChapter = await this.persistContinuation({
        chapter,
        jobId: job._id,
        continuation: streamResult.content,
        context: {
          memoryFragments,
          styleProfile,
        },
      });

      job.result = {
        chapterId: updatedChapter._id,
        version: updatedChapter.versions[updatedChapter.versions.length - 1]?.version,
        content: updatedChapter.content,
        delta: streamResult.content,
      };
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
        return;
      }

      job.status = 'running';
      job.startedAt = new Date();
      await job.save();
      this.emit(jobId, 'start', { jobId, status: 'running' });

      const startedAt = Date.now();

      try {
        await handler({ job, signal: controller.signal });

        job.status = 'completed';
        job.completedAt = new Date();
        job.progress = 100;
        await job.save();

        this.emit(jobId, 'done', {
          jobId,
          status: 'completed',
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        await this.failJob(job, error);
      } finally {
        this.finish(jobId);
        this.jobControllers.delete(jobId);
      }
    })().catch((error) => {
      console.error('[GenerationService] Unexpected job execution error', error);
      this.jobControllers.delete(jobId);
    });
  }

  private async failJob(job: GenerationJobDocument, error: unknown): Promise<void> {
    const serialisedError = this.serialiseError(error);
    job.status = 'failed';
    job.error = serialisedError;
    job.completedAt = new Date();
    await job.save();

    this.emit(job.id, 'error', { message: serialisedError.message });
    this.emit(job.id, 'done', { jobId: job.id, status: 'failed' });
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

  private async streamAndCollect(
    job: GenerationJobDocument,
    options: StreamChapterOptions,
    targetLength?: TargetLengthInput
  ): Promise<{ content: string; usage?: UsageRecord; model: string; estimatedTokens: number }> {
    let tokensGenerated = 0;
    let lastProgress = 0;

    const streamResult = await this.openAI.streamChapter({
      ...options,
      onDelta: (delta: string) => {
        tokensGenerated += this.estimateTokens(delta);
        const progress = this.estimateProgress(tokensGenerated, targetLength);
        if (progress > lastProgress) {
          lastProgress = progress;
          job.progress = progress;
          this.emit(job.id, 'progress', {
            jobId: job.id,
            progress,
            tokensGenerated,
          });
        }
        this.emit(job.id, 'delta', { text: delta });
      },
    });

    if (streamResult.usage) {
      tokensGenerated = Math.max(tokensGenerated, streamResult.usage.completionTokens);
    }

    job.tokensGenerated = tokensGenerated;
    job.progress = Math.max(job.progress ?? 0, lastProgress);

    return {
      content: streamResult.content,
      usage: streamResult.usage,
      model: streamResult.model,
      estimatedTokens: tokensGenerated,
    };
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

  private normaliseOutlineNode(node: OutlineNode): PromptOutlineNode {
    return {
      id: node.key,
      key: node.key,
      title: node.title,
      summary: node.summary,
      order: node.order,
    };
  }

  private async generateChapterTitle(projectId: Types.ObjectId): Promise<string> {
    const count = await ChapterModel.countDocuments({ project: projectId });
    return `章节 ${count + 1}`;
  }

  private findOutlineNode(project: ProjectDocument, outlineNodeId: string): OutlineNode | null {
    if (!Array.isArray(project.outlineNodes)) {
      return null;
    }
    return (
      project.outlineNodes.find((node) => node.key === outlineNodeId || (node as unknown as { id?: string }).id === outlineNodeId)
      || null
    );
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
    const baseProfile: PromptStyleProfile = project.styleProfile
      ? this.fromProjectStyleProfile(project.styleProfile)
      : {};

    if (styleProfileId) {
      const styleProfileDoc = await StyleProfileModel.findOne({ _id: styleProfileId, project: project._id });
      if (!styleProfileDoc) {
        throw new ApiError(404, 'Style profile not found for project');
      }
      Object.assign(baseProfile, this.fromStoredStyleProfile(styleProfileDoc));
    }

    if (overrides) {
      Object.assign(baseProfile, overrides);
    }

    if (Object.keys(baseProfile).length === 0) {
      return undefined;
    }

    if (!baseProfile.language) {
      baseProfile.language = '中文';
    }

    return baseProfile;
  }

  private fromProjectStyleProfile(style: ProjectStyleProfile): PromptStyleProfile {
    return {
      tone: style.tone,
      voice: style.voice,
      mood: style.mood,
      pacing: style.pacing,
      pov: style.pov,
      genre: style.genre,
      instructions: style.instructions,
      language: '中文',
    };
  }

  private fromStoredStyleProfile(profile: StyleProfileDocument | StyleProfileAttributes): PromptStyleProfile {
    return {
      name: 'name' in profile ? profile.name : undefined,
      tone: profile.tone,
      voice: profile.voice,
      mood: profile.mood,
      pacing: profile.pacing,
      pov: profile.pov,
      genre: profile.genre,
      instructions: profile.instructions,
      strength: profile.strength,
      language: profile.language,
    } as PromptStyleProfile;
  }

  private async persistNewChapter({
    projectId,
    jobId,
    chapterTitle,
    outlineNode,
    context,
    content,
  }: {
    projectId: Types.ObjectId;
    jobId: Types.ObjectId;
    chapterTitle: string;
    outlineNode: OutlineNode;
    context: {
      memoryFragments: PromptMemoryFragment[];
      styleProfile?: PromptStyleProfile;
    };
    content: string;
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
            outlineNodeId: outlineNode.key,
            memory: context.memoryFragments,
            styleProfile: context.styleProfile,
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
  }: {
    chapter: Chapter;
    jobId: Types.ObjectId;
    continuation: string;
    context: {
      memoryFragments: PromptMemoryFragment[];
      styleProfile?: PromptStyleProfile;
    };
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
        styleProfile: context.styleProfile,
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
