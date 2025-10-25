import { Schema, Types, model, HydratedDocument } from 'mongoose';

export interface StyleProfileAttributes {
  project: Types.ObjectId;
  name?: string;
  tone?: string;
  pacing?: string;
  pov?: string;
  mood?: string;
  genre?: string;
  voice?: string;
  instructions?: string;
  language?: string;
  strength?: number;
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
    mood: { type: String },
    genre: { type: String },
    voice: { type: String },
    instructions: { type: String },
    language: { type: String },
    strength: { type: Number, min: 0, max: 1 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

const StyleProfileModel = model<StyleProfileAttributes>('StyleProfile', StyleProfileSchema);

export default StyleProfileModel;
