import { z } from 'zod';
import { ProjectStylePayload, StyleProfile } from '../types/project';

export const DEFAULT_STYLE_LANGUAGE = '中文';

const AUTHOR_SEPARATOR = /[\s,，、;；\n\r]+/g;

export const styleFormSchema = z.object({
  diction: z
    .string()
    .trim()
    .min(1, '请填写题材/类型')
    .max(120, '题材/类型最多 120 个字符'),
  tone: z
    .string()
    .trim()
    .min(1, '请填写文风')
    .max(120, '文风最多 120 个字符'),
  pacing: z
    .string()
    .trim()
    .min(1, '请填写节奏')
    .max(120, '节奏最多 120 个字符'),
  pov: z
    .string()
    .trim()
    .min(1, '请填写叙述视角')
    .max(120, '叙述视角最多 120 个字符'),
  authorsText: z
    .string()
    .max(400, '作家输入过长')
    .superRefine((value, ctx) => {
      const authors = parseAuthorsInput(value);
      if (authors.length > 8) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: '最多可添加 8 位作家' });
      }
      const invalid = authors.find((author) => author.length > 80);
      if (invalid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `「${invalid}」过长，请控制在 80 个字符以内`,
        });
      }
    }),
  styleStrength: z
    .number({ invalid_type_error: '请设置风格强度' })
    .min(0, '风格强度需在 0 到 1 之间')
    .max(1, '风格强度需在 0 到 1 之间'),
  language: z
    .string()
    .trim()
    .min(1, '目标语言不能为空')
    .max(40, '目标语言最多 40 个字符'),
  model: z.string().trim().max(80).optional(),
});

export type StyleFormValues = z.infer<typeof styleFormSchema>;

export const defaultStyleFormValues: StyleFormValues = {
  diction: '',
  tone: '',
  pacing: '',
  pov: '',
  authorsText: '',
  styleStrength: 0.65,
  language: DEFAULT_STYLE_LANGUAGE,
  model: '',
};

export function parseAuthorsInput(value: string): string[] {
  return value
    .split(AUTHOR_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function styleProfileToFormValues(profile?: StyleProfile | null): StyleFormValues {
  if (!profile) {
    return { ...defaultStyleFormValues };
  }
  const strength = typeof profile.styleStrength === 'number' ? clampStrength(profile.styleStrength) : defaultStyleFormValues.styleStrength;
  return {
    diction: profile.diction?.trim() ?? '',
    tone: profile.tone?.trim() ?? '',
    pacing: profile.pacing?.trim() ?? '',
    pov: profile.pov?.trim() ?? '',
    authorsText: Array.isArray(profile.authors) && profile.authors.length ? profile.authors.join('、') : '',
    styleStrength: strength,
    language: profile.language?.trim() || DEFAULT_STYLE_LANGUAGE,
    model: profile.model?.trim() ?? '',
  };
}

export function styleFormValuesToPayload(values: StyleFormValues): ProjectStylePayload {
  const authors = parseAuthorsInput(values.authorsText);
  const model = values.model?.trim();
  return {
    diction: values.diction.trim(),
    tone: values.tone.trim(),
    pacing: values.pacing.trim(),
    pov: values.pov.trim(),
    authors: authors.length ? authors : undefined,
    styleStrength: clampStrength(values.styleStrength),
    language: values.language.trim() || DEFAULT_STYLE_LANGUAGE,
    model: model ? model : undefined,
  };
}

export function clampStrength(strength: number): number {
  if (!Number.isFinite(strength)) {
    return defaultStyleFormValues.styleStrength;
  }
  if (strength < 0) {
    return 0;
  }
  if (strength > 1) {
    return 1;
  }
  return Math.round(strength * 100) / 100;
}
