import { z } from 'zod';

const outlineBeatSchema = z.object({
  order: z.number().int().min(1).max(20),
  title: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(360),
  focus: z.string().trim().min(1).max(120).optional(),
  mustInclude: z.array(z.string().trim().min(1).max(120)).min(1).max(3).optional(),
  avoid: z.array(z.string().trim().min(1).max(120)).min(1).max(3).optional(),
});

const outlineMetaSchema = z.object({
  title: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(360),
  beats: z.array(outlineBeatSchema).min(3).max(7),
  tabooNotes: z.array(z.string().trim().min(1).max(160)).min(1).max(6).optional(),
  thematicHooks: z.array(z.string().trim().min(1).max(120)).min(1).max(4).optional(),
});

const scenePlanSchema = z.object({
  order: z.number().int().min(1).max(12),
  title: z.string().trim().min(1).max(80),
  objective: z.string().trim().min(1).max(240),
  conflict: z.string().trim().min(1).max(200).optional(),
  pov: z.string().trim().min(1).max(60).optional(),
  beatRef: z.number().int().min(1).max(20).optional(),
});

const targetLengthSchema = z
  .object({
    unit: z.enum(['characters', 'paragraphs']),
    ideal: z.number().int().min(300).max(6000).optional(),
    min: z.number().int().min(200).max(6000).optional(),
    max: z.number().int().min(200).max(7000).optional(),
  })
  .refine(
    (value) => value.ideal !== undefined || value.min !== undefined || value.max !== undefined,
    { message: 'targetLength 至少需要提供 ideal、min、max 中的一个值' }
  );

export const chapterMetaSchema = z.object({
  outline: outlineMetaSchema,
  scenes: z.array(scenePlanSchema).min(2).max(8),
  closingStrategy: z.string().trim().min(1).max(200),
  tonalShift: z.string().trim().min(1).max(200).optional(),
  continuityChecklist: z.array(z.string().trim().min(1).max(200)).min(1).max(6).optional(),
  targetLength: targetLengthSchema.optional(),
});

export type OutlineBeatMeta = z.infer<typeof outlineBeatSchema>;
export type OutlineMeta = z.infer<typeof outlineMetaSchema>;
export type ScenePlanMeta = z.infer<typeof scenePlanSchema>;
export type ChapterMeta = z.infer<typeof chapterMetaSchema>;

export const chapterMetaJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['outline', 'scenes', 'closingStrategy'],
  properties: {
    outline: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'summary', 'beats'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 80 },
        summary: { type: 'string', minLength: 1, maxLength: 360 },
        beats: {
          type: 'array',
          minItems: 3,
          maxItems: 7,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['order', 'title', 'summary'],
            properties: {
              order: { type: 'integer', minimum: 1, maximum: 20 },
              title: { type: 'string', minLength: 1, maxLength: 80 },
              summary: { type: 'string', minLength: 1, maxLength: 360 },
              focus: { type: 'string', minLength: 1, maxLength: 120 },
              mustInclude: {
                type: 'array',
                minItems: 1,
                maxItems: 3,
                items: { type: 'string', minLength: 1, maxLength: 120 },
              },
              avoid: {
                type: 'array',
                minItems: 1,
                maxItems: 3,
                items: { type: 'string', minLength: 1, maxLength: 120 },
              },
            },
          },
        },
        tabooNotes: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: { type: 'string', minLength: 1, maxLength: 160 },
        },
        thematicHooks: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
    },
    scenes: {
      type: 'array',
      minItems: 2,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['order', 'title', 'objective'],
        properties: {
          order: { type: 'integer', minimum: 1, maximum: 12 },
          title: { type: 'string', minLength: 1, maxLength: 80 },
          objective: { type: 'string', minLength: 1, maxLength: 240 },
          conflict: { type: 'string', minLength: 1, maxLength: 200 },
          pov: { type: 'string', minLength: 1, maxLength: 60 },
          beatRef: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
    },
    closingStrategy: { type: 'string', minLength: 1, maxLength: 200 },
    tonalShift: { type: 'string', minLength: 1, maxLength: 200 },
    continuityChecklist: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: { type: 'string', minLength: 1, maxLength: 200 },
    },
    targetLength: {
      type: 'object',
      additionalProperties: false,
      required: ['unit'],
      properties: {
        unit: { type: 'string', enum: ['characters', 'paragraphs'] },
        ideal: { type: 'integer', minimum: 300, maximum: 6000 },
        min: { type: 'integer', minimum: 200, maximum: 6000 },
        max: { type: 'integer', minimum: 200, maximum: 7000 },
      },
      allOf: [
        {
          anyOf: [
            { required: ['ideal'] },
            { required: ['min'] },
            { required: ['max'] },
          ],
        },
      ],
    },
  },
};

export type ChapterMetaJsonSchema = typeof chapterMetaJsonSchema;
