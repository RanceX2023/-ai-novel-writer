const mongoose = require('mongoose');

const { Schema } = mongoose;

const OutlineNodeSchema = new Schema(
  {
    key: { type: String },
    title: { type: String },
    summary: { type: String },
    order: { type: Number },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const MemoryFragmentSchema = new Schema(
  {
    key: { type: String },
    label: { type: String },
    content: { type: String },
    tags: [{ type: String }],
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const StyleProfileSchema = new Schema(
  {
    tone: { type: String },
    pacing: { type: String },
    pov: { type: String },
    mood: { type: String },
    genre: { type: String },
    voice: { type: String },
    instructions: { type: String },
    additional: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const RewriteEntrySchema = new Schema(
  {
    version: { type: Number, required: true },
    content: { type: String, required: true },
    styleProfile: StyleProfileSchema,
    job: { type: Schema.Types.ObjectId, ref: 'GenJob' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ProjectSchema = new Schema(
  {
    name: { type: String, required: true },
    synopsis: { type: String },
    outlineNodes: { type: [OutlineNodeSchema], default: [] },
    memoryBank: { type: [MemoryFragmentSchema], default: [] },
    styleProfile: StyleProfileSchema,
    rewriteHistory: { type: [RewriteEntrySchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', ProjectSchema);
