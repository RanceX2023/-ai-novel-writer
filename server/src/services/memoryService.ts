import { Types } from 'mongoose';
import { Logger } from 'pino';
import MemoryModel, { MemoryConflictNote, MemoryDocument, MemoryReference, MemoryType } from '../models/Memory';
import OpenAIService, { MemoryExtractionOptions } from './openai';
import { PromptMemoryFragment } from '../utils/promptTemplates';
import baseLogger from '../utils/logger';

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
  addedAt?: Date;
}

export interface MemorySyncItemInput {
  key: string;
  type: MemoryType;
  content: string;
  weight?: number;
  refs?: MemoryRefInput[];
  category?: string;
  metadata?: Record<string, unknown>;
  characterIds?: Array<string | Types.ObjectId>;
  characterStateChange?: string;
  worldRuleChange?: string;
  updatedAt?: string;
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
  conflicts: number;
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
  canonicalKey: string;
  type: MemoryType;
  content: string;
  weight: number;
  refs: MemoryReference[];
  category?: string;
  metadata?: Record<string, unknown> | null;
  characterIds: Types.ObjectId[];
  characterStateChange?: string | null;
  worldRuleChange?: string | null;
};

type MemoryDocumentLean = {
  _id: Types.ObjectId;
  project: Types.ObjectId;
  key: string;
  canonicalKey: string;
  type: MemoryType;
  content: string;
  weight: number;
  refs: MemoryReference[];
  category?: string | null;
  metadata?: Record<string, unknown> | null;
  characterIds?: Types.ObjectId[];
  characterStateChange?: string | null;
  worldRuleChange?: string | null;
  conflict?: boolean;
  conflictNotes?: MemoryConflictNote[] | null;
  createdAt?: Date;
  updatedAt?: Date;
};

class MemoryService {
  private openAI: OpenAIService;

  private maxItems: number;

  private logger: Logger;

  constructor({ openAIService, maxItems, logger }: { openAIService?: OpenAIService; maxItems?: number; logger?: Logger } = {}) {
    this.openAI = openAIService ?? new OpenAIService();
    this.maxItems = maxItems ?? MAX_ITEMS_PER_SYNC;
    this.logger = logger ?? baseLogger.child({ module: 'memory-service' });
  }

  async syncMemory(options: MemorySyncOptions): Promise<MemorySyncResult> {
    const { projectId, chapterId, chapterLabel, source } = options;
    if (!Types.ObjectId.isValid(projectId)) {
      throw new Error('projectId must be a valid ObjectId');
    }

    const payload = options.items?.slice(0, this.maxItems) ?? [];
    const normalised = this.normaliseItems(payload, chapterId, chapterLabel, source);
    if (!normalised.length) {
      return { created: 0, updated: 0, conflicts: 0, total: 0 };
    }

    const cache = new Map<MemoryType, MemoryDocument[]>();
    let created = 0;
    let updated = 0;
    let conflicts = 0;

    for (const item of normalised) {
      const documents = await this.getCachedMemories(projectId, item.type, cache);
      const { outcome, document } = await this.upsertItem(projectId, item, documents);
      if (outcome === 'created') {
        created += 1;
        documents.push(document);
      } else {
        updated += 1;
        if (outcome === 'conflict') {
          conflicts += 1;
        }
      }
    }

    this.logger.info(
      {
        projectId: projectId.toString(),
        created,
        merged: updated,
        conflicts,
        processed: normalised.length,
      },
      'memory-sync-completed'
    );

    return {
      created,
      updated,
      conflicts,
      total: created + updated,
    };
  }

