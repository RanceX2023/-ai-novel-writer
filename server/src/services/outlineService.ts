import { Types } from 'mongoose';
import { ZodError } from 'zod';
import { jsonrepair } from 'jsonrepair';
import ApiError from '../utils/ApiError';
import ProjectModel, { ProjectDocument, StyleProfile as ProjectStyleProfile } from '../models/Project';
import OutlineNodeModel, { OutlineBeat, OutlineNode } from '../models/OutlineNode';
import OpenAIService from './openai';
import MemoryService from './memoryService';
import { PromptMemoryFragment, PromptStyleProfile } from '../utils/promptTemplates';
import {
  OutlineGenerateInput,
  OutlineAiResponse,
  outlineAiResponseSchema,
  OutlineAiAct,
  OutlineAiChapter,
  OutlineAiBeat,
  OutlineNodeUpsertInput,
  OutlineReorderInput,
} from '../validators/outline';
import { buildOutlinePrompt } from '../utils/outlinePrompt';

export interface OutlineTreeNode {
  nodeId: string;
  parentId: string | null;
  order: number;
  title: string;
  summary: string;
  status: string | null;
  tags: string[];
  beats: OutlineBeat[];
  meta: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
  children: OutlineTreeNode[];
}

interface OutlineNodeWritePayload {
  project: Types.ObjectId;
  nodeId: string;
  parentId: string | null;
  order: number;
  title: string;
  summary: string;
  status: string | null;
  tags: string[];
  beats: OutlineBeat[];
  meta: Record<string, unknown> | null;
}

class OutlineService {
  private openAI: OpenAIService;

  private memoryService?: MemoryService;

  constructor({ openAIService, memoryService }: { openAIService?: OpenAIService; memoryService?: MemoryService } = {}) {
    this.openAI = openAIService ?? new OpenAIService();
    this.memoryService = memoryService;
  }

  async generateOutline(projectId: string, input: OutlineGenerateInput): Promise<OutlineTreeNode[]> {
    const project = await this.loadProject(projectId);
    const styleProfile = this.resolveStyleProfile(project, input.styleStrength);
    const memoryFragments = await this.resolveMemoryFragments(project._id);

    const promptOptions = buildOutlinePrompt({
      ...input,
      projectTitle: project.name,
      synopsis: project.synopsis ?? undefined,
      styleProfile,
      memoryFragments,
    });

    if (input.model) {
      promptOptions.model = input.model;
    }

    const completion = await this.openAI.completeChat({
      ...promptOptions,
      metadata: {
        ...(promptOptions.metadata ?? {}),
        projectId: project._id.toString(),
        actStructure: input.actStructure,
        chapterCount: input.chapterCount,
      },
    });

    const validated = this.parseAiResponse(completion.content);

    const writePayload = this.flattenOutline(project._id, validated, input);

    await OutlineNodeModel.deleteMany({ project: project._id });
    if (writePayload.length) {
      await OutlineNodeModel.insertMany(writePayload, { ordered: true });
    }

    return this.getOutlineTree(project._id);
  }

  async getOutlineTree(projectId: string | Types.ObjectId): Promise<OutlineTreeNode[]> {
    const projectObjectId = this.ensureObjectId(projectId);
    const docs = await OutlineNodeModel.find({ project: projectObjectId })
      .sort({ order: 1, createdAt: 1 })
      .lean<OutlineNode[]>();

    const lookup = new Map<string, OutlineTreeNode>();
    const roots: OutlineTreeNode[] = [];

    docs.forEach((doc) => {
      const node: OutlineTreeNode = {
        nodeId: doc.nodeId,
        parentId: doc.parentId ?? null,
        order: doc.order ?? 0,
        title: doc.title,
        summary: doc.summary ?? '',
        status: doc.status ?? null,
        tags: Array.isArray(doc.tags) ? doc.tags.map((tag) => String(tag)) : [],
        beats: (doc.beats ?? []).map((beat) => ({
          beatId: beat.beatId,
          title: beat.title,
          summary: beat.summary,
          order: beat.order,
          focus: beat.focus,
          outcome: beat.outcome,
          status: beat.status,
          tags: Array.isArray(beat.tags) ? beat.tags.map((tag) => String(tag)) : [],
          meta: beat.meta ?? null,
        })),
        meta: doc.meta ? (typeof doc.meta === 'object' ? (doc.meta as Record<string, unknown>) : { value: doc.meta }) : null,
        createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
        children: [],
      };
      lookup.set(node.nodeId, node);
    });

    lookup.forEach((node) => {
      if (node.parentId && lookup.has(node.parentId)) {
        const parent = lookup.get(node.parentId)!;
        parent.children.push(node);
      } else {
        node.parentId = null;
        roots.push(node);
      }
    });

    const sortNodes = (nodes: OutlineTreeNode[]) => {
      nodes.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
      nodes.forEach((child) => sortNodes(child.children));
    };

    sortNodes(roots);
    return roots;
  }

