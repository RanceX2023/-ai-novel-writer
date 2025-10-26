import { ChapterMeta, OutlineMeta, ScenePlanMeta } from '../validators/chapterMeta';
import { appConfig } from '../config/appConfig';

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
  model?: string;
  [key: string]: unknown;
}

export interface PromptMemoryFragment {
  label: string;
  content: string;
  type?: string;
  tags?: string[];
  strength?: string;
  conflict?: boolean;
  conflictNotes?: string[];
  characterIds?: string[];
  characterStateChange?: string;
  worldRuleChange?: string;
  primaryReference?: string;
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
  chapterMeta?: ChapterMeta;
  model?: string;
}

export interface ChapterMetaPromptOptions {
  projectTitle: string;
  synopsis?: string;
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
  fallbackLevel?: number;
  model?: string;
}

export interface ChatPromptPayload {
  model?: string;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  maxTokens?: number;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

const DEFAULT_LANGUAGE = '中文';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function truncate(text: string, limit: number): string {
  const normalised = text.replace(/\s+/g, ' ').trim();
  if (normalised.length <= limit) {
    return normalised;
  }
  return `${normalised.slice(0, limit - 1)}…`;
}

function indentLines(lines: string[], indent = '  '): string {
  return lines.map((line) => `${indent}${line}`).join('\n');
}

function buildToneDirective(tone: string): string {
  return `· 语气：保持「${tone}」的整体氛围，避免跳脱或自我点评。示例：“在${tone}的气息里，连呼吸都被压成细碎的耳语。”`;
}

function buildPacingDirective(pacing: string): string {
  return `· 节奏：遵循「${pacing}」节奏安排，控制段落长短与转折。示例：“先用两段铺垫，再以一句骤然收束制造力度。”`;
}

function buildPovDirective(pov: string): string {
  return `· 视角：统一采用「${pov}」视角，不随意切换。示例：“让叙述紧贴该视角的所见所感与情绪波动。”`;
}

function buildDictionDirective(diction: string): string {
  return `· 用词：偏向「${diction}」的词汇与句式，兼顾意象与节奏。示例：“选择具象感官描写，避免口语化堆砌。”`;
}

function buildAuthorsDirective(authors: string[]): string {
  return `· 参考作者：模仿${authors.join('、')}的叙述笔触，结合意象与节奏。示例：“运用短句与比喻，呈现层次鲜明的画面。”`;
}

function buildVoiceDirective(voice?: string, mood?: string, genre?: string): string[] {
  const directives: string[] = [];
  if (voice) {
    directives.push(`· 叙事声音：沿用「${voice}」，确保对白与描写保持同一气质。`);
  }
  if (mood) {
    directives.push(`· 情绪氛围：维持「${mood}」，在高潮时适度放大情感张力。`);
  }
  if (genre) {
    directives.push(`· 类型要素：突出「${genre}」的母题或套路，但避免流于刻板。`);
  }
  return directives;
}

function buildStyleDirective(style: PromptStyleProfile = {}): string {
  const lines: string[] = [];
  const language = style.language?.trim() || DEFAULT_LANGUAGE;

  if (style.tone) {
    lines.push(buildToneDirective(style.tone));
  }
  if (style.pacing) {
    lines.push(buildPacingDirective(style.pacing));
  }
  if (style.pov) {
    lines.push(buildPovDirective(style.pov));
  }
  if (style.diction) {
    lines.push(buildDictionDirective(style.diction));
  }
  if (style.authors?.length) {
    lines.push(buildAuthorsDirective(style.authors));
  }
  lines.push(...buildVoiceDirective(style.voice, style.mood, style.genre));

  if (style.instructions) {
    lines.push(`· 额外指令：${style.instructions}`);
  }
  if (style.notes) {
    lines.push(`· 写作备注：${style.notes}`);
  }

  let strengthLine = '· 风格执行：保持上述指令与故事统一，自然融入，不生硬拼贴。';
  if (typeof style.styleStrength === 'number') {
    const strength = clamp(Math.round(style.styleStrength * 100), 0, 100);
    if (style.styleStrength >= 0.8) {
      strengthLine = `· 风格执行：以${strength}%强度严格遵守，只有在剧情合理性受阻时才可微调。`;
    } else if (style.styleStrength >= 0.55) {
      strengthLine = `· 风格执行：以${strength}%强度明显呈现风格，同时保持语言自然。`;
    } else {
      strengthLine = `· 风格执行：以${strength}%强度作为氛围参照，优先保证叙事顺畅。`;
    }
  }
  lines.push(strengthLine);
  lines.push(`· 语言：全程使用${language}表达，避免夹杂英文或无意义符号。`);
  lines.push('· 禁止：禁止自我评价、总结、点评读者体验，禁止重复堆叠句式。');

  if (!lines.length) {
    return '· 默认风格：保持自然流畅的中文叙述，兼顾画面感与节奏。\n· 语言：全程使用中文表达。';
  }

  if (style.name) {
    lines.unshift(`· 风格预设：「${style.name}」`);
  }

  return lines.join('\n');
}

function splitMemoryFragments(memory: PromptMemoryFragment[] = []): {
  taboo: string[];
  continuity: string[];
  conflicts: Array<{ label: string; current: string; notes: string[]; reference?: string }>;
} {
  const taboo: string[] = [];
  const continuity: string[] = [];
  const conflicts: Array<{ label: string; current: string; notes: string[]; reference?: string }> = [];

  memory.forEach((fragment, index) => {
    const label = fragment.label || `记忆片段${index + 1}`;
    const content = fragment.content || '';
    const extras: string[] = [];
    if (fragment.characterStateChange) {
      extras.push(`人物状态：${fragment.characterStateChange}`);
    }
    if (fragment.worldRuleChange) {
      extras.push(`规则变更：${fragment.worldRuleChange}`);
    }
    const detail = extras.length ? `${content}（${extras.join('；')}）` : content;

    if (fragment.type === 'taboo') {
      taboo.push(`${label}：${detail}`);
      return;
    }

    if (fragment.conflict) {
      conflicts.push({
        label: fragment.primaryReference ? `${label}（来源：${fragment.primaryReference}）` : label,
        current: detail,
        notes: Array.isArray(fragment.conflictNotes) ? fragment.conflictNotes : [],
        reference: fragment.primaryReference,
      });
      return;
    }

    continuity.push(`${label}：${detail}`);
  });

  return { taboo, continuity, conflicts };
}

function formatBeatsFromMeta(meta?: OutlineMeta): string | undefined {
  if (!meta?.beats?.length) {
    return undefined;
  }

  const beats = [...meta.beats].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const lines = beats.map((beat, index) => {
    const label = beat.title?.trim() || `节拍${index + 1}`;
    const focus = beat.focus ? `（焦点：${beat.focus}）` : '';
    const must = beat.mustInclude?.length ? ` 必须包含：${beat.mustInclude.join('、')}。` : '';
    const avoid = beat.avoid?.length ? ` 禁止：${beat.avoid.join('、')}。` : '';
    return `${beat.order ?? index + 1}. ${label}${focus} —— ${beat.summary}${must}${avoid}`.trim();
  });
  return indentLines(lines);
}

function formatScenePlans(scenes?: ScenePlanMeta[]): string | undefined {
  if (!scenes?.length) {
    return undefined;
  }
  const ordered = [...scenes].sort((a, b) => a.order - b.order);
  const lines = ordered.map((scene) => {
    const pov = scene.pov ? `（视角：${scene.pov}）` : '';
    const ref = scene.beatRef ? ` [对应节拍 ${scene.beatRef}]` : '';
    const conflict = scene.conflict ? ` 冲突：${scene.conflict}` : '';
    return `${scene.order}. ${scene.title}${pov}${ref} —— 目标：${scene.objective}${conflict}`;
  });
  return indentLines(lines);
}

function formatAdditionalOutline(additional: PromptOutlineNode[] = []): string | undefined {
  if (!additional.length) {
    return undefined;
  }
  const lines = additional.slice(0, 5).map((outline, index) => {
    const label = outline.title || `情节节点${index + 1}`;
    const summary = outline.summary ? truncate(outline.summary, 160) : '无摘要';
    const tags = outline.tags?.length ? `（标签：${outline.tags.join('、')}）` : '';
    return `${index + 1}. ${label}${tags} —— ${summary}`;
  });
  return indentLines(lines);
}

function buildCharacterSection(characters: PromptCharacter[] = []): string {
  if (!characters.length) {
    return '  无额外人物设定，请依据既有角色保持一致。';
  }

  const safe = (value?: string) => value?.replace(/\s+/g, ' ').trim();
  const lines = characters.slice(0, 8).map((character, index) => {
    const attributes: string[] = [];
    const role = safe(character.role);
    const background = safe(character.background);
    const goals = safe(character.goals);
    const conflicts = safe(character.conflicts);
    const quirks = safe(character.quirks);
    const voice = safe(character.voice);
    const notes = safe(character.notes);

    if (role) attributes.push(`定位：${role}`);
    if (background) attributes.push(`背景：${background}`);
    if (goals) attributes.push(`目标：${goals}`);
    if (conflicts) attributes.push(`冲突：${conflicts}`);
    if (quirks) attributes.push(`特质：${quirks}`);
    if (voice) attributes.push(`语气：${voice}`);
    if (notes) attributes.push(`备注：${notes}`);

    const summary = attributes.length ? attributes.join('；') : '保持既有人设与语气一致。';
    return `${index + 1}. ${character.name} —— ${summary}`;
  });
  return indentLines(lines);
}

function buildTabooSection(taboo: string[], meta?: OutlineMeta, continuityChecklist?: string[]): string {
  const lines: string[] = [];

  if (meta?.tabooNotes?.length) {
    meta.tabooNotes.forEach((note, index) => {
      lines.push(`${index + 1}. ${note}`);
    });
  }

  if (taboo.length) {
    taboo.forEach((item) => {
      lines.push(`${lines.length + 1}. ${item}`);
    });
  }

  if (continuityChecklist?.length) {
    continuityChecklist.forEach((item) => {
      lines.push(`${lines.length + 1}. ${item}`);
    });
  }

  if (!lines.length) {
    return '  无明确禁忌，仍需确保事实延续与逻辑自洽。';
  }

  return indentLines(lines);
}

function formatTargetLength(target?: { unit: 'characters' | 'paragraphs'; value: number }): string {
  if (!target) {
    return '篇幅：保持完整场景结构，适度控制长度，禁止拖沓。';
  }
  const unitLabel = target.unit === 'paragraphs' ? '段' : '字';
  return `篇幅：约 ${target.value}${unitLabel}，允许上下浮动 10%，但须形成闭环。`;
}

function resolveMetaTargetLength(meta?: ChapterMeta['targetLength']): {
  unit: 'characters' | 'paragraphs';
  value: number;
} | undefined {
  if (!meta) {
    return undefined;
  }
  const unit = meta.unit;
  const source = meta.ideal ?? meta.max ?? meta.min;
  if (!source) {
    return undefined;
  }
  return {
    unit,
    value: clamp(source, unit === 'characters' ? 300 : 2, unit === 'characters' ? 6000 : 20),
  };
}

function resolveGenerationParameters(styleProfile?: PromptStyleProfile, continuation?: boolean): {
  temperature: number;
  topP: number;
  presencePenalty: number;
} {
  const strength = typeof styleProfile?.styleStrength === 'number'
    ? clamp(styleProfile.styleStrength, 0, 1)
    : undefined;

  let temperature = 0.68;
  let topP = 0.92;
  let presencePenalty = 0.25;

  if (strength !== undefined) {
    if (strength >= 0.8) {
      temperature = 0.48;
      topP = 0.78;
      presencePenalty = 0.12;
    } else if (strength >= 0.55) {
      temperature = 0.58;
      topP = 0.85;
      presencePenalty = 0.2;
    } else {
      temperature = 0.7;
      topP = 0.94;
      presencePenalty = 0.3;
    }
  }

  if (continuation) {
    temperature = clamp(temperature - 0.05, 0.35, 0.8);
    presencePenalty = clamp(presencePenalty - 0.05, 0.05, 0.5);
  }

  return {
    temperature: Number(temperature.toFixed(2)),
    topP: Number(topP.toFixed(2)),
    presencePenalty: Number(presencePenalty.toFixed(2)),
  };
}

function buildRoleSection({
  projectTitle,
  continuation,
  chapterMeta,
  chapterTitle,
}: {
  projectTitle: string;
  continuation?: boolean;
  chapterMeta?: ChapterMeta;
  chapterTitle?: string;
}): string {
  const lines: string[] = [];
  lines.push(`- 项目名称：《${projectTitle || '未命名项目'}》`);
  if (chapterMeta?.outline?.title) {
    lines.push(`- 本章标题：${chapterMeta.outline.title}`);
  } else if (chapterTitle) {
    lines.push(`- 本章标题：${chapterTitle}`);
  }
  if (chapterMeta?.outline?.summary) {
    lines.push(`- 章节梗概：${chapterMeta.outline.summary}`);
  }
  lines.push(`- 任务类型：${continuation ? '续写（需与已有正文无缝衔接）' : '全新章节创作'}`);
  if (continuation) {
    lines.push('- 续写要求：不得自相矛盾，不得跳回或重置时间线。');
  }
  return lines.join('\n');
}

function buildWorldSection({
  synopsis,
  previousSummary,
  outlineNode,
  additionalOutline,
  chapterMeta,
}: {
  synopsis?: string;
  previousSummary?: string;
  outlineNode?: PromptOutlineNode | null;
  additionalOutline?: PromptOutlineNode[];
  chapterMeta?: ChapterMeta;
}): string {
  const lines: string[] = [];
  if (synopsis) {
    lines.push(`- 故事梗概：${synopsis}`);
  }
  if (previousSummary) {
    lines.push(`- 上文摘要：${previousSummary}`);
  }
  if (chapterMeta?.outline?.summary && !lines.some((line) => line.startsWith('- 章节梗概'))) {
    lines.push(`- 章节梗概：${chapterMeta.outline.summary}`);
  }
  if (outlineNode?.summary && !chapterMeta?.outline?.summary) {
    lines.push(`- 当前大纲摘要：${outlineNode.summary}`);
  }

  const beats = formatBeatsFromMeta(chapterMeta?.outline);
  if (beats) {
    lines.push('- 节拍规划：');
    lines.push(beats);
  } else if (outlineNode?.beats?.length) {
    const fallbackBeats = outlineNode.beats
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((beat, index) => `${beat.order ?? index + 1}. ${beat.title || `节拍${index + 1}`} —— ${beat.summary ?? '暂无摘要'}`);
    lines.push('- 节拍规划：');
    lines.push(indentLines(fallbackBeats));
  }

  const scenes = formatScenePlans(chapterMeta?.scenes);
  if (scenes) {
    lines.push('- 场景节奏规划：');
    lines.push(scenes);
  }

  const related = formatAdditionalOutline(additionalOutline ?? []);
  if (related) {
    lines.push('- 相关情节点参考：');
    lines.push(related);
  }

  if (chapterMeta?.outline?.thematicHooks?.length) {
    const hooks = chapterMeta.outline.thematicHooks.map((hook, index) => `${index + 1}. ${hook}`);
    lines.push('- 主题线索或象征：');
    lines.push(indentLines(hooks));
  }

  if (!lines.length) {
    return '- 暂无额外世界观信息，请依据角色与记忆碎片合理构建。';
  }

  return lines.join('\n');
}

function buildContinuitySection(continuity: string[]): string {
  if (!continuity.length) {
    return '  记忆库暂无额外事实，请保持与既有剧情一致。';
  }
  const lines = continuity.map((item, index) => `${index + 1}. ${item}`);
  return indentLines(lines);
}

function buildOutputSection({
  targetLength,
  chapterMeta,
  instructions,
  continuation,
}: {
  targetLength?: { unit: 'characters' | 'paragraphs'; value: number };
  chapterMeta?: ChapterMeta;
  instructions?: string;
  continuation?: boolean;
}): string {
  const lines: string[] = [];

  lines.push('· 输出格式：使用 Markdown，至少包含二级标题和自然段划分，合理安排场景切换。');
  lines.push('· 叙事要求：镜头感明确，细节服务情节推进，禁止流水账与无意义重复。');
  if (continuation) {
    lines.push('· 连续性：无缝承接上文事件，不得复述已发生的结尾，也不得重置冲突。');
  }
  lines.push(`· ${formatTargetLength(targetLength)}`);

  if (chapterMeta?.closingStrategy) {
    lines.push(`· 收尾策略：${chapterMeta.closingStrategy}`);
  } else {
    lines.push('· 收尾策略：在主要冲突阶段落后提供阶段性结果，并留下推动下一章的余韵。');
  }
  lines.push('· 截断处理：若输出被截断，最后一句必须交代当前冲突的阶段性结果并留一丝悬念。');
  lines.push('· 禁止语气：不得出现“总结”“点评”“本文”之类的评论性语句。');

  if (instructions) {
    lines.push(`· 用户追加指令：${instructions}`);
  }

  return lines.join('\n');
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
    chapterMeta,
  } = options;

