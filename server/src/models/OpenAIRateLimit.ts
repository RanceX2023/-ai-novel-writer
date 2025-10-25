import { Schema, Types, model, HydratedDocument } from 'mongoose';

export interface OpenAIRateLimit {
  apiKey: Types.ObjectId;
  windowStart: Date;
  windowMs: number;
  limit: number;
  count: number;
}

export type OpenAIRateLimitDocument = HydratedDocument<OpenAIRateLimit>;

const OpenAIRateLimitSchema = new Schema<OpenAIRateLimit>(
  {
    apiKey: { type: Schema.Types.ObjectId, ref: 'OpenAIApiKey', required: true },
    windowStart: { type: Date, required: true },
    windowMs: { type: Number, required: true },
    limit: { type: Number, required: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: false }
);

OpenAIRateLimitSchema.index({ apiKey: 1, windowStart: 1, windowMs: 1 }, { unique: true });

const OpenAIRateLimitModel = model<OpenAIRateLimit>('OpenAIRateLimit', OpenAIRateLimitSchema);

export default OpenAIRateLimitModel;
