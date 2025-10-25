import { z } from 'zod';
import {
  Character,
  CharacterCreatePayload,
  CharacterUpdatePayload,
} from '../types/character';

export const characterFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '请填写角色姓名')
    .max(80, '角色姓名最多 80 个字符'),
  role: z
    .string()
    .max(160, '角色定位最多 160 个字符')
    .optional(),
  background: z
    .string()
    .max(2000, '角色背景最多 2000 个字符')
    .optional(),
  goals: z
    .string()
    .max(2000, '角色目标最多 2000 个字符')
    .optional(),
  conflicts: z
    .string()
    .max(2000, '角色冲突最多 2000 个字符')
    .optional(),
  quirks: z
    .string()
    .max(1000, '角色特质最多 1000 个字符')
    .optional(),
  voice: z
    .string()
    .max(400, '角色语气最多 400 个字符')
    .optional(),
  notes: z
    .string()
    .max(2000, '角色备注最多 2000 个字符')
    .optional(),
});

export type CharacterFormValues = z.infer<typeof characterFormSchema>;

export const defaultCharacterFormValues: CharacterFormValues = {
  name: '',
  role: '',
  background: '',
  goals: '',
  conflicts: '',
  quirks: '',
  voice: '',
  notes: '',
};

const trimOrEmpty = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value.trim();
};

export const characterToFormValues = (character: Character): CharacterFormValues => ({
  name: character.name ?? '',
  role: character.role ?? '',
  background: character.background ?? '',
  goals: character.goals ?? '',
  conflicts: character.conflicts ?? '',
  quirks: character.quirks ?? '',
  voice: character.voice ?? '',
  notes: character.notes ?? '',
});

export const characterFormValuesToCreatePayload = (
  values: CharacterFormValues
): CharacterCreatePayload => {
  const payload: CharacterCreatePayload = {
    name: values.name.trim(),
  };

  const assign = (key: keyof CharacterCreatePayload, raw?: string) => {
    const trimmed = trimOrEmpty(raw);
    if (!trimmed) {
      return;
    }
    payload[key] = trimmed;
  };

  assign('role', values.role);
  assign('background', values.background);
  assign('goals', values.goals);
  assign('conflicts', values.conflicts);
  assign('quirks', values.quirks);
  assign('voice', values.voice);
  assign('notes', values.notes);

  return payload;
};

export const characterFormValuesToUpdatePayload = (
  values: CharacterFormValues
): CharacterUpdatePayload => {
  const payload: CharacterUpdatePayload = {
    name: values.name.trim(),
  };

  const assign = (key: keyof CharacterUpdatePayload, raw?: string) => {
    if (raw === undefined) {
      return;
    }
    payload[key] = trimOrEmpty(raw) ?? '';
  };

  assign('role', values.role);
  assign('background', values.background);
  assign('goals', values.goals);
  assign('conflicts', values.conflicts);
  assign('quirks', values.quirks);
  assign('voice', values.voice);
  assign('notes', values.notes);

  return payload;
};
