import { z } from 'zod';

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  synopsis: z.string().trim().min(1).max(2000).optional(),
});

export const projectStyleSchema = z.object({
  tone: z.string().trim().min(1).max(120),
  pacing: z.string().trim().min(1).max(120),
  pov: z.string().trim().min(1).max(120),
  diction: z.string().trim().min(1).max(240),
  authors: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  styleStrength: z.number().min(0).max(1).optional(),
  language: z.string().trim().min(2).max(40).optional(),
  notes: z.string().trim().min(1).max(600).optional(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectStyleInput = z.infer<typeof projectStyleSchema>;
