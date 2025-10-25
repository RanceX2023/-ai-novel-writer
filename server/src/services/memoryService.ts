import { Types } from 'mongoose';
import MemoryModel, { MemoryReference, MemoryType } from '../models/Memory';
import OpenAIService, { MemoryExtractionOptions } from './openai';
import { PromptMemoryFragment } from '../utils/promptTemplates';

const MAX_ITEMS_PER_SYNC = 32;
const MAX_KEY_LENGTH = 120;
const MAX_CONTENT_LENGTH = 600;
const MAX_REF_LABEL_LENGTH = 160;
const MAX_REFS_PER_ITEM = 8;

const TYPE_ALIASES: Record<string, MemoryType> = {
  world: 'world',
  setting: 'world',
  character: 'world',
  characters: 'world',
  fact: 'fact',
  facts: 'fact',
  event: 'fact',
  plot: 'fact',
  detail: 'fact',
  prior_summary: 'prior_summary',
  priorsummary: 'prior_summary',
  summary: 'prior_summary',
  recap: 'prior_summary',
  overview: 'prior_summary',
  taboo: 'taboo',
  taboo_list: 'taboo',
  contradictions: 'taboo',
  contradiction: 'taboo',
  avoid: 'taboo',
  restriction: 'taboo',
};

const TYPE_LABEL_MAP: Record<MemoryType, string> = {
  world: '世界设定',
  fact: '剧情事实',
  prior_summary: '章节概要',
  taboo: '禁忌事项',
};

const CATEGORY_KEY_PREFIX: Record<string, string> = {
  new_fact: '新增事实',
  character_update: '角色更新',
  unresolved_thread: '未完伏线',
  contradiction: '潜在矛盾',
  summary: '章节概要',
};

export interface MemoryRefInput {
  chapterId?: string | Types.ObjectId;
  label?: string;
}

export interface MemorySyncItemInput {
  key: string;
  type: MemoryType;
  content: string;
  weight?: number;
  refs?: MemoryRefInput[];
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface MemorySyncOptions {
  projectId: Types.ObjectId;
  items: MemorySyncItemInput[];
  chapterId?: Types.ObjectId;
  chapterLabel?: string;
  source?: string;
}

export interface MemorySyncResult {
  created: number;
  updated: number;
  total: number;
}

export interface MemoryExtractionContext {
  projectId: Types.ObjectId;
  projectName: string;
  synopsis?: string;
  chapterId: Types.ObjectId;
  chapterTitle?: string;
  chapterContent: string;
  chapterOrder?: number;
}

type NormalisedMemoryItem = {
  key: string;
  type: MemoryType;
  content: string;
  weight: number;
  refs: MemoryReference[];
  category?: string;
  metadata?: Record<string, unknown> | null;
};

type MemoryDocumentLean = {
  _id: Types.ObjectId;
  project: Types.ObjectId;
  key: string;
  type: MemoryType;
  content: string;
  weight: number;
  refs: MemoryReference[];
  category?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
};

class MemoryService {
  private openAI: OpenAIService;

  private maxItems: number;

  constructor({ openAIService, maxItems }: { openAIService?: OpenAIService; maxItems?: number } = {}) {
    this.openAI = openAIService ?? new OpenAIService();
    this.maxItems = maxItems ?? MAX_ITEMS_PER_SYNC;
  }

  async syncMemory(options: MemorySyncOptions): Promise<MemorySyncResult> {
    const { projectId, chapterId, chapterLabel, source } = options;
    if (!Types.ObjectId.isValid(projectId)) {
      throw new Error('projectId must be a valid ObjectId');
    }

    const payload = options.items?.slice(0, this.maxItems) ?? [];
    const normalised = this.normaliseItems(payload, chapterId, chapterLabel, source);
    if (!normalised.length) {
      return { created: 0, updated: 0, total: 0 };
    }

    let created = 0;
    let updated = 0;

    for (const item of normalised) {
      const result = await this.upsertItem(projectId, item);
      if (result === 'created') {
        created += 1;
      } else {
        updated += 1;
      }
    }

    return {
      created,
      updated,
      total: created + updated,
    };
  }

