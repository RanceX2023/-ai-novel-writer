import { Schema, Types, model, HydratedDocument } from 'mongoose';

export interface StyleProfileAttributes {
  project: Types.ObjectId;
  name?: string;
  tone?: string;
  pacing?: string;
  pov?: string;
  diction?: string;
  authors?: string[];
  styleStrength?: number;
  language?: string;
  model?: string;
  notes?: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type StyleProfileDocument = HydratedDocument<StyleProfileAttributes>;

const StyleProfileSchema = new Schema<StyleProfileAttributes>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String },
    tone: { type: String },
    pacing: { type: String },
    pov: { type: String },
    diction: { type: String },
    authors: [{ type: String }],
    styleStrength: { type: Number, min: 0, max: 1 },
    language: { type: String },
    model: { type: String },
    notes: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

const StyleProfileModel = model<StyleProfileAttributes>('StyleProfile', StyleProfileSchema);

export default StyleProfileModel;
