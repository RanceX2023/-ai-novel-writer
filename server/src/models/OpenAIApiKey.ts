import { Schema, model, HydratedDocument } from 'mongoose';

export interface OpenAIApiKey {
  alias: string;
  encryptedKey: string;
  isActive: boolean;
  lastUsedAt?: Date;
  usageCount: number;
  totalTokens: number;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type OpenAIApiKeyDocument = HydratedDocument<OpenAIApiKey>;

const OpenAIApiKeySchema = new Schema<OpenAIApiKey>(
  {
    alias: { type: String, required: true, unique: true },
    encryptedKey: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    lastUsedAt: { type: Date },
    usageCount: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

const OpenAIApiKeyModel = model<OpenAIApiKey>('OpenAIApiKey', OpenAIApiKeySchema);

export default OpenAIApiKeyModel;