  async syncFromChapter(context: MemoryExtractionContext): Promise<{ extracted: number } & MemorySyncResult> {
    const { chapterContent } = context;
    if (!chapterContent?.trim()) {
      return { extracted: 0, created: 0, updated: 0, total: 0 };
    }

    const extractionOptions: MemoryExtractionOptions = {
      projectTitle: context.projectName,
      synopsis: context.synopsis,
      chapterTitle: context.chapterTitle,
      chapterOrder: context.chapterOrder,
      chapterContent: context.chapterContent,
    };

    const extraction = await this.openAI.extractMemory(extractionOptions);
    const parsedItems = this.parseExtractionOutput(extraction.content);

    if (!parsedItems.length) {
      return { extracted: 0, created: 0, updated: 0, total: 0 };
    }

    const syncResult = await this.syncMemory({
      projectId: context.projectId,
      chapterId: context.chapterId,
      chapterLabel: context.chapterTitle,
      items: parsedItems,
      source: 'ai_extraction',
    });

    return { extracted: parsedItems.length, ...syncResult };
  }

  async getProjectMemory(projectId: Types.ObjectId): Promise<MemoryDocumentLean[]> {
    return MemoryModel.find({ project: projectId }).sort({ updatedAt: -1 }).lean<MemoryDocumentLean[]>();
  }

  async getPromptFragments(projectId: Types.ObjectId, limit = 36): Promise<PromptMemoryFragment[]> {
    const docs = await MemoryModel.find({ project: projectId })
      .sort({ weight: -1, updatedAt: -1 })
      .limit(limit)
      .lean<MemoryDocumentLean[]>();

    return docs.map((doc) => this.toPromptFragment(doc));
  }

  async getPromptFragmentsByIds(projectId: Types.ObjectId, ids: string[]): Promise<PromptMemoryFragment[]> {
    const objectIds = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (!objectIds.length) {
      return [];
    }

    const docs = await MemoryModel.find({ project: projectId, _id: { $in: objectIds } }).lean<MemoryDocumentLean[]>();
    return docs.map((doc) => this.toPromptFragment(doc));
  }

  private normaliseItems(
    items: MemorySyncItemInput[],
    chapterId?: Types.ObjectId,
    chapterLabel?: string,
    source?: string
  ): NormalisedMemoryItem[] {
    const result = new Map<string, NormalisedMemoryItem>();

    items.forEach((item, index) => {
      const normalised = this.normaliseItem(item, chapterId, chapterLabel, source, index);
      if (!normalised) {
        return;
      }

      const mapKey = `${normalised.type}::${normalised.key}`;
      const existing = result.get(mapKey);
      if (!existing) {
        result.set(mapKey, normalised);
        return;
      }

      existing.weight = this.mergeWeight(existing.weight, normalised.weight);

      if (normalised.content !== existing.content) {
        existing.content = normalised.content;
      }

      if (normalised.category) {
        existing.category = normalised.category;
      }

      if (normalised.metadata) {
        existing.metadata = { ...(existing.metadata ?? {}), ...normalised.metadata };
      }

      const refs = this.mergeRefs(existing.refs, normalised.refs);
      existing.refs = refs;
    });

    return Array.from(result.values()).slice(0, this.maxItems);
  }

  private normaliseItem(
    item: MemorySyncItemInput,
    chapterId?: Types.ObjectId,
    chapterLabel?: string,
    source?: string,
    index = 0
  ): NormalisedMemoryItem | null {
    const type = this.normaliseType(item.type);
    if (!type) {
      return null;
    }

    const key = this.sanitiseKey(item.key || this.defaultKeyForType(type, index, item.category));
    const content = this.sanitiseContent(item.content);

    if (!key || !content) {
      return null;
    }

    const refs = this.normaliseRefs(item.refs ?? [], chapterId, chapterLabel);
    const metadata = this.buildMetadata(item.metadata, source);

    return {
      key,
      type,
      content,
      weight: this.normaliseWeight(item.weight),
      refs,
      category: this.sanitiseCategory(item.category),
      metadata,
    };
  }