  const { taboo, continuity, conflicts } = splitMemoryFragments(memoryFragments);
  const metaTargetLength = resolveMetaTargetLength(chapterMeta?.targetLength);
  const resolvedTargetLength = metaTargetLength ?? targetLength;
  const parameters = resolveGenerationParameters(styleProfile, continuation);
  const styleSection = buildStyleDirective(styleProfile);

  const sections: string[] = [];
  sections.push(`【角色定位】\n${buildRoleSection({ projectTitle, continuation, chapterMeta, chapterTitle })}`);
  sections.push(`【世界观与大纲】\n${buildWorldSection({ synopsis, previousSummary, outlineNode, additionalOutline, chapterMeta })}`);
  sections.push(`【人物卡】\n${buildCharacterSection(characters)}`);
  sections.push(`【记忆与事实】\n${buildContinuitySection(continuity)}`);

  if (conflicts.length) {
    const conflictLines = conflicts.map((conflict, index) => {
      const notes = conflict.notes && conflict.notes.length
        ? conflict.notes.join('；')
        : '暂无其他版本，请保持模糊或稍后澄清。';
      return `${index + 1}. ${conflict.label} —— 最新：${conflict.current}；其他版本：${notes}`;
    });
    sections.push(
      `【记忆冲突】\n遵循以下事实，以最近章节为准；若仍无法确认请保持模糊或推迟明确表述。\n${indentLines(conflictLines)}`
    );
  }

