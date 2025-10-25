import { Schema, Types, model, HydratedDocument } from 'mongoose';

export interface PlotPoint {
  project: Types.ObjectId;
  arc: Types.ObjectId;
  chapter?: Types.ObjectId | null;
  title: string;
  description?: string;
  tension: number;
  order: number;
  beatType?: string;
  status?: string;
  aiSuggested?: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PlotPointDocument = HydratedDocument<PlotPoint>;

const PlotPointSchema = new Schema<PlotPoint>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    arc: { type: Schema.Types.ObjectId, ref: 'PlotArc', required: true, index: true },
    chapter: { type: Schema.Types.ObjectId, ref: 'Chapter' },
    title: { type: String, required: true },
    description: { type: String },
    tension: { type: Number, default: 5, min: 0, max: 10 },
    order: { type: Number, default: 0 },
    beatType: { type: String },
    status: { type: String, default: 'planned' },
    aiSuggested: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

PlotPointSchema.index({ project: 1, arc: 1, order: 1 });

const PlotPointModel = model<PlotPoint>('PlotPoint', PlotPointSchema);

export default PlotPointModel;
