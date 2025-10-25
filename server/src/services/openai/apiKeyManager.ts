import crypto from 'crypto';
import { Model } from 'mongoose';
import OpenAIApiKeyModel, {
  OpenAIApiKey,
  OpenAIApiKeyDocument,
} from '../../models/OpenAIApiKey';
import ApiError from '../../utils/ApiError';

export interface KeyManagerOptions {
  model?: Model<OpenAIApiKey>;
  encryptionSecret?: string;
}

class OpenAIKeyManager {
  private model: Model<OpenAIApiKey>;

  private keyBuffer: Buffer;

  private algorithm: string;

  constructor({ model = OpenAIApiKeyModel, encryptionSecret }: KeyManagerOptions = {}) {
    const secret = encryptionSecret || process.env.OPENAI_KEY_SECRET;
    if (!secret) {
      throw new Error('OPENAI_KEY_SECRET must be configured to manage API keys');
    }

    this.model = model;
    this.keyBuffer = crypto.createHash('sha256').update(secret).digest();
    this.algorithm = 'aes-256-gcm';
  }

  encrypt(rawKey: string): string {
    if (typeof rawKey !== 'string' || rawKey.length === 0) {
      throw new Error('An API key value is required for encryption');
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.keyBuffer, iv);
    const encrypted = Buffer.concat([cipher.update(rawKey, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(payload: string): string {
    if (typeof payload !== 'string' || payload.split(':').length !== 3) {
      throw new Error('Invalid encrypted payload');
    }
    const [ivEncoded, authTagEncoded, encryptedEncoded] = payload.split(':');
    const iv = Buffer.from(ivEncoded, 'base64');
    const authTag = Buffer.from(authTagEncoded, 'base64');
    const encrypted = Buffer.from(encryptedEncoded, 'base64');

    const decipher = crypto.createDecipheriv(this.algorithm, this.keyBuffer, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  async addKey({ alias, apiKey, metadata }: { alias: string; apiKey: string; metadata?: Record<string, unknown> }): Promise<OpenAIApiKeyDocument> {
    if (!alias || !apiKey) {
      throw new Error('Both alias and apiKey are required to add a key');
    }

    const encryptedKey = this.encrypt(apiKey);
    return this.model.create({
      alias,
      encryptedKey,
      metadata,
    });
  }

  async getKeyForUse(): Promise<{ keyDoc: OpenAIApiKeyDocument; apiKey: string }> {
    const keyDoc = await this.model
      .findOne({ isActive: true })
      .sort({ lastUsedAt: 1, createdAt: 1 })
      .exec();

    if (!keyDoc) {
      throw new ApiError(500, 'No OpenAI API keys are configured.');
    }

    const apiKey = this.decrypt(keyDoc.encryptedKey);
    return { keyDoc, apiKey };
  }

  async markUsage(keyDoc: OpenAIApiKeyDocument | null | undefined, { tokens }: { tokens?: number } = {}): Promise<void> {
    if (!keyDoc) {
      return;
    }

    const updates: {
      $set: { lastUsedAt: Date };
      $inc: { usageCount: number; totalTokens?: number };
    } = {
      $set: { lastUsedAt: new Date() },
      $inc: { usageCount: 1 },
    };

    if (typeof tokens === 'number' && Number.isFinite(tokens)) {
      updates.$inc.totalTokens = tokens;
    }

    await this.model.updateOne({ _id: keyDoc._id }, updates).exec();
  }
}

export default OpenAIKeyManager;
