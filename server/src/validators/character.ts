import { z } from 'zod';

const normaliseOptional = (schema: z.ZodString) =>
  schema
    .trim()
    .transform((value) => value || undefined)
    .optional();

export const characterCreateSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(80),
  role: normaliseOptional(z.string().max(160)),
  background: normaliseOptional(z.string().max(2000)),
  goals: normaliseOptional(z.string().max(2000)),
  conflicts: normaliseOptional(z.string().max(2000)),
  quirks: normaliseOptional(z.string().max(1000)),
  voice: normaliseOptional(z.string().max(400)),
  notes: normaliseOptional(z.string().max(2000)),
});

export const characterUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    role: normaliseOptional(z.string().max(160)),
    background: normaliseOptional(z.string().max(2000)),
    goals: normaliseOptional(z.string().max(2000)),
    conflicts: normaliseOptional(z.string().max(2000)),
    quirks: normaliseOptional(z.string().max(1000)),
    voice: normaliseOptional(z.string().max(400)),
    notes: normaliseOptional(z.string().max(2000)),
  })
  .refine(
    (value) =>
      value.name !== undefined
      || value.role !== undefined
      || value.background !== undefined
      || value.goals !== undefined
      || value.conflicts !== undefined
      || value.quirks !== undefined
      || value.voice !== undefined
      || value.notes !== undefined,
    {
      message: '至少需要提供一项字段进行更新',
      path: ['name'],
    }
  );

export type CharacterCreateInput = z.infer<typeof characterCreateSchema>;
export type CharacterUpdateInput = z.infer<typeof characterUpdateSchema>;
