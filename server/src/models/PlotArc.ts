import { Schema, Types, model, HydratedDocument } from 'mongoose';

export interface PlotArc {
  project: Types.ObjectId;
  title: string;
  color?: string;
  summary?: string;
  goal?: string;
  order: number;
  themes: string[];
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PlotArcDocument = HydratedDocument<PlotArc>;

const PlotArcSchema = new Schema<PlotArc>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, required: true },
    color: { type: String },
    summary: { type: String },
    goal: { type: String },
    order: { type: Number, default: 0 },
    themes: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

PlotArcSchema.index({ project: 1, order: 1 });

const PlotArcModel = model<PlotArc>('PlotArc', PlotArcSchema);

export default PlotArcModel;
