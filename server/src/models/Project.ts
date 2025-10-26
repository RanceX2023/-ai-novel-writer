import { Schema, Types, model, HydratedDocument } from 'mongoose';

export interface OutlineNode {
  key?: string;
  title?: string;
  summary?: string;
  order?: number;
  metadata?: Record<string, unknown> | null;
}

export interface MemoryFragment {
  key?: string;
  label?: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
}

export interface StyleProfile {
  tone?: string;
  pacing?: string;
  pov?: string;
  diction?: string;
  authors?: string[];
  styleStrength?: number;
  language?: string;
  model?: string;
  notes?: string;
  additional?: Record<string, unknown> | null;
}

export interface RewriteEntry {
  version: number;
  content: string;
  styleProfile?: StyleProfile;
  job?: Types.ObjectId;
  createdAt?: Date;
}

export interface Project {
  name: string;
  synopsis?: string;
  outlineNodes: OutlineNode[];
  memoryBank: MemoryFragment[];
  styleProfile?: StyleProfile;
  rewriteHistory: RewriteEntry[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProjectDocument = HydratedDocument<Project>;

const OutlineNodeSchema = new Schema<OutlineNode>(
  {
    key: { type: String },
    title: { type: String },
    summary: { type: String },
    order: { type: Number },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const MemoryFragmentSchema = new Schema<MemoryFragment>(
  {
    key: { type: String },
    label: { type: String },
    content: { type: String },
    tags: [{ type: String }],
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const StyleProfileSchema = new Schema<StyleProfile>(
  {
    tone: { type: String },
    pacing: { type: String },
    pov: { type: String },
    diction: { type: String },
    authors: [{ type: String }],
    styleStrength: { type: Number, min: 0, max: 1 },
    language: { type: String },
    model: { type: String },
    notes: { type: String },
    additional: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const RewriteEntrySchema = new Schema<RewriteEntry>(
  {
    version: { type: Number, required: true },
    content: { type: String, required: true },
    styleProfile: StyleProfileSchema,
    job: { type: Schema.Types.ObjectId, ref: 'GenJob' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ProjectSchema = new Schema<Project>(
  {
    name: { type: String, required: true },
    synopsis: { type: String },
    outlineNodes: { type: [OutlineNodeSchema], default: [] },
    memoryBank: { type: [MemoryFragmentSchema], default: [] },
    styleProfile: StyleProfileSchema,
    rewriteHistory: { type: [RewriteEntrySchema], default: [] },
  },
  { timestamps: true }
);

const ProjectModel = model<Project>('Project', ProjectSchema);

export default ProjectModel;
