const mongoose = require('mongoose');

const { Schema } = mongoose;

const OpenAIUsageSchema = new Schema(
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

module.exports = mongoose.model('OpenAIUsage', OpenAIUsageSchema);