  async upsertNode(projectId: string, input: OutlineNodeUpsertInput): Promise<OutlineTreeNode> {
    const projectObjectId = this.ensureObjectId(projectId);
    const parentId = 'parentId' in input ? (input.parentId ?? null) : undefined;
    const tags = this.normaliseTags(input.tags);
    const beats = this.normaliseBeats(input.beats ?? [], input.nodeId);

    if (input.nodeId) {
      const existing = await OutlineNodeModel.findOne({ project: projectObjectId, nodeId: input.nodeId });
      if (!existing) {
        throw new ApiError(404, '未找到对应的大纲节点');
      }

      existing.title = input.title;
      existing.summary = input.summary ?? '';
      existing.status = input.status ?? existing.status ?? 'draft';
      existing.tags = tags;
      existing.beats = beats;
      existing.meta = input.meta ?? null;
      if (parentId !== undefined) {
        existing.parentId = parentId;
      }
      if (typeof (input as OutlineNodeUpsertInput & { order?: number }).order === 'number') {
        existing.order = (input as OutlineNodeUpsertInput & { order?: number }).order as number;
      }
      await existing.save();

      return this.toTreeNode(existing.toObject());
    }

    const resolvedParent = parentId ?? null;
    const nodeId = this.generateNodeId('outline');
    const order = await this.nextOrder(projectObjectId, resolvedParent);

    const created = await OutlineNodeModel.create({
      project: projectObjectId,
      nodeId,
      parentId: resolvedParent,
      order,
      title: input.title,
      summary: input.summary ?? '',
      status: input.status ?? 'draft',
      tags,
      beats,
      meta: input.meta ?? null,
    });

    return this.toTreeNode(created.toObject());
  }

  async reorderNodes(projectId: string, input: OutlineReorderInput): Promise<void> {
    const projectObjectId = this.ensureObjectId(projectId);

    if (!input.updates.length) {
      return;
    }

    const bulkOps = input.updates.map((update) => ({
      updateOne: {
        filter: { project: projectObjectId, nodeId: update.nodeId },
        update: {
          $set: {
            parentId: update.parentId ?? null,
            order: update.order,
          },
        },
      },
    }));

    await OutlineNodeModel.bulkWrite(bulkOps, { ordered: false });
  }

  async deleteNode(projectId: string, nodeId: string): Promise<number> {
    const projectObjectId = this.ensureObjectId(projectId);
    const docs = await OutlineNodeModel.find({ project: projectObjectId })
      .select({ nodeId: 1, parentId: 1 })
      .lean<{ nodeId: string; parentId?: string | null }[]>();

    const target = docs.find((doc) => doc.nodeId === nodeId);
    if (!target) {
      throw new ApiError(404, '未找到对应的大纲节点');
    }

    const toRemove = new Set<string>();
    const stack = [target.nodeId];
    const childrenMap = new Map<string | null, string[]>();
    docs.forEach((doc) => {
      const key = doc.parentId ?? null;
      if (!childrenMap.has(key)) {
        childrenMap.set(key, []);
      }
      childrenMap.get(key)!.push(doc.nodeId);
    });

    while (stack.length) {
      const current = stack.pop()!;
      toRemove.add(current);
      const children = childrenMap.get(current) ?? [];
      children.forEach((child) => stack.push(child));
    }

    const result = await OutlineNodeModel.deleteMany({
      project: projectObjectId,
      nodeId: { $in: Array.from(toRemove) },
    });

    return result.deletedCount ?? 0;
  }

