import { HydratedDocument, Schema, Types, model } from 'mongoose';

export interface CharacterAttributes {
  project: Types.ObjectId;
  name: string;
  role?: string;
  background?: string;
  goals?: string;
  conflicts?: string;
  quirks?: string;
  voice?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CharacterDocument = HydratedDocument<CharacterAttributes>;

const CharacterSchema = new Schema<CharacterAttributes>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, trim: true },
    background: { type: String, trim: true },
    goals: { type: String, trim: true },
    conflicts: { type: String, trim: true },
    quirks: { type: String, trim: true },
    voice: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

const CharacterModel = model<CharacterAttributes>('Character', CharacterSchema);

export default CharacterModel;
