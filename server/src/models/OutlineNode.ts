import { Schema, Types, model, HydratedDocument } from 'mongoose';

export interface OutlineBeat {
  beatId: string;
  title?: string;
  summary: string;
  order: number;
  focus?: string;
  outcome?: string;
  status?: string;
  tags?: string[];
  meta?: Record<string, unknown> | null;
}

export interface OutlineNode {
  project: Types.ObjectId;
  nodeId: string;
  parentId?: string | null;
  order: number;
  title: string;
  summary?: string;
  beats?: OutlineBeat[];
  status?: string;
  tags?: string[];
  meta?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type OutlineNodeDocument = HydratedDocument<OutlineNode>;

const OutlineBeatSchema = new Schema<OutlineBeat>(
  {
    beatId: { type: String, required: true },
    title: { type: String },
    summary: { type: String, required: true },
    order: { type: Number, required: true },
    focus: { type: String },
    outcome: { type: String },
    status: { type: String },
    tags: [{ type: String }],
    meta: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const OutlineNodeSchema = new Schema<OutlineNode>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    nodeId: { type: String, required: true },
    parentId: { type: String, default: null },
    order: { type: Number, default: 0 },
    title: { type: String, required: true },
    summary: { type: String },
    beats: { type: [OutlineBeatSchema], default: [] },
    status: { type: String },
    tags: [{ type: String }],
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

OutlineNodeSchema.index({ project: 1, nodeId: 1 }, { unique: true });
OutlineNodeSchema.index({ project: 1, parentId: 1, order: 1 });

const OutlineNodeModel = model<OutlineNode>('OutlineNode', OutlineNodeSchema);

export default OutlineNodeModel;