  private async loadProject(projectId: string): Promise<ProjectDocument> {
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      throw new ApiError(404, '未找到对应的项目');
    }
    return project;
  }

  private ensureObjectId(value: string | Types.ObjectId): Types.ObjectId {
    if (value instanceof Types.ObjectId) {
      return value;
    }
    if (!Types.ObjectId.isValid(value)) {
      throw new ApiError(400, '项目 ID 无效');
    }
    return new Types.ObjectId(value);
  }

  private resolveStyleProfile(project: ProjectDocument, strength?: number): PromptStyleProfile | undefined {
    const base = project.styleProfile ? this.fromProjectStyleProfile(project.styleProfile) : undefined;
    if (!base && strength === undefined) {
      return undefined;
    }
    return {
      ...(base ?? {}),
      language: base?.language ?? '中文',
      strength,
    };
  }

  private async resolveMemoryFragments(projectId: Types.ObjectId): Promise<PromptMemoryFragment[] | undefined> {
    if (!this.memoryService) {
      return undefined;
    }
    try {
      return await this.memoryService.getPromptFragments(projectId, 24);
    } catch (error) {
      console.error('[OutlineService] Failed to load memory fragments', error);
      return undefined;
    }
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
      language: style.language ?? '中文',
    };
  }

  private parseAiResponse(content: string): OutlineAiResponse {
    const raw = typeof content === 'string' && content.trim() ? content : '{}';

    const parseAndValidate = (value: string) => {
      const parsed = JSON.parse(value);
      return outlineAiResponseSchema.parse(parsed);
    };

    try {
      return parseAndValidate(raw);
    } catch (error) {
      if (error instanceof SyntaxError) {
        try {
          const repaired = jsonrepair(raw);
          return parseAndValidate(repaired);
        } catch (repairError) {
          if (repairError instanceof ZodError) {
            console.error('[OutlineService] AI 输出不符合大纲结构规范：', repairError.issues);
            throw new ApiError(502, 'AI 返回内容结构不符合预期');
          }
          console.error('[OutlineService] 无法修复 AI 输出为合法 JSON：', raw);
          console.error(repairError);
          throw new ApiError(502, 'AI 返回内容不是有效的 JSON');
        }
      }

      if (error instanceof ZodError) {
        console.error('[OutlineService] AI 输出不符合大纲结构规范：', error.issues);
        throw new ApiError(502, 'AI 返回内容结构不符合预期');
      }

      console.error('[OutlineService] 解析 AI 输出时出现未知错误：', error);
      throw new ApiError(502, 'AI 返回内容解析失败');
    }
  }

  private flattenOutline(
    projectId: Types.ObjectId,
    outline: OutlineAiResponse,
    input: OutlineGenerateInput
  ): OutlineNodeWritePayload[] {
    const acts = outline.acts ?? [];
    const payload: OutlineNodeWritePayload[] = [];

    acts.forEach((act, actIndex) => {
      const actNodeId = act.id?.trim() || this.generateNodeId(`act-${actIndex + 1}`);
      payload.push({
        project: projectId,
        nodeId: actNodeId,
        parentId: null,
        order: actIndex,
        title: act.title,
        summary: act.summary,
        status: act.status ?? 'draft',
        tags: this.normaliseTags(act.tags),
        beats: [],
        meta: {
          ...(act.meta ?? {}),
          actIndex,
          structure: input.actStructure,
        },
      });

      (act.chapters ?? []).forEach((chapter, chapterIndex) => {
        const chapterNodeId = chapter.id?.trim() || this.generateNodeId(`chapter-${actIndex + 1}-${chapterIndex + 1}`);
        const beats = this.normaliseBeats(chapter.beats ?? [], chapterNodeId);
        payload.push({
          project: projectId,
          nodeId: chapterNodeId,
          parentId: actNodeId,
          order: chapterIndex,
          title: chapter.title,
          summary: chapter.summary,
          status: chapter.status ?? 'draft',
          tags: this.normaliseTags(chapter.tags),
          beats,
          meta: {
            ...(chapter.meta ?? {}),
            actIndex,
            chapterIndex,
            targetLength: chapter.targetLength ?? input.targetChapterLength ?? null,
          },
        });
      });
    });

    return payload;
  }

  private generateNodeId(prefix: string): string {
    return `${prefix}-${new Types.ObjectId().toString()}`;
  }

  private generateBeatId(nodeId?: string): string {
    const prefix = nodeId ? `${nodeId}-beat` : 'beat';
    return `${prefix}-${new Types.ObjectId().toString()}`;
  }

  private normaliseTags(tags?: string[] | null): string[] {
    if (!Array.isArray(tags)) {
      return [];
    }
    const seen = new Set<string>();
    const result: string[] = [];
    tags.forEach((tag) => {
      const trimmed = typeof tag === 'string' ? tag.trim() : '';
      if (!trimmed || seen.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      result.push(trimmed);
    });
    return result.slice(0, 16);
  }

  private normaliseBeats(beats: OutlineAiBeat[], nodeId?: string): OutlineBeat[] {
    if (!Array.isArray(beats) || beats.length === 0) {
      return [];
    }
    return beats.slice(0, 32).map((beat, index) => ({
      beatId: beat.id?.trim() || this.generateBeatId(nodeId),
      title: beat.title ?? undefined,
      summary: beat.summary,
      order: beat.order ?? index,
      focus: beat.focus ?? undefined,
      outcome: beat.outcome ?? undefined,
      status: beat.status ?? undefined,
      tags: this.normaliseTags(beat.tags ?? null),
      meta: beat.meta ?? null,
    }));
  }

  private async nextOrder(projectId: Types.ObjectId, parentId: string | null): Promise<number> {
    const count = await OutlineNodeModel.countDocuments({ project: projectId, parentId: parentId ?? null });
    return count;
  }

  private toTreeNode(doc: OutlineNode): OutlineTreeNode {
    return {
      nodeId: doc.nodeId,
      parentId: doc.parentId ?? null,
      order: doc.order ?? 0,
      title: doc.title,
      summary: doc.summary ?? '',
      status: doc.status ?? null,
      tags: Array.isArray(doc.tags) ? doc.tags.map((tag) => String(tag)) : [],
      beats: (doc.beats ?? []).map((beat) => ({
        beatId: beat.beatId,
        title: beat.title,
        summary: beat.summary,
        order: beat.order,
        focus: beat.focus,
        outcome: beat.outcome,
        status: beat.status,
        tags: Array.isArray(beat.tags) ? beat.tags.map((tag) => String(tag)) : [],
        meta: beat.meta ?? null,
      })),
      meta: doc.meta ? (typeof doc.meta === 'object' ? (doc.meta as Record<string, unknown>) : { value: doc.meta }) : null,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
      children: [],
    };
  }
}

export default OutlineService;
