import { Schema, Types, model, HydratedDocument } from 'mongoose';

export type MemoryKind = 'fact' | 'constraint' | 'continuity' | 'character' | 'world' | 'note';
export type MemoryStrength = 'low' | 'medium' | 'high';

export interface Memory {
  project: Types.ObjectId;
  label: string;
  content: string;
  type?: MemoryKind;
  strength?: MemoryStrength;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type MemoryDocument = HydratedDocument<Memory>;

const MemorySchema = new Schema<Memory>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    label: { type: String, required: true },
    content: { type: String, required: true },
    type: {
      type: String,
      enum: ['fact', 'constraint', 'continuity', 'character', 'world', 'note'],
    },
    strength: {
      type: String,
      enum: ['low', 'medium', 'high'],
    },
    tags: [{ type: String }],
    metadata: { type: Schema.Types.Mixed },
    createdBy: { type: String },
  },
  { timestamps: true }
);

const MemoryModel = model<Memory>('Memory', MemorySchema);

export default MemoryModel;
