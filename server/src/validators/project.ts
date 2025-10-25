import { z } from 'zod';

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  synopsis: z.string().trim().min(1).max(2000).optional(),
});

export const projectStyleSchema = z.object({
  genre: z.string().trim().min(1).max(120),
  tone: z.string().trim().min(1).max(120),
  pacing: z.string().trim().min(1).max(120),
  pov: z.string().trim().min(1).max(120),
  voice: z.string().trim().min(1).max(120).optional(),
  language: z.string().trim().min(2).max(40).optional(),
  instructions: z.string().trim().min(1).max(500).optional(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectStyleInput = z.infer<typeof projectStyleSchema>;
