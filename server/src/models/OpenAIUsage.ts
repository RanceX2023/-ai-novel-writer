import { Schema, Types, model, HydratedDocument } from 'mongoose';

export interface OpenAIUsage {
  apiKey: Types.ObjectId;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestId?: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type OpenAIUsageDocument = HydratedDocument<OpenAIUsage>;

const OpenAIUsageSchema = new Schema<OpenAIUsage>(
  {
    apiKey: { type: Schema.Types.ObjectId, ref: 'OpenAIApiKey', required: true },
    model: { type: String, required: true },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    requestId: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

const OpenAIUsageModel = model<OpenAIUsage>('OpenAIUsage', OpenAIUsageSchema);

export default OpenAIUsageModel;