  sections.push(`【禁忌表】\n${buildTabooSection(taboo, chapterMeta?.outline, chapterMeta?.continuityChecklist)}`);
  sections.push(`【风格控制】\n${styleSection}`);
  sections.push(
    `【输出要求】\n${buildOutputSection({ targetLength: resolvedTargetLength, chapterMeta, instructions, continuation })}`
  );

  const systemMessage = [
    '你是中文长篇小说的首席主笔，负责把结构化规划转化为沉浸式正文。',
    '必须严格执行给定的节拍、角色与禁忌，不得偏离或自行总结点评。',
    '语言需凝练且具画面感，每个场景都要推动剧情或角色发展。',
    '若遇到模糊信息，可用细节补充但不得自创矛盾设定。',
    '面对记忆冲突时，请以“记忆冲突”列表中最近章节的事实为准；若仍不确定请保持模糊或等待后续澄清。',
  ].join('\n');

  const userMessage = sections.join('\n\n');
  const resolvedModel = options.model?.trim()
    || process.env.OPENAI_CHAPTER_MODEL?.trim()
    || appConfig.openai.defaultModel;

  return {
    model: resolvedModel,
    temperature: parameters.temperature,
    topP: parameters.topP,
    presencePenalty: parameters.presencePenalty,
    messages: [
      {
        role: 'system',
        content: systemMessage,
      },
      {
        role: 'user',
        content: userMessage,
      },
    ],
  };
}

