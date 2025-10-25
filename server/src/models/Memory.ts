import { HydratedDocument, Schema, Types, model } from 'mongoose';

export type MemoryType = 'world' | 'fact' | 'prior_summary' | 'taboo';

export interface MemoryReference {
  chapterId?: Types.ObjectId;
  label?: string;
  addedAt?: Date;
}

export interface MemoryConflictNote {
  content: string;
  source?: string;
  chapterId?: Types.ObjectId;
  chapterLabel?: string;
  recordedAt?: Date;
}

export interface Memory {
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
}

export type MemoryDocument = HydratedDocument<Memory>;

const MemoryReferenceSchema = new Schema<MemoryReference>(
  {
    chapterId: { type: Schema.Types.ObjectId, ref: 'Chapter' },
    label: { type: String },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MemoryConflictNoteSchema = new Schema<MemoryConflictNote>(
  {
    content: { type: String, required: true },
    source: { type: String },
    chapterId: { type: Schema.Types.ObjectId, ref: 'Chapter' },
    chapterLabel: { type: String },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MemorySchema = new Schema<Memory>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    key: { type: String, required: true },
    canonicalKey: { type: String, required: true, index: true, default: '' },
    type: {
      type: String,
      required: true,
      enum: ['world', 'fact', 'prior_summary', 'taboo'],
    },
    content: { type: String, required: true },
    weight: { type: Number, min: 0, max: 1, default: 0.6 },
    refs: { type: [MemoryReferenceSchema], default: [] },
    category: { type: String },
    metadata: { type: Schema.Types.Mixed },
    characterIds: { type: [Schema.Types.ObjectId], ref: 'Character', default: [] },
    characterStateChange: { type: String },
    worldRuleChange: { type: String },
    conflict: { type: Boolean, default: false },
    conflictNotes: { type: [MemoryConflictNoteSchema], default: [] },
  },
  { timestamps: true }
);

MemorySchema.index({ project: 1, type: 1, key: 1 }, { unique: true });

const MemoryModel = model<Memory>('Memory', MemorySchema);

export default MemoryModel;
