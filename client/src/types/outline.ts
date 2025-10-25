export interface OutlineBeat {
  beatId: string;
  title?: string;
  summary: string;
  order: number;
  focus?: string;
  outcome?: string;
  status?: string;
  tags: string[];
  meta?: Record<string, unknown> | null;
}

export interface OutlineNode {
  nodeId: string;
  parentId: string | null;
  order: number;
  title: string;
  summary: string;
  status: string | null;
  tags: string[];
  beats: OutlineBeat[];
  meta?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  children: OutlineNode[];
}

export interface OutlineGenerationPayload {
  actStructure: 'three_act' | 'five_act';
  chapterCount: number;
  targetChapterLength?: number;
  styleStrength?: number;
  model?: string;
}

export interface OutlineNodeUpsertPayload {
  nodeId?: string;
  parentId?: string | null;
  title: string;
  summary?: string;
  status?: string;
  tags?: string[];
  beats?: Array<{
    beatId?: string;
    title?: string;
    summary: string;
    order?: number;
    focus?: string;
    outcome?: string;
    status?: string;
    tags?: string[];
    meta?: Record<string, unknown> | null;
  }>;
  meta?: Record<string, unknown> | null;
}

export interface OutlineReorderUpdate {
  nodeId: string;
  parentId: string | null;
  order: number;
}
