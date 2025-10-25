import { Schema, Types, model, HydratedDocument } from 'mongoose';

export type GenerationJobType = 'chapter_generation' | 'chapter_continuation' | 'project_rewrite';
export type GenerationJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface GenerationJobError {
  message: string;
  stack?: string;
}

export interface GenerationJob {
  project: Types.ObjectId;
  chapter?: Types.ObjectId;
  type: GenerationJobType;
  status: GenerationJobStatus;
  metadata?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error?: GenerationJobError | null;
  tokensGenerated: number;
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
  cost?: number;
  currency?: string;
  progress: number;
  metaValidationFailures?: number;
  metaRetryDurationMs?: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type GenerationJobDocument = HydratedDocument<GenerationJob>;

const GenJobSchema = new Schema<GenerationJob>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    chapter: { type: Schema.Types.ObjectId, ref: 'Chapter' },
    type: {
      type: String,
      enum: ['chapter_generation', 'chapter_continuation', 'project_rewrite'],
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
      default: 'queued',
    },
    metadata: { type: Schema.Types.Mixed, default: null },
    result: { type: Schema.Types.Mixed, default: null },
    error: {
      type: new Schema<GenerationJobError>(
        {
          message: { type: String, required: true },
          stack: { type: String },
        },
        { _id: false }
      ),
      default: null,
    },
    tokensGenerated: { type: Number, default: 0 },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    model: { type: String },
    cost: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    progress: { type: Number, default: 0 },
    metaValidationFailures: { type: Number, default: 0 },
    metaRetryDurationMs: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

const GenJobModel = model<GenerationJob>('GenJob', GenJobSchema);

export default GenJobModel;
