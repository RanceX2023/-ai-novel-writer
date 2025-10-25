import type { ChatCompletionOptions } from '../services/openai';
import type { PromptMemoryFragment, PromptStyleProfile } from './promptTemplates';
import type { OutlineGenerateInput } from '../validators/outline';

export interface OutlinePromptOptions extends OutlineGenerateInput {
  projectTitle: string;
  synopsis?: string;
  styleProfile?: PromptStyleProfile;
  memoryFragments?: PromptMemoryFragment[];
}

function formatStyleProfile(style?: PromptStyleProfile, strength?: number): string {
  if (!style || Object.keys(style).length === 0) {
    return strength !== undefined
      ? `未提供详细风格设定，整体风格强度约为 ${(strength * 100).toFixed(0)}%。`
      : '未提供详细风格设定，可综合常见长篇小说节奏与语气。';
  }

  const segments: string[] = [];
  if (style.genre) segments.push(`类型：${style.genre}`);
  if (style.tone) segments.push(`语气：${style.tone}`);
  if (style.mood) segments.push(`情绪：${style.mood}`);
  if (style.pacing) segments.push(`节奏：${style.pacing}`);
  if (style.pov) segments.push(`视角：${style.pov}`);
  if (style.voice) segments.push(`叙述声音：${style.voice}`);
  if (style.language) segments.push(`语言要求：${style.language}`);
  if (style.instructions) segments.push(`额外指令：${style.instructions}`);

  if (strength !== undefined) {
    segments.push(`风格执行强度：约 ${(strength * 100).toFixed(0)}%。`);
  }

  return segments.join('；');
}

function formatMemory(memory: PromptMemoryFragment[] = [], limit = 12): string {
  if (!memory.length) {
    return '暂无额外记忆片段，可自行发挥但需保持整体逻辑统一。';
  }

  return memory
    .slice(0, limit)
    .map((fragment, index) => {
      const label = fragment.label || `记忆片段${index + 1}`;
      const type = fragment.type ? `【${fragment.type}】` : '';
      return `${index + 1}. ${type}${label} —— ${fragment.content}`;
    })
    .join('\n');
}

function structureLabel(structure: OutlineGenerateInput['actStructure']): string {
  return structure === 'five_act' ? '五幕结构' : '三幕结构';
}

export function buildOutlinePrompt(options: OutlinePromptOptions): ChatCompletionOptions {
  const {
    projectTitle,
    synopsis,
    actStructure,
    chapterCount,
    targetChapterLength,
    styleStrength,
    styleProfile,
    memoryFragments,
    model,
  } = options;

  const styleLine = formatStyleProfile(styleProfile, styleStrength);
  const memorySection = formatMemory(memoryFragments);
  const targetLengthLine = targetChapterLength
    ? `单章目标长度约 ${targetChapterLength} 字，可上下浮动 15%。`
    : '单章目标长度未指定，可根据情节密度自由控制。';

  const userContent = [
    `项目名称：《${projectTitle || '未命名项目'}》`,
    synopsis ? `故事梗概：${synopsis}` : '故事梗概：未提供，请保持整体连贯性。',
    `幕结构：${structureLabel(actStructure)}，总章节数 ${chapterCount}。`,
    targetLengthLine,
    `风格指引：${styleLine || '无特殊要求'}`,
    '记忆要点：',
    memorySection,
    '',
    '请严格遵循以下输出规范，仅返回 JSON 对象：',
    '{',
    '  "outlineTitle": "可选，总体大纲标题",',
    '  "structure": "three_act | five_act",',
    '  "acts": [',
    '    {',
    '      "id": "act-1",',
    '      "title": "第一幕：建立世界",',
    '      "summary": "描述该幕的整体推进",',
    '      "status": "draft",',
    '      "tags": ["开端"],',
    '      "chapters": [',
    '        {',
    '          "id": "chapter-1",',
    '          "title": "第一章：xxx",',
    '          "summary": "该章情节概述，突出冲突与转折",',
    '          "status": "draft",',
    '          "targetLength": 1600,',
    '          "tags": ["人物"],',
    '          "beats": [',
    '            {',
    '              "id": "beat-1",',
    '              "title": "初遇",',
    '              "summary": "节拍描述，突出冲突/悬念/角色目标",',
    '              "focus": "冲突",',
    '              "outcome": "主角意识到危机",',
    '              "tags": ["铺垫"]',
    '            }',
    '          ]',
    '        }',
    '      ]',
    '    }
',
    '  ],',
    '  "notes": ["可选总体提醒"]',
    '}',
    '',
    '约束说明：',
    '- 将章节平均分配到各幕，可略有浮动以符合剧情节奏；',
    '- 每个章节至少包含 2 条节拍，节拍需指向明确的动作或情绪推进；',
    '- 摘要必须为中文，且避免与记忆片段矛盾；',
    '- 如果记忆提示了禁忌或既定事实，需体现在相关章节的节拍中；',
    '- 所有文本请避免使用罗马数字或英文幕标题，统一使用中文表达；',
    '- 输出必须是合法 JSON，不得包含多余注释或自然语言。',
  ].join('\n');

  const systemContent =
    '你是一名资深的中文长篇小说结构编辑，擅长根据给定设定生成完整的大纲。'
    + '请以严谨的叙事逻辑组织剧幕、章节与节拍，确保人物动机与冲突推进连贯。'
    + '输出必须为结构化 JSON，便于后续程序解析。';

  const metadata = {
    type: 'outline_generation',
    projectTitle,
  } as Record<string, unknown>;

  return {
    model,
    temperature: 0.65,
    responseFormat: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
    metadata,
  };
}
