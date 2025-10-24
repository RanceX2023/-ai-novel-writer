const mongoose = require('mongoose');

const { Schema } = mongoose;

const GenJobSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    chapter: { type: Schema.Types.ObjectId, ref: 'Chapter' },
    type: {
      type: String,
      enum: ['generate', 'continue', 'rewrite'],
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
      default: 'queued',
    },
    metadata: { type: Schema.Types.Mixed },
    result: { type: Schema.Types.Mixed },
    error: { type: Schema.Types.Mixed },
    tokensGenerated: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GenJob', GenJobSchema);
