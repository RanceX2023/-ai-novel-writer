const OpenAIRateLimit = require('../../models/OpenAIRateLimit');
const ApiError = require('../../utils/ApiError');

class OpenAIRateLimiter {
  constructor({
    model = OpenAIRateLimit,
    limitPerWindow,
    windowMs,
  } = {}) {
    this.model = model;
    this.limit = Number.isInteger(limitPerWindow)
      ? limitPerWindow
      : parseInt(process.env.OPENAI_RATE_LIMIT_PER_MINUTE, 10) || 60;
    this.windowMs = Number.isInteger(windowMs)
      ? windowMs
      : parseInt(process.env.OPENAI_RATE_LIMIT_WINDOW_MS, 10) || 60_000;
  }

  #currentWindowStart(now = Date.now()) {
    const windowIndex = Math.floor(now / this.windowMs);
    return new Date(windowIndex * this.windowMs);
  }

  async consume(apiKeyId, weight = 1) {
    if (!apiKeyId) {
      throw new ApiError(500, 'Rate limiter requires a valid API key reference');
    }

    const windowStart = this.#currentWindowStart();

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

  async reset(apiKeyId) {
    if (!apiKeyId) {
      return;
    }
    await this.model.deleteMany({ apiKey: apiKeyId }).exec();
  }
}

module.exports = OpenAIRateLimiter;