  private normaliseWeight(weight?: number): number {
    if (typeof weight !== 'number' || Number.isNaN(weight)) {
      return 0.6;
    }

    let value = weight;
    if (value > 1) {
      value = value <= 10 ? value / 10 : value / 100;
    }

    return Number(Math.min(1, Math.max(0.1, value)).toFixed(3));
  }

  private mergeWeight(current: number, incoming: number): number {
    const blended = current * 0.7 + incoming * 0.3;
    return Number(Math.min(1, Math.max(0.1, blended)).toFixed(3));
  }

  private mergeRefs(existing: MemoryReference[], incoming: MemoryReference[]): MemoryReference[] {
    const combined = [...incoming, ...existing];
    const seen = new Set<string>();
    const refs: MemoryReference[] = [];

    combined.forEach((ref) => {
      const key = ref.chapterId ? ref.chapterId.toString() : ref.label;
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      refs.push({ chapterId: ref.chapterId, label: ref.label });
    });

    return refs.slice(0, MAX_REFS_PER_ITEM);
  }

  private sanitiseKey(value: string): string {
    const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
    if (!cleaned) {
      return '';
    }
    if (cleaned.length <= MAX_KEY_LENGTH) {
      return cleaned;
    }
    return `${cleaned.slice(0, MAX_KEY_LENGTH - 1)}…`;
  }

  private sanitiseContent(value: string): string {
    const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return '';
    }
    if (cleaned.length <= MAX_CONTENT_LENGTH) {
      return cleaned;
    }
    return `${cleaned.slice(0, MAX_CONTENT_LENGTH - 1)}…`;
  }

