import { Document, Schema, model } from 'mongoose';

export interface RuntimeConfigDocument extends Document {
  scope: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const runtimeConfigSchema = new Schema<RuntimeConfigDocument>(
  {
    scope: {
      type: String,
      required: true,
      default: 'global',
      unique: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
  },
  {
    timestamps: true,
    minimize: false,
    versionKey: false,
  }
);

runtimeConfigSchema.index({ scope: 1 }, { unique: true });

export default model<RuntimeConfigDocument>('RuntimeConfig', runtimeConfigSchema);
