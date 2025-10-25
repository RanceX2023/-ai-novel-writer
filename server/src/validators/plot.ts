import { z } from 'zod';

const mongoIdRegex = /^[a-f0-9]{24}$/i;
const hexColorRegex = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

const stringArraySchema = z.array(z.string().trim().min(1).max(48)).max(12);

export const plotArcCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  color: z
    .string()
    .trim()
    .regex(hexColorRegex, 'color must be a valid hex code')
    .optional(),
  summary: z.string().trim().min(1).max(2000).optional(),
  goal: z.string().trim().min(1).max(600).optional(),
  order: z.number().int().min(0).max(10_000).optional(),
  themes: stringArraySchema.optional(),
  metadata: z.record(z.any()).optional(),
});

export const plotArcUpdateSchema = plotArcCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  {
    message: 'Request body must include at least one field',
  }
);

export const plotPointCreateSchema = z.object({
  arcId: z.string().regex(mongoIdRegex, 'arcId must be a valid Mongo ObjectId'),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000).optional(),
  chapterId: z
    .string()
    .regex(mongoIdRegex, 'chapterId must be a valid Mongo ObjectId')
    .optional(),
  tension: z.number().min(0).max(10).optional(),
  order: z.number().int().min(0).max(10_000).optional(),
  beatType: z.string().trim().min(1).max(120).optional(),
  status: z.string().trim().min(1).max(120).optional(),
  aiSuggested: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

export const plotPointUpdateSchema = plotPointCreateSchema
  .partial()
  .extend({
    arcId: z.string().regex(mongoIdRegex, 'arcId must be a valid Mongo ObjectId').optional(),
    title: z.string().trim().min(1).max(200).optional(),
    chapterId: z
      .union([z.string().regex(mongoIdRegex, 'chapterId must be a valid Mongo ObjectId'), z.null()])
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: 'Request body must include at least one field',
    }
  );

export const plotSuggestionSchema = z.object({
  arcId: z.string().regex(mongoIdRegex, 'arcId must be a valid Mongo ObjectId').optional(),
  chapterId: z
    .string()
    .regex(mongoIdRegex, 'chapterId must be a valid Mongo ObjectId')
    .optional(),
  theme: z.string().trim().min(1).max(160).optional(),
  tone: z.string().trim().min(1).max(120).optional(),
  focus: z.string().trim().min(1).max(240).optional(),
  count: z.number().int().min(1).max(8).optional(),
});

export type PlotArcCreateInput = z.infer<typeof plotArcCreateSchema>;
export type PlotArcUpdateInput = z.infer<typeof plotArcUpdateSchema>;
export type PlotPointCreateInput = z.infer<typeof plotPointCreateSchema>;
export type PlotPointUpdateInput = z.infer<typeof plotPointUpdateSchema>;
export type PlotSuggestionInput = z.infer<typeof plotSuggestionSchema>;
