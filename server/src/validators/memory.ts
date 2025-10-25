import { z } from 'zod';

const mongoIdRegex = /^[a-f0-9]{24}$/i;

export const memoryTypeSchema = z.enum(['world', 'fact', 'prior_summary', 'taboo']);

const memoryRefSchema = z.object({
  chapterId: z
    .string()
    .regex(mongoIdRegex, 'chapterId must be a valid Mongo ObjectId')
    .optional(),
  label: z.string().trim().min(1).max(160).optional(),
});

export const memoryItemSchema = z.object({
  key: z.string().trim().min(1).max(160),
  type: memoryTypeSchema,
  content: z.string().trim().min(1).max(2000),
  weight: z.number().min(0).max(5).optional(),
  refs: z.array(memoryRefSchema).max(8).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  metadata: z.record(z.any()).optional(),
});

export const memorySyncSchema = z.object({
  chapterId: z
    .string()
    .regex(mongoIdRegex, 'chapterId must be a valid Mongo ObjectId')
    .optional(),
  chapterTitle: z.string().trim().min(1).max(200).optional(),
  items: z.array(memoryItemSchema).max(32),
});

export type MemorySyncRequest = z.infer<typeof memorySyncSchema>;
export type MemoryItemInput = z.infer<typeof memoryItemSchema>;
