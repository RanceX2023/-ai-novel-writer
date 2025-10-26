import sanitizeFilename from 'sanitize-filename';

export interface ChapterMeta {
  id: string;
  title: string;
  number: number;
  order?: number | null;
  updatedAt?: Date | null;
  fileName: string;
  wordCount: number;
}

export interface ChapterMarkdownOptions {
  title: string;
  chapterNumber: number;
  content: string;
  updatedAt?: Date | null;
  tags?: string[];
}

export interface IndexMarkdownOptions {
  projectName: string;
  synopsis?: string | null;
  language?: string | null;
  exportedAt: Date;
  chapters: ChapterMeta[];
}

const MAX_FILENAME_LENGTH = 120;

function truncateFilename(value: string, maxLength = MAX_FILENAME_LENGTH): string {
  if (value.length <= maxLength) {
    return value;
  }
  const half = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, half)}...${value.slice(value.length - half)}`;
}

export function safeFileName(input: string, fallback: string, extension?: string): string {
  const cleaned = sanitizeFilename(input, { replacement: '_' }).trim();
  const base = cleaned || fallback;
  const truncated = truncateFilename(base.replace(/\s+/g, ' ').trim());
  if (!extension) {
    return truncated || fallback;
  }
  const withoutExtLimit = MAX_FILENAME_LENGTH - extension.length - 1;
  const limited = truncateFilename(truncated, withoutExtLimit > 0 ? withoutExtLimit : MAX_FILENAME_LENGTH);
  const finalBase = limited || fallback;
  return `${finalBase}.${extension}`;
}

function formatFrontMatterValue(value: string | number | null | string[]): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
  }
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }
  return JSON.stringify(value);
}

export function buildFrontMatter(values: Record<string, string | number | null | string[]>): string {
  const lines = Object.entries(values)
    .map(([key, value]) => `${key}: ${formatFrontMatterValue(value)}`)
    .join('\n');
  return `---\n${lines}\n---\n`;
}

export function buildChapterFileName(chapterNumber: number, title: string): string {
  const prefix = chapterNumber.toString().padStart(3, '0');
  const candidate = `${prefix}-${title}`;
  return safeFileName(candidate, `chapter-${prefix}`, 'md');
}

export function normaliseNewlines(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function plainTextToHtml(content: string): string {
  const normalised = normaliseNewlines(content);
  const trimmed = normalised.trim();
  if (!trimmed) {
    return '<p></p>';
  }
  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph.trim());
      return `<p>${escaped.replace(/\n/g, '<br />')}</p>`;
    });
  return paragraphs.join('\n');
}

export function formatChapterHeading(chapterNumber: number, title: string): string {
  const cleanedTitle = title.trim() || `未命名章节 ${chapterNumber}`;
  return `第${chapterNumber}章 ${cleanedTitle}`;
}

export function createChapterMarkdown(options: ChapterMarkdownOptions): string {
  const tags = options.tags?.filter(Boolean) ?? [];
  const frontMatter = buildFrontMatter({
    title: options.title,
    chapter: options.chapterNumber,
    updatedAt: options.updatedAt ? options.updatedAt.toISOString() : null,
    tags,
  });
  const body = normaliseNewlines(options.content);
  return `${frontMatter}\n${body}`.trimEnd() + '\n';
}

export function createIndexMarkdown(options: IndexMarkdownOptions): string {
  const frontMatter = buildFrontMatter({
    title: options.projectName,
    chapterCount: options.chapters.length,
    exportedAt: options.exportedAt.toISOString(),
    language: options.language ?? null,
  });

  const synopsisSection = options.synopsis && options.synopsis.trim()
    ? `${options.synopsis.trim()}\n\n`
    : '';

  const tocLines = options.chapters
    .map((chapter) => `${chapter.number}. [${chapter.title}](chapters/${chapter.fileName})`)
    .join('\n');

  const body = `# ${options.projectName}\n\n${synopsisSection}## 目录\n\n${tocLines || '暂无章节'}\n`;

  return `${frontMatter}\n${body}`;
}

export function estimateCharacterCount(content: string): number {
  const normalised = normaliseNewlines(content).replace(/\s+/g, '');
  return normalised.length;
}