  private sanitiseCategory(value?: string): string | undefined {
    if (!value || typeof value !== 'string') {
      return undefined;
    }
    const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_\-]+/g, '_');
    return cleaned || undefined;
  }

  private normaliseRefs(
    refs: MemoryRefInput[],
    chapterId?: Types.ObjectId,
    chapterLabel?: string
  ): MemoryReference[] {
    const combined: MemoryRefInput[] = chapterId ? [{ chapterId, label: chapterLabel }, ...refs] : [...refs];
    const seen = new Set<string>();
    const result: MemoryReference[] = [];

    combined.forEach((ref) => {
      const objectId = this.toObjectId(ref.chapterId);
      const label = this.sanitiseRefLabel(ref.label);
      const dedupeKey = objectId ? objectId.toString() : label;
      if (!dedupeKey || seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      result.push({ chapterId: objectId, label });
    });

    return result.slice(0, MAX_REFS_PER_ITEM);
  }

  private sanitiseRefLabel(label?: string): string | undefined {
    if (!label || typeof label !== 'string') {
      return undefined;
    }
    const cleaned = label.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
    if (!cleaned) {
      return undefined;
    }
    if (cleaned.length <= MAX_REF_LABEL_LENGTH) {
      return cleaned;
    }
    return `${cleaned.slice(0, MAX_REF_LABEL_LENGTH - 1)}…`;
  }

  private toObjectId(value?: string | Types.ObjectId): Types.ObjectId | undefined {
    if (!value) {
      return undefined;
    }
    if (value instanceof Types.ObjectId) {
      return value;
    }
    if (typeof value === 'string' && Types.ObjectId.isValid(value)) {
      return new Types.ObjectId(value);
    }
    return undefined;
  }

  private normaliseType(value: string | MemoryType | undefined): MemoryType | undefined {
    if (!value) {
      return undefined;
    }
    const key = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return TYPE_ALIASES[key];
  }

  private defaultKeyForType(type: MemoryType, index: number, category?: string): string {
    const prefix = category ? CATEGORY_KEY_PREFIX[category] ?? TYPE_LABEL_MAP[type] : TYPE_LABEL_MAP[type];
    return `${prefix}${index > 0 ? `#${index + 1}` : ''}`;
  }

  private parseExtractionOutput(raw: string): MemorySyncItemInput[] {
    if (!raw || typeof raw !== 'string') {
      return [];
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch (_error) {
      return [];
    }

    const collected: MemorySyncItemInput[] = [];
    const collect = (entries: unknown[], fallbackType?: MemoryType, category?: string) => {
      entries.forEach((entry, index) => {
        const parsed = this.parseExtractionItem(entry, fallbackType, category, index);
        if (parsed) {
          collected.push(parsed);
        }
      });
    };

    if (Array.isArray(payload)) {
      collect(payload);
      return collected;
    }

    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const record = payload as Record<string, unknown>;

    if (Array.isArray(record.items)) {
      collect(record.items);
    }

    if (Array.isArray(record.world)) {
      collect(record.world as unknown[], 'world');
    }

    const facts = (record.facts as unknown[]) ?? (record.fact as unknown[]) ?? (record.newFacts as unknown[]);
    if (Array.isArray(facts)) {
      collect(facts, 'fact');
    }

    const summary = record.priorSummary ?? record.summary;
    if (summary) {
      const entries = Array.isArray(summary) ? (summary as unknown[]) : [summary];
      collect(entries, 'prior_summary', 'summary');
    }

    const characterUpdates = record.characterUpdates ?? record.characterUpdate;
    if (Array.isArray(characterUpdates)) {
      collect(characterUpdates as unknown[], 'world', 'character_update');
    }

    const taboo = record.taboo ?? record.tabooList ?? record.contradictions;
    if (Array.isArray(taboo)) {
      collect(taboo as unknown[], 'taboo', 'contradiction');
    }

    const unresolved = record.unresolvedThreads ?? record.unresolved;
    if (Array.isArray(unresolved)) {
      unresolved.forEach((entry, index) => {
        const text = typeof entry === 'string'
          ? entry
          : typeof entry === 'object' && entry !== null
            ? (entry as Record<string, unknown>).content ?? (entry as Record<string, unknown>).description
            : undefined;
        if (typeof text === 'string' && text.trim()) {
          collected.push({
            type: 'fact',
            key: this.defaultKeyForType('fact', index, 'unresolved_thread'),
            content: text,
            category: 'unresolved_thread',
          });
        }
      });
    }

    return collected;
  }

  private parseExtractionItem(
    entry: unknown,
    fallbackType?: MemoryType,
    fallbackCategory?: string,
    index = 0
  ): MemorySyncItemInput | null {
    if (!entry) {
      return null;
    }

    if (typeof entry === 'string') {
      if (!fallbackType) {
        return null;
      }
      return {
        type: fallbackType,
        key: this.defaultKeyForType(fallbackType, index, fallbackCategory),
        content: entry,
        category: fallbackCategory,
      };
    }

    if (typeof entry !== 'object') {
      return null;
    }

    const record = entry as Record<string, unknown>;
    const type = this.normaliseType((record.type as string) ?? fallbackType);
    if (!type) {
      return null;
    }

    const content = this.extractContent(record);
    if (!content) {
      return null;
    }

    const key = typeof record.key === 'string' && record.key.trim()
      ? record.key
      : this.defaultKeyForType(type, index, (record.category as string) ?? fallbackCategory);

    return {
      type,
      key,
      content,
      weight: this.extractWeight(record.weight ?? record.importance),
      refs: this.extractRefs(record.refs ?? record.references),
      category: (record.category as string) ?? fallbackCategory,
      metadata: this.extractMetadata(record),
    };
  }

  private extractContent(record: Record<string, unknown>): string | null {
    const candidates = ['content', 'summary', 'description', 'value', 'text'];
    for (const key of candidates) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    return null;
  }

  private extractRefs(raw: unknown): MemoryRefInput[] | undefined {
    if (!raw) {
      return undefined;
    }
    if (Array.isArray(raw)) {
      return raw
        .map((value) => {
          if (typeof value === 'string') {
            return { label: value };
          }
          if (typeof value === 'object' && value !== null) {
            const ref = value as Record<string, unknown>;
            const chapterId = ref.chapterId ?? ref.id ?? ref.chapter;
            const label = ref.label ?? ref.note ?? ref.title;
            return {
              chapterId: typeof chapterId === 'string' ? chapterId : undefined,
              label: typeof label === 'string' ? label : undefined,
            };
          }
          return undefined;
        })
        .filter((ref): ref is MemoryRefInput => Boolean(ref));
    }
    if (typeof raw === 'string') {
      return [{ label: raw }];
    }
    return undefined;
  }

  private extractWeight(value: unknown): number | undefined {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return undefined;
    }
    return value;
  }

  private extractMetadata(record: Record<string, unknown>): Record<string, unknown> | undefined {
    const metadata: Record<string, unknown> = {};
    if (record.notes !== undefined) {
      metadata.notes = record.notes;
    }
    if (record.reason !== undefined) {
      metadata.reason = record.reason;
    }
    return Object.keys(metadata).length ? metadata : undefined;
  }

  private buildMetadata(
    metadata: Record<string, unknown> | undefined,
    source?: string
  ): Record<string, unknown> | null {
    const base = metadata && typeof metadata === 'object' ? { ...metadata } : {};
    if (source && !base.source) {
      base.source = source;
    }
    return Object.keys(base).length ? base : null;
  }

  private async upsertItem(projectId: Types.ObjectId, item: NormalisedMemoryItem): Promise<'created' | 'updated'> {
    const existing = await MemoryModel.findOne({ project: projectId, type: item.type, key: item.key });
    if (!existing) {
      await MemoryModel.create({
        project: projectId,
        key: item.key,
        type: item.type,
        content: item.content,
        weight: item.weight,
        refs: item.refs,
        category: item.category,
        metadata: item.metadata ?? undefined,
      });
      return 'created';
    }

    let changed = false;

    if (existing.content !== item.content) {
      existing.content = item.content;
      changed = true;
    }

    const newWeight = this.mergeWeight(existing.weight ?? 0.6, item.weight);
    if (Math.abs(newWeight - (existing.weight ?? 0.6)) > 0.0005) {
      existing.weight = newWeight;
      changed = true;
    }

    const mergedRefs = this.mergeRefs(existing.refs ?? [], item.refs);
    if (mergedRefs.length !== (existing.refs ?? []).length || this.hasRefDiff(existing.refs ?? [], mergedRefs)) {
      existing.refs = mergedRefs;
      existing.markModified('refs');
      changed = true;
    }

    if (item.category && item.category !== existing.category) {
      existing.category = item.category;
      changed = true;
    }

    if (item.metadata) {
      existing.metadata = { ...(existing.metadata ?? {}), ...item.metadata };
      changed = true;
    }

    if (!changed) {
      existing.updatedAt = new Date();
    }

    await existing.save();
    return 'updated';
  }

  private hasRefDiff(a: MemoryReference[], b: MemoryReference[]): boolean {
    if (a.length !== b.length) {
      return true;
    }
    return a.some((ref, index) => {
      const other = b[index];
      return (
        (ref.chapterId?.toString() ?? null) !== (other.chapterId?.toString() ?? null)
        || (ref.label ?? null) !== (other.label ?? null)
      );
    });
  }

  private toPromptFragment(doc: MemoryDocumentLean): PromptMemoryFragment {
    return {
      label: `【${TYPE_LABEL_MAP[doc.type]}】${doc.key}`,
      content: doc.content,
      type: doc.type,
      strength: this.weightToStrength(doc.weight),
    };
  }

  private weightToStrength(weight: number): string | undefined {
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
}

export default MemoryService;