function buildMetaPromptSections(options: ChapterMetaPromptOptions): string {
  const {
    projectTitle,
    synopsis,
    outlineNode,
    additionalOutline = [],
    memoryFragments = [],
    characters = [],
    continuation,
    previousSummary,
    targetLength,
    fallbackLevel = 0,
    instructions,
  } = options;

  const { taboo, continuity, conflicts } = splitMemoryFragments(memoryFragments);

  const constraints: string[] = [
    '1. 仅输出符合 JSON Schema 的对象，禁止添加任何解释文字。',
    '2. 所有文本使用中文，避免出现英文标签或 JSON 评论。',
    '3. beats 需按照故事推进顺序编排，summary ≤ 120 字。',
    '4. scenes 数量保持 2-6 个，对应主要节拍，并指出目标。',
    '5. continuityChecklist 用于提醒潜在矛盾，若无则可省略该字段。',
  ];

  if (fallbackLevel >= 1) {
    constraints.push('6. 回退模式：节拍不超过 5 个，场景不超过 4 个，尽量保持描述简洁。');
  }
  if (fallbackLevel >= 2) {
    constraints.push('7. 深度回退：节拍固定为 3 个，场景 3 个，避免填写可选字段。');
  }

  const sections: string[] = [];
  sections.push(`【项目背景】\n- 项目：《${projectTitle || '未命名项目'}》\n- 故事梗概：${synopsis || '无'}\n- 章节类型：${continuation ? '续写任务' : '新章创作'}`);

  if (previousSummary) {
    sections.push(`【上一章摘要】\n${previousSummary}`);
  }

  if (outlineNode) {
    const beats = outlineNode.beats?.length
      ? indentLines(
        outlineNode.beats
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((beat, index) => `${beat.order ?? index + 1}. ${beat.title || `节拍${index + 1}`} —— ${beat.summary ?? '无摘要'}`)
      )
      : undefined;

    const outlineLines = [`- 当前大纲节点：${outlineNode.title || '未命名节点'}`];
    if (outlineNode.summary) {
      outlineLines.push(`- 摘要：${outlineNode.summary}`);
    }
    if (beats) {
      outlineLines.push('- 子节拍参考：');
      outlineLines.push(beats);
    }
    sections.push(`【当前大纲】\n${outlineLines.join('\n')}`);
  }

  const related = formatAdditionalOutline(additionalOutline);
  if (related) {
    sections.push(`【相关情节点】\n${related}`);
  }

  if (characters.length) {
    sections.push(`【重点人物】\n${buildCharacterSection(characters)}`);
  }

  if (continuity.length) {
    sections.push(`【已知事实】\n${buildContinuitySection(continuity)}`);
  }

  if (conflicts.length) {
    const conflictLines = conflicts.map((conflict, index) => {
      const notes = conflict.notes.length ? conflict.notes.join('；') : '暂无其他版本，规划时需保持模糊。';
      return `${index + 1}. ${conflict.label} —— 最新：${conflict.current}；其他版本：${notes}`;
    });
    sections.push(`【潜在冲突】\n请记录以下可能矛盾的设定，以最近描述为准，未确认前保持模糊。\n${indentLines(conflictLines)}`);
  }

  if (taboo.length) {
    sections.push(`【禁忌】\n${buildTabooSection(taboo, undefined, undefined)}`);
  }

  if (targetLength) {
    sections.push(`【篇幅目标】\n- 目标长度：${targetLength.value}${targetLength.unit === 'paragraphs' ? '段' : '字'}`);
  }

  if (instructions) {
    sections.push(`【用户追加指令】\n- ${instructions}`);
  }

  const constraintSection = `【输出约束】\n${constraints.map((item) => `- ${item}`).join('\n')}`;
  sections.push(constraintSection);

  return sections.join('\n\n');
}

export function buildChapterMetaPrompt(options: ChapterMetaPromptOptions): ChatPromptPayload {
  const systemMessage = [
    '你是中文长篇小说的结构统筹，需要根据提供的资料生成严格遵守 JSON Schema 的章节元数据。',
    '输出必须是合法 JSON，字段不能缺失或多余，所有文本需为中文。',
  ].join('\n');

  const userMessage = buildMetaPromptSections(options);
  const resolvedModel = options.model?.trim()
    || process.env.OPENAI_PLANNING_MODEL?.trim()
    || appConfig.openai.defaultModel;

  return {
    model: resolvedModel,
    temperature: 0.25,
    topP: 0.65,
    presencePenalty: 0.1,
    messages: [
      {
        role: 'system',
        content: systemMessage,
      },
      {
        role: 'user',
        content: userMessage,
      },
    ],
  };
}
