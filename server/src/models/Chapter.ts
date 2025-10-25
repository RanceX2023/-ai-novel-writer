import { Schema, Types, model, HydratedDocument } from 'mongoose';

export interface ChapterVersion {
  version: number;
  content: string;
  delta?: string;
  job?: Types.ObjectId;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}

export interface Chapter {
  project: Types.ObjectId;
  title: string;
  order?: number;
  synopsis?: string;
  content: string;
  versions: ChapterVersion[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type ChapterDocument = HydratedDocument<Chapter>;

const ChapterVersionSchema = new Schema<ChapterVersion>(
  {
    version: { type: Number, required: true },
    content: { type: String, required: true },
    delta: { type: String },
    job: { type: Schema.Types.ObjectId, ref: 'GenJob' },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ChapterSchema = new Schema<Chapter>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true },
    order: { type: Number },
    synopsis: { type: String },
    content: { type: String, default: '' },
    versions: { type: [ChapterVersionSchema], default: [] },
  },
  { timestamps: true }
);

const ChapterModel = model<Chapter>('Chapter', ChapterSchema);

export default ChapterModel;
