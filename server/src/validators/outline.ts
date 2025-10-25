import { z } from 'zod';

export const outlineActStructureSchema = z.enum(['three_act', 'five_act'], {
  message: '幕结构仅支持三幕或五幕',
});

export const outlineGenerateSchema = z.object({
  actStructure: outlineActStructureSchema,
  chapterCount: z
    .number({ required_error: '章节数量不能为空' })
    .int('章节数量必须为整数')
    .min(3, '至少需要 3 个章节')
    .max(120, '章节数量最多为 120 个'),
  targetChapterLength: z
    .number({ invalid_type_error: '章节目标长度必须为数字' })
    .int('章节目标长度必须为整数')
    .min(300, '章节目标长度至少 300 字')
    .max(8000, '章节目标长度最多 8000 字')
    .optional(),
  styleStrength: z
    .number({ invalid_type_error: '风格强度必须为 0 到 1 之间的小数' })
    .min(0, '风格强度不得小于 0')
    .max(1, '风格强度不得大于 1')
    .optional(),
  model: z
    .string({ invalid_type_error: '模型名称必须为字符串' })
    .trim()
    .min(1, '模型名称不能为空')
    .max(80, '模型名称长度过长')
    .optional(),
});

export type OutlineGenerateInput = z.infer<typeof outlineGenerateSchema>;

const outlineBeatInputSchema = z.object({
  beatId: z
    .string({ invalid_type_error: '节拍 ID 必须为字符串' })
    .trim()
    .min(1, '节拍 ID 不能为空')
    .optional(),
  title: z
    .string({ invalid_type_error: '节拍标题必须为字符串' })
    .trim()
    .max(120, '节拍标题最多 120 字')
    .optional(),
  summary: z
    .string({ required_error: '节拍摘要不能为空' })
    .trim()
    .min(1, '节拍摘要不能为空')
    .max(500, '节拍摘要最多 500 字'),
  order: z
    .number({ invalid_type_error: '节拍顺序必须为数字' })
    .int('节拍顺序必须为整数')
    .min(0, '节拍顺序必须从 0 开始')
    .optional(),
  focus: z
    .string({ invalid_type_error: '节拍焦点必须为字符串' })
    .trim()
    .max(80, '节拍焦点最多 80 字')
    .optional(),
  outcome: z
    .string({ invalid_type_error: '节拍结果必须为字符串' })
    .trim()
    .max(160, '节拍结果最多 160 字')
    .optional(),
  status: z
    .string({ invalid_type_error: '节拍状态必须为字符串' })
    .trim()
    .max(40, '节拍状态最多 40 字')
    .optional(),
  tags: z
    .array(z.string().trim().min(1, '标签不可为空').max(30, '单个标签最多 30 字'), {
      invalid_type_error: '节拍标签必须为字符串数组',
    })
    .max(8, '单个节拍最多 8 个标签')
    .optional(),
  meta: z.record(z.any()).optional(),
});

export const outlineNodeUpsertSchema = z.object({
  nodeId: z
    .string({ invalid_type_error: '节点 ID 必须为字符串' })
    .trim()
    .min(1, '节点 ID 不能为空')
    .optional(),
  parentId: z
    .string({ invalid_type_error: '父节点 ID 必须为字符串' })
    .trim()
    .min(1, '父节点 ID 不能为空')
    .nullable()
    .optional(),
  title: z
    .string({ required_error: '节点标题不能为空' })
    .trim()
    .min(1, '节点标题不能为空')
    .max(200, '节点标题最多 200 字'),
  summary: z
    .string({ invalid_type_error: '节点摘要必须为字符串' })
    .trim()
    .max(1000, '节点摘要最多 1000 字')
    .optional(),
  status: z
    .string({ invalid_type_error: '节点状态必须为字符串' })
    .trim()
    .max(40, '节点状态最多 40 字')
    .optional(),
  tags: z
    .array(z.string().trim().min(1, '标签不可为空').max(30, '单个标签最多 30 字'), {
      invalid_type_error: '节点标签必须为字符串数组',
    })
    .max(16, '单个节点最多 16 个标签')
    .optional(),
  beats: outlineBeatInputSchema.array().max(32, '单个节点最多 32 条节拍').optional(),
  meta: z.record(z.any()).optional(),
});

export type OutlineNodeUpsertInput = z.infer<typeof outlineNodeUpsertSchema>;

export const outlineReorderSchema = z.object({
  updates: z
    .array(
      z.object({
        nodeId: z.string().trim().min(1, '节点 ID 不能为空'),
        parentId: z
          .string({ invalid_type_error: '父节点 ID 必须为字符串' })
          .trim()
          .min(1, '父节点 ID 不能为空')
          .nullable(),
        order: z
          .number({ invalid_type_error: '顺序必须为数字' })
          .int('顺序必须为整数')
          .min(0, '顺序必须为非负整数'),
      })
    )
    .min(1, '至少需要一个节点更新'),
});

export type OutlineReorderInput = z.infer<typeof outlineReorderSchema>;

const outlineBeatAiSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().max(120).optional(),
  summary: z.string().trim().min(1).max(500),
  focus: z.string().trim().max(80).optional(),
  outcome: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
  meta: z.record(z.any()).optional(),
});

const outlineChapterAiSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1000),
  status: z.string().trim().max(40).optional(),
  targetLength: z.number().int().min(200).max(8000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(16).optional(),
  meta: z.record(z.any()).optional(),
  beats: z.array(outlineBeatAiSchema).max(32).optional(),
});

const outlineActAiSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1000),
  status: z.string().trim().max(40).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(16).optional(),
  meta: z.record(z.any()).optional(),
  chapters: z.array(outlineChapterAiSchema).min(1).max(80),
});

export const outlineAiResponseSchema = z.object({
  outlineTitle: z.string().trim().min(1).max(200).optional(),
  structure: outlineActStructureSchema.optional(),
  acts: z.array(outlineActAiSchema).min(1).max(6),
  notes: z.array(z.string().trim().max(400)).max(12).optional(),
});

export type OutlineAiResponse = z.infer<typeof outlineAiResponseSchema>;
export type OutlineAiAct = z.infer<typeof outlineActAiSchema>;
export type OutlineAiChapter = z.infer<typeof outlineChapterAiSchema>;
export type OutlineAiBeat = z.infer<typeof outlineBeatAiSchema>;
