import { z } from 'zod';

const mongoIdRegex = /^[a-f0-9]{24}$/i;

const fallbackModel = process.env.OPENAI_DEFAULT_MODEL?.trim() || 'gpt-4o-mini';
const allowedModelCandidates = [
  ...(process.env.OPENAI_ALLOWED_MODELS?.split(',').map((model) => model.trim()) ?? []),
  fallbackModel,
].filter(Boolean);
const allowedModels = Array.from(new Set(allowedModelCandidates));

const modelSchema = allowedModels.length
  ? z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((value) => allowedModels.includes(value), {
        message: `model 必须为以下选项之一：${allowedModels.join(', ')}`,
      })
  : z.string().trim().min(1).max(80);

const targetLengthSchema = z.object({
  unit: z.enum(['characters', 'paragraphs']),
  value: z.number().int().min(1).max(5000),
});

const styleOverrideSchema = z.object({
  tone: z.string().trim().min(1).max(120).optional(),
  pacing: z.string().trim().min(1).max(120).optional(),
  pov: z.string().trim().min(1).max(120).optional(),
  diction: z.string().trim().min(1).max(240).optional(),
  authors: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  language: z.string().trim().min(2).max(40).optional(),
  notes: z.string().trim().min(1).max(600).optional(),
  instructions: z.string().trim().min(1).max(1200).optional(),
  styleStrength: z.number().min(0).max(1).optional(),
  strength: z.number().min(0).max(1).optional(),
});

const memoryFragmentSchema = z.object({
  label: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(2000),
  type: z.enum(['fact', 'constraint', 'continuity', 'character', 'world', 'note']).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  strength: z.enum(['low', 'medium', 'high']).optional(),
});

export const chapterGenerationSchema = z.object({
  outlineNodeId: z.string().trim().min(1),
  styleProfileId: z
    .string()
    .regex(mongoIdRegex, 'styleProfileId must be a valid Mongo ObjectId')
    .optional(),
  memoryIds: z
    .array(z.string().regex(mongoIdRegex, 'memoryIds must contain valid Mongo ObjectIds'))
    .max(32)
    .optional(),
  memoryFragments: z.array(memoryFragmentSchema).max(32).optional(),
  characterIds: z
    .array(z.string().regex(mongoIdRegex, 'characterIds must contain valid Mongo ObjectIds'))
    .max(12)
    .optional(),
  styleOverride: styleOverrideSchema.optional(),
  targetLength: targetLengthSchema.optional(),
  instructions: z.string().trim().min(1).max(2000).optional(),
  model: modelSchema.optional(),
});

export const chapterContinuationSchema = z.object({
  outlineNodeId: z.string().trim().min(1).optional(),
  styleProfileId: z
    .string()
    .regex(mongoIdRegex, 'styleProfileId must be a valid Mongo ObjectId')
    .optional(),
  memoryIds: z
    .array(z.string().regex(mongoIdRegex, 'memoryIds must contain valid Mongo ObjectIds'))
    .max(32)
    .optional(),
  memoryFragments: z.array(memoryFragmentSchema).max(32).optional(),
  characterIds: z
    .array(z.string().regex(mongoIdRegex, 'characterIds must contain valid Mongo ObjectIds'))
    .max(12)
    .optional(),
  styleOverride: styleOverrideSchema.optional(),
  targetLength: targetLengthSchema,
  instructions: z.string().trim().min(1).max(2000).optional(),
  model: modelSchema.optional(),
});

export const chapterUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().max(400_000).optional(),
    autosave: z.boolean().optional(),
    metadata: z.record(z.any()).optional(),
    baseVersion: z.number().int().min(0).optional(),
  })
  .refine(
    (data) => data.title !== undefined || data.content !== undefined,
    {
      message: 'Request body must include content or title',
      path: ['content'],
    }
  );

export const chapterRevertSchema = z.object({
  reason: z.string().trim().max(200).optional(),
  metadata: z.record(z.any()).optional(),
  baseVersion: z.number().int().min(0).optional(),
});

export type ChapterGenerationInput = z.infer<typeof chapterGenerationSchema>;
export type ChapterContinuationInput = z.infer<typeof chapterContinuationSchema>;
export type ChapterUpdateInput = z.infer<typeof chapterUpdateSchema>;
export type ChapterRevertInput = z.infer<typeof chapterRevertSchema>;
