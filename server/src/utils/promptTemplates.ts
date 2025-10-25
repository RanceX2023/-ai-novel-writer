export interface PromptStyleProfile {
  voice?: string;
  tone?: string;
  mood?: string;
  pacing?: string;
  pov?: string;
  genre?: string;
  language?: string;
  instructions?: string;
  strength?: number;
  [key: string]: unknown;
}

export interface PromptMemoryFragment {
  label: string;
  content: string;
  type?: string;
  tags?: string[];
  strength?: string;
  [key: string]: unknown;
}

export interface PromptOutlineNode {
  id?: string;
  key?: string;
  title?: string;
  summary?: string;
  order?: number;
  [key: string]: unknown;
}

export interface ChapterPromptOptions {
  projectTitle: string;
  synopsis?: string;
  chapterTitle?: string;
  outlineNode?: PromptOutlineNode | null;
  additionalOutline?: PromptOutlineNode[];
  memoryFragments?: PromptMemoryFragment[];
  styleProfile?: PromptStyleProfile;
  continuation?: boolean;
  previousSummary?: string;
  instructions?: string;
  targetLength?: {
    unit: 'characters' | 'paragraphs';
    value: number;
  };
  model?: string;
}

function buildStyleDirective(style: PromptStyleProfile = {}): string {
  const parts: string[] = [];
  if (style.voice) parts.push(`叙事声音：${style.voice}`);
  if (style.tone) parts.push(`语气基调：${style.tone}`);
  if (style.mood) parts.push(`情绪氛围：${style.mood}`);
  if (style.pacing) parts.push(`节奏控制：${style.pacing}`);
  if (style.genre) parts.push(`类型标签：${style.genre}`);
  if (style.pov) parts.push(`叙事视角：${style.pov}`);
  if (typeof style.strength === 'number') {
    parts.push(`风格执行强度：${Math.round(style.strength * 100)}%`);
  }
  if (style.instructions) parts.push(`额外指令：${style.instructions}`);

  const languageHint = style.language
    ? `输出语言必须为${style.language}，除非特别指定。`
    : '输出语言默认为中文。';

  if (!parts.length) {
    return languageHint;
  }

  return `${languageHint} 风格参数：${parts.join('；')}。`;
}

function buildMemorySection(memory: PromptMemoryFragment[] = []): string {
  if (!memory.length) {
    return '暂无额外事实或约束。';
  }
  return memory
    .map((fragment, index) => {
      const label = fragment.label || `记忆片段${index + 1}`;
      const type = fragment.type ? `【${fragment.type}】` : '';
      const tags = fragment.tags?.length ? ` 标签：${fragment.tags.join('、')}` : '';
      return `- ${type}${label}：${fragment.content}${tags}`;
    })
    .join('\n');
}

function buildOutlineSection(node?: PromptOutlineNode | null, additional: PromptOutlineNode[] = []): string {
  if (!node && additional.length === 0) {
    return '未提供任何章节大纲，请根据项目设定合理发挥。';
  }

  const segments: string[] = [];
  if (node) {
    const header = node.title ? `${node.title}` : '当前大纲节点';
    segments.push(`当前章节节点：${header}${node.summary ? ` —— ${node.summary}` : ''}`);
  }

  if (additional.length) {
    segments.push(
      '相关情节概览：\n'
        + additional
          .map((outline, index) => {
            const label = outline.title || `情节节点${index + 1}`;
            return `${index + 1}. ${label} —— ${outline.summary ?? '无摘要'}`;
          })
          .join('\n')
    );
  }

  return segments.join('\n\n');
}

export interface ChatPromptPayload {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

export function buildChapterPrompt(options: ChapterPromptOptions): ChatPromptPayload {
  const {
    projectTitle,
    synopsis,
    chapterTitle,
    outlineNode,
    additionalOutline = [],
    memoryFragments = [],
    styleProfile,
    continuation,
    previousSummary,
    instructions,
    targetLength,
  } = options;

  const outlineSection = buildOutlineSection(outlineNode, additionalOutline);
  const memorySection = buildMemorySection(memoryFragments);
  const styleSection = buildStyleDirective(styleProfile);

  const continuationLine = continuation
    ? '这是续写任务，请保持与既有章节在情节、视角与语调上的连续性。'
    : '请创作一个全新的章节，使其能够自然地推动整体剧情。';

  const lengthHint = targetLength
    ? `预计篇幅：约${targetLength.value}${targetLength.unit === 'paragraphs' ? '段' : '字'}。`
    : '篇幅可根据剧情需要自由伸缩，但需保持完整的故事节奏。';

  const contextLines = [
    `项目名称：《${projectTitle || '未命名项目'}》。`,
    synopsis ? `故事梗概：${synopsis}` : '',
    chapterTitle ? `章节标题：${chapterTitle}` : '',
    previousSummary ? `上一章节概要：${previousSummary}` : '',
    continuationLine,
    lengthHint,
    '章节大纲：',
    outlineSection,
    '记忆库重点：',
    memorySection,
    styleSection,
    instructions ? `额外指令：${instructions}` : '',
    '输出格式：使用 Markdown，包含明确的小节或场景标题，并以引人入胜的方式结尾。',
  ]
    .filter(Boolean)
    .join('\n\n');

  const resolvedModel = options.model || process.env.OPENAI_CHAPTER_MODEL || process.env.OPENAI_DEFAULT_MODEL;

  return {
    model: resolvedModel,
    temperature: continuation ? 0.6 : 0.7,
    messages: [
      {
        role: 'system',
        content:
          '你是一名精通长篇小说结构的中文写作编辑，擅长打造富有感染力且节奏紧凑的章节。'
          + '必须严格遵守用户提供的风格、记忆与情节约束，同时确保语句自然流畅。',
      },
      {
        role: 'user',
        content: contextLines,
      },
    ],
  };
}
