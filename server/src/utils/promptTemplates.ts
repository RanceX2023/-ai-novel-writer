export interface PromptStyleProfile {
  name?: string;
  tone?: string;
  pacing?: string;
  pov?: string;
  diction?: string;
  authors?: string[];
  language?: string;
  instructions?: string;
  notes?: string;
  styleStrength?: number;
  voice?: string;
  mood?: string;
  genre?: string;
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

export interface PromptCharacter {
  id?: string;
  name: string;
  role?: string;
  background?: string;
  goals?: string;
  conflicts?: string;
  quirks?: string;
  voice?: string;
  notes?: string;
}

export interface PromptOutlineBeat {
  id?: string;
  title?: string;
  summary?: string;
  order?: number;
  focus?: string;
  outcome?: string;
}

export interface PromptOutlineNode {
  id?: string;
  key?: string;
  title?: string;
  summary?: string;
  order?: number;
  status?: string;
  tags?: string[];
  beats?: PromptOutlineBeat[];
  [key: string]: unknown;
}

export interface ChapterPromptOptions {
  projectTitle: string;
  synopsis?: string;
  chapterTitle?: string;
  outlineNode?: PromptOutlineNode | null;
  additionalOutline?: PromptOutlineNode[];
  memoryFragments?: PromptMemoryFragment[];
  characters?: PromptCharacter[];
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
  const languageHint = style.language
    ? `输出语言必须为${style.language}，除非特别说明。`
    : '输出语言默认为中文。';

  const styleName = style.name ? `风格配置：「${style.name}」。` : '';

  const attributeParts: string[] = [];
  if (style.tone) attributeParts.push(`语气基调：${style.tone}`);
  if (style.pacing) attributeParts.push(`节奏控制：${style.pacing}`);
  if (style.pov) attributeParts.push(`叙事视角：${style.pov}`);
  if (style.diction) attributeParts.push(`用词风格：${style.diction}`);
  if (style.authors?.length) attributeParts.push(`参考作者：${style.authors.join('、')}`);
  if (style.voice) attributeParts.push(`叙事声音：${style.voice}`);
  if (style.mood) attributeParts.push(`情绪氛围：${style.mood}`);
  if (style.genre) attributeParts.push(`类型标签：${style.genre}`);

  const attributeLine = attributeParts.length ? `风格参数：${attributeParts.join('；')}。` : '';

  const noteParts: string[] = [];
  if (style.notes) noteParts.push(`写作备注：${style.notes}`);
  if (style.instructions) noteParts.push(`额外指令：${style.instructions}`);
  const notesLine = noteParts.length ? `${noteParts.join('；')}。` : '';

  let strengthLine = '';
  if (typeof style.styleStrength === 'number') {
    const percent = Math.round(style.styleStrength * 100);
    if (style.styleStrength >= 0.75) {
      strengthLine = `请严格遵守上述风格指引（执行强度 ${percent}%）。`;
    } else if (style.styleStrength >= 0.5) {
      strengthLine = `请明显体现上述风格，同时允许适度灵活调整（执行强度 ${percent}%）。`;
    } else {
      strengthLine = `上述风格参数仅作背景参考，保持自然流畅（执行强度 ${percent}%）。`;
    }
  }

  const segments = [languageHint, styleName, attributeLine, notesLine, strengthLine]
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(' ');

  return segments || languageHint;
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

function buildCharacterSection(characters: PromptCharacter[] = []): string {
  if (!characters.length) {
    return '未指定重点人物，请根据既有设定保持角色一致。';
  }

  const safeString = (value?: string) => value?.replace(/\s+/g, ' ').trim();

  return characters
    .slice(0, 8)
    .map((character, index) => {
      const summaryParts: string[] = [];
      const role = safeString(character.role);
      const background = safeString(character.background);
      const goals = safeString(character.goals);
      const conflicts = safeString(character.conflicts);
      const quirks = safeString(character.quirks);
      const voice = safeString(character.voice);
      const notes = safeString(character.notes);

      if (role) summaryParts.push(`定位：${role}`);
      if (background) summaryParts.push(`背景：${background}`);
      if (goals) summaryParts.push(`目标：${goals}`);
      if (conflicts) summaryParts.push(`冲突：${conflicts}`);
      if (quirks) summaryParts.push(`特质：${quirks}`);
      if (voice) summaryParts.push(`语气：${voice}`);
      if (notes) summaryParts.push(`备注：${notes}`);

      const summary = summaryParts.join('；') || '（保持原有人设）';
      return `${index + 1}. ${character.name} —— ${summary}`;
    })
    .join('\n');
}

function describeBeats(beats?: PromptOutlineBeat[], limit = 4): string | null {
  if (!beats || beats.length === 0) {
    return null;
  }
  const sorted = [...beats].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return sorted.slice(0, limit).map((beat, index) => {
    const label = beat.title && beat.title.trim() ? beat.title.trim() : `节拍${index + 1}`;
    const focus = beat.focus ? `（焦点：${beat.focus}）` : '';
    const outcome = beat.outcome ? `；结果：${beat.outcome}` : '';
    return `${index + 1}. ${label}${focus}：${beat.summary ?? ''}${outcome}`;
  }).join('\n');
}

function summariseBeatsInline(beats?: PromptOutlineBeat[], limit = 2): string {
  if (!beats || beats.length === 0) {
    return '';
  }
  const sorted = [...beats].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return sorted.slice(0, limit).map((beat, index) => {
    const label = beat.title && beat.title.trim() ? beat.title.trim() : `节拍${index + 1}`;
    return `${label}:${beat.summary ?? ''}`;
  }).join(' / ');
}

function buildOutlineSection(node?: PromptOutlineNode | null, additional: PromptOutlineNode[] = []): string {
  if (!node && additional.length === 0) {
    return '未提供任何章节大纲，请根据项目设定合理发挥。';
  }

  const segments: string[] = [];
  if (node) {
    const header = node.title ? `${node.title}` : '当前大纲节点';
    segments.push(`当前章节节点：${header}${node.summary ? ` —— ${node.summary}` : ''}`);
    const beatDetails = describeBeats(node.beats, 5);
    if (beatDetails) {
      segments.push(`节拍拆解：\n${beatDetails}`);
    }
    if (node.tags?.length) {
      segments.push(`标签：${node.tags.join('、')}`);
    }
    if (node.status) {
      segments.push(`状态：${node.status}`);
    }
  }

  if (additional.length) {
    segments.push(
      '相关情节概览：\n'
        + additional
          .map((outline, index) => {
            const label = outline.title || `情节节点${index + 1}`;
            const beatsInline = summariseBeatsInline(outline.beats, 2);
            const beatText = beatsInline ? `（节拍：${beatsInline}）` : '';
            return `${index + 1}. ${label} —— ${outline.summary ?? '无摘要'}${beatText}`;
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
    characters = [],
    styleProfile,
    continuation,
    previousSummary,
    instructions,
    targetLength,
  } = options;

  const outlineSection = buildOutlineSection(outlineNode, additionalOutline);
  const memorySection = buildMemorySection(memoryFragments);
  const characterSection = buildCharacterSection(characters);
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
    '重点角色设定：',
    characterSection,
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
