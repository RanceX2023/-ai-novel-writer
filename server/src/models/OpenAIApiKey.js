const mongoose = require('mongoose');

const { Schema } = mongoose;

const OpenAIApiKeySchema = new Schema(
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

module.exports = mongoose.model('OpenAIApiKey', OpenAIApiKeySchema);
