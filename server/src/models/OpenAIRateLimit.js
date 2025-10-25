const mongoose = require('mongoose');

const { Schema } = mongoose;

const OpenAIRateLimitSchema = new Schema(
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

module.exports = mongoose.model('OpenAIRateLimit', OpenAIRateLimitSchema);
