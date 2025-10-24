const mongoose = require('mongoose');

const { Schema } = mongoose;

const ChapterVersionSchema = new Schema(
  {
    version: { type: Number, required: true },
    content: { type: String, required: true },
    delta: { type: String },
    job: { type: Schema.Types.ObjectId, ref: 'GenJob' },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ChapterSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true },
    order: { type: Number },
    synopsis: { type: String },
    content: { type: String, default: '' },
    versions: { type: [ChapterVersionSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Chapter', ChapterSchema);