  async syncFromChapter(context: MemoryExtractionContext): Promise<{ extracted: number } & MemorySyncResult> {
    const { chapterContent } = context;
    if (!chapterContent?.trim()) {
      return { extracted: 0, created: 0, updated: 0, conflicts: 0, total: 0 };
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
      return { extracted: 0, created: 0, updated: 0, conflicts: 0, total: 0 };
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

  async getProjectConflicts(projectId: Types.ObjectId): Promise<MemoryDocumentLean[]> {
    return MemoryModel.find({ project: projectId, conflict: true })
      .sort({ updatedAt: -1 })
      .lean<MemoryDocumentLean[]>();
  }

  async getPromptFragments(projectId: Types.ObjectId, limit = 36): Promise<PromptMemoryFragment[]> {
    const docs = await MemoryModel.find({ project: projectId })
      .sort({ conflict: 1, weight: -1, updatedAt: -1 })
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

  private async getCachedMemories(
    projectId: Types.ObjectId,
    type: MemoryType,
    cache: Map<MemoryType, MemoryDocument[]>
  ): Promise<MemoryDocument[]> {
    const cached = cache.get(type);
    if (cached) {
      return cached;
    }

    const docs = await MemoryModel.find({ project: projectId, type }).sort({ updatedAt: -1, createdAt: -1 });
    cache.set(type, docs);
    return docs;
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

      const mapKey = `${normalised.type}::${normalised.canonicalKey}`;
      const existing = result.get(mapKey);
      if (!existing) {
        result.set(mapKey, normalised);
        return;
      }

      existing.weight = this.mergeWeight(existing.weight, normalised.weight);

      if (normalised.content.length > existing.content.length) {
        existing.content = normalised.content;
      }

      existing.key = this.pickPreferredKey(existing.key, normalised.key);

      if (normalised.category) {
        existing.category = normalised.category;
      }

      if (normalised.metadata) {
        existing.metadata = { ...(existing.metadata ?? {}), ...normalised.metadata };
      }

      existing.refs = this.mergeRefs(existing.refs, normalised.refs);
      existing.characterIds = this.mergeCharacterIds(existing.characterIds, normalised.characterIds);

      if (normalised.characterStateChange) {
        existing.characterStateChange = normalised.characterStateChange;
      }

      if (normalised.worldRuleChange) {
        existing.worldRuleChange = normalised.worldRuleChange;
      }
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

    const canonicalKey = this.buildCanonicalKey(key);
    const refs = this.normaliseRefs(item.refs ?? [], chapterId, chapterLabel);
    const metadata = this.buildMetadata(item.metadata, source);
    const characterIds = this.normaliseCharacterIds(item.characterIds);

    return {
      key,
      canonicalKey,
      type,
      content,
      weight: this.normaliseWeight(item.weight),
      refs,
      category: this.sanitiseCategory(item.category),
      metadata,
      characterIds,
      characterStateChange: this.sanitiseOptionalContent(item.characterStateChange),
      worldRuleChange: this.sanitiseOptionalContent(item.worldRuleChange),
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
      refs.push({
        chapterId: ref.chapterId,
        label: ref.label,
        addedAt: ref.addedAt ?? new Date(),
      });
    });

    return refs.slice(0, MAX_REFS_PER_ITEM);
  }

  private mergeCharacterIds(existing: Types.ObjectId[], incoming: Types.ObjectId[]): Types.ObjectId[] {
    const seen = new Set<string>();
    const result: Types.ObjectId[] = [];
    [...incoming, ...existing].forEach((id) => {
      if (!id) {
        return;
      }
      const key = id.toString();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push(id);
    });
    return result;
  }

  private hasCharacterDiff(a: Types.ObjectId[], b: Types.ObjectId[]): boolean {
    if (a.length !== b.length) {
      return true;
    }
    return a.some((id, index) => id.toString() !== b[index].toString());
  }

  private pickPreferredKey(current: string, incoming: string): string {
    if (!current) {
      return incoming;
    }
    if (!incoming) {
      return current;
    }
    return incoming.length <= current.length ? incoming : current;
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

  private buildCanonicalKey(value: string): string {
    let normalised = value;
    try {
      normalised = value.normalize('NFKC');
    } catch (_error) {
      normalised = value;
    }
    return normalised.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
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

  private sanitiseOptionalContent(value?: string | null, limit = 240): string | null {
    if (!value || typeof value !== 'string') {
      return null;
    }
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return null;
    }
    if (cleaned.length <= limit) {
      return cleaned;
    }
    return `${cleaned.slice(0, limit - 1)}…`;
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
      result.push({
        chapterId: objectId,
        label,
        addedAt: ref.addedAt instanceof Date ? ref.addedAt : new Date(),
      });
    });

    return result.slice(0, MAX_REFS_PER_ITEM);
  }

  private normaliseCharacterIds(values?: Array<string | Types.ObjectId | null | undefined>): Types.ObjectId[] {
    if (!values?.length) {
      return [];
    }
    const seen = new Set<string>();
    const result: Types.ObjectId[] = [];
    values.forEach((value) => {
      const objectId = this.toObjectId(value as string | Types.ObjectId | undefined);
      if (!objectId) {
        return;
      }
      const key = objectId.toString();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push(objectId);
    });
    return result;
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
      characterIds: this.extractCharacterIds(record.characterIds ?? record.characters ?? record.characterRefs),
      characterStateChange: this.extractStateChange(record),
      worldRuleChange: this.extractWorldRuleChange(record),
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

  private extractCharacterIds(raw: unknown): string[] | undefined {
    if (!raw) {
      return undefined;
    }
    const candidates = Array.isArray(raw) ? raw : [raw];
    const result: string[] = [];
    candidates.forEach((candidate) => {
      if (typeof candidate === 'string' && Types.ObjectId.isValid(candidate.trim())) {
        result.push(candidate.trim());
        return;
      }
      if (candidate && typeof candidate === 'object') {
        const record = candidate as Record<string, unknown>;
        const value = record.id ?? record.characterId ?? record._id;
        if (typeof value === 'string' && Types.ObjectId.isValid(value.trim())) {
          result.push(value.trim());
        }
      }
    });
    return result.length ? Array.from(new Set(result)) : undefined;
  }

  private extractStateChange(record: Record<string, unknown>): string | undefined {
    const keys = ['characterStateChange', 'characterStatusChange', 'stateChange', 'characterState'];
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private extractWorldRuleChange(record: Record<string, unknown>): string | undefined {
    const keys = ['worldRuleChange', 'worldChange', 'ruleChange', 'worldRule'];
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
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
    if (typeof record.source === 'string' && record.source.trim()) {
      metadata.source = record.source.trim();
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

  private getDocumentCanonical(doc: { canonicalKey?: string; key: string }): string {
    if (doc.canonicalKey && typeof doc.canonicalKey === 'string' && doc.canonicalKey.trim()) {
      return doc.canonicalKey.trim();
    }
    return this.buildCanonicalKey(doc.key);
  }

  private findMatchingMemory(existingDocs: MemoryDocument[], incoming: NormalisedMemoryItem): MemoryDocument | undefined {
    const targetCanonical = incoming.canonicalKey;
    const exact = existingDocs.find((doc) => this.getDocumentCanonical(doc) === targetCanonical);
    if (exact) {
      return exact;
    }

    return existingDocs.find((doc) => {
      const docCanonical = this.getDocumentCanonical(doc);
      return docCanonical.startsWith(targetCanonical) || targetCanonical.startsWith(docCanonical);
    });
  }

  private hasConflictNote(notes: MemoryConflictNote[] | null | undefined, content: string): boolean {
    if (!notes?.length) {
      return false;
    }
    return notes.some((note) => note.content === content);
  }

  private resolvePrimaryRef(refs: MemoryReference[]): MemoryReference | undefined {
    if (!refs?.length) {
      return undefined;
    }
    return [...refs].sort((a, b) => {
      const timeA = a.addedAt instanceof Date ? a.addedAt.getTime() : 0;
      const timeB = b.addedAt instanceof Date ? b.addedAt.getTime() : 0;
      return timeB - timeA;
    })[0];
  }

  private resolveMetadataSource(metadata?: Record<string, unknown> | null): string | undefined {
    if (!metadata || typeof metadata !== 'object') {
      return undefined;
    }
    const source = (metadata as Record<string, unknown>).source;
    return typeof source === 'string' && source.trim() ? source.trim() : undefined;
  }

  private buildConflictNote(content: string, refs: MemoryReference[], source?: string): MemoryConflictNote {
    const primaryRef = this.resolvePrimaryRef(refs);
    return {
      content,
      source,
      chapterId: primaryRef?.chapterId,
      chapterLabel: primaryRef?.label,
      recordedAt: new Date(),
    };
  }

  private registerConflict(
    existing: MemoryDocument,
    previousContent: string,
    previousRefs: MemoryReference[],
    incoming: NormalisedMemoryItem
  ): void {
    if (!previousContent || previousContent === incoming.content) {
      return;
    }

    const notes = existing.conflictNotes ?? [];
    if (!this.hasConflictNote(notes, previousContent)) {
      const source = this.resolveMetadataSource(existing.metadata) ?? 'history';
      const note = this.buildConflictNote(previousContent, previousRefs, source);
      existing.conflictNotes = [...notes, note];
      existing.markModified('conflictNotes');
    }

    existing.conflict = true;
    existing.content = incoming.content;
  }

  private async upsertItem(
    projectId: Types.ObjectId,
    item: NormalisedMemoryItem,
    existingDocs: MemoryDocument[]
  ): Promise<{ outcome: 'created' | 'updated' | 'conflict'; document: MemoryDocument }> {
    let existing = this.findMatchingMemory(existingDocs, item);

    if (!existing) {
      const created = await MemoryModel.create({
        project: projectId,
        key: item.key,
        canonicalKey: item.canonicalKey,
        type: item.type,
        content: item.content,
        weight: item.weight,
        refs: item.refs,
        category: item.category,
        metadata: item.metadata ?? undefined,
        characterIds: item.characterIds,
        characterStateChange: item.characterStateChange ?? undefined,
        worldRuleChange: item.worldRuleChange ?? undefined,
        conflict: false,
      });
      return { outcome: 'created', document: created };
    }

    let changed = false;
    let outcome: 'updated' | 'conflict' = 'updated';

    const previousContent = existing.content || '';
    const previousRefs = existing.refs ? [...existing.refs] : [];

    const preferredKey = this.pickPreferredKey(existing.key, item.key);
    if (preferredKey !== existing.key) {
      existing.key = preferredKey;
      changed = true;
    }

    if (existing.canonicalKey !== item.canonicalKey) {
      existing.canonicalKey = item.canonicalKey;
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

    const mergedRefs = this.mergeRefs(existing.refs ?? [], item.refs);
    if (this.hasRefDiff(existing.refs ?? [], mergedRefs)) {
      existing.refs = mergedRefs;
      existing.markModified('refs');
      changed = true;
    }

    const mergedCharacters = this.mergeCharacterIds(existing.characterIds ?? [], item.characterIds);
    if (this.hasCharacterDiff(existing.characterIds ?? [], mergedCharacters)) {
      existing.characterIds = mergedCharacters;
      existing.markModified('characterIds');
      changed = true;
    }

    if (item.characterStateChange && item.characterStateChange !== existing.characterStateChange) {
      existing.characterStateChange = item.characterStateChange;
      changed = true;
    }

    if (item.worldRuleChange && item.worldRuleChange !== existing.worldRuleChange) {
      existing.worldRuleChange = item.worldRuleChange;
      changed = true;
    }

    const newWeight = this.mergeWeight(existing.weight ?? 0.6, item.weight);
    if (Math.abs(newWeight - (existing.weight ?? 0.6)) > 0.0005) {
      existing.weight = newWeight;
      changed = true;
    }

    if (item.content !== previousContent) {
      this.registerConflict(existing, previousContent, previousRefs, item);
      outcome = 'conflict';
      changed = true;
    }

    if (outcome === 'updated' && !changed) {
      existing.updatedAt = new Date();
    }

    await existing.save();

    return { outcome, document: existing };
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
    const fragment: PromptMemoryFragment = {
      label: `【${TYPE_LABEL_MAP[doc.type]}】${doc.key}`,
      content: doc.content,
      type: doc.type,
      strength: this.weightToStrength(doc.weight),
    };

    if (doc.characterStateChange) {
      fragment.characterStateChange = doc.characterStateChange;
    }
    if (doc.worldRuleChange) {
      fragment.worldRuleChange = doc.worldRuleChange;
    }
    if (doc.characterIds?.length) {
      fragment.characterIds = doc.characterIds.map((id) => id.toString());
    }

    const primaryRef = this.resolvePrimaryRef(doc.refs ?? []);
    if (primaryRef?.label) {
      fragment.primaryReference = primaryRef.label;
    }

    if (doc.conflict) {
      fragment.conflict = true;
      const notes = doc.conflictNotes ?? [];
      if (notes.length) {
        fragment.conflictNotes = notes.map((note) => {
          if (note.chapterLabel) {
            return `${note.chapterLabel}：${note.content}`;
          }
          return note.content;
        });
      }
    }

    return fragment;
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
