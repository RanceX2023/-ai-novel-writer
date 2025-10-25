import { Model, Types } from 'mongoose';
import OpenAIRateLimitModel, {
  OpenAIRateLimit,
  OpenAIRateLimitDocument,
} from '../../models/OpenAIRateLimit';
import ApiError from '../../utils/ApiError';

export interface RateLimiterOptions {
  model?: Model<OpenAIRateLimit>;
  limitPerWindow?: number;
  windowMs?: number;
}

class OpenAIRateLimiter {
  private model: Model<OpenAIRateLimit>;

  private limit: number;

  private windowMs: number;

  constructor({ model = OpenAIRateLimitModel, limitPerWindow, windowMs }: RateLimiterOptions = {}) {
    this.model = model;
    this.limit = Number.isInteger(limitPerWindow)
      ? Number(limitPerWindow)
      : parseInt(process.env.OPENAI_RATE_LIMIT_PER_MINUTE ?? '', 10) || 60;
    this.windowMs = Number.isInteger(windowMs)
      ? Number(windowMs)
      : parseInt(process.env.OPENAI_RATE_LIMIT_WINDOW_MS ?? '', 10) || 60_000;
  }

  private currentWindowStart(now: number = Date.now()): Date {
    const windowIndex = Math.floor(now / this.windowMs);
    return new Date(windowIndex * this.windowMs);
  }

  async consume(apiKeyId: Types.ObjectId | string, weight = 1): Promise<OpenAIRateLimitDocument> {
    if (!apiKeyId) {
      throw new ApiError(500, 'Rate limiter requires a valid API key reference');
    }

    const windowStart = this.currentWindowStart();

    const record = await this.model
      .findOneAndUpdate(
        { apiKey: apiKeyId, windowStart, windowMs: this.windowMs },
        {
          $setOnInsert: { limit: this.limit },
          $inc: { count: weight },
        },
        { new: true, upsert: true }
      )
      .exec();

    if (!record) {
      throw new ApiError(500, 'Unable to enforce OpenAI rate limit.');
    }

    if (record.count > (record.limit || this.limit)) {
      await this.model
        .updateOne({ _id: record._id }, { $inc: { count: -weight } })
        .exec();
      throw new ApiError(429, 'OpenAI rate limit exceeded for the current window.');
    }

    return record;
  }

  async reset(apiKeyId: Types.ObjectId | string | undefined): Promise<void> {
    if (!apiKeyId) {
      return;
    }
    await this.model.deleteMany({ apiKey: apiKeyId }).exec();
  }
}

export default OpenAIRateLimiter;
