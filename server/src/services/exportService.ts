import { Types } from 'mongoose';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import Epub from 'epub-gen';
import ProjectModel from '../models/Project';
import ChapterModel from '../models/Chapter';
import ApiError from '../utils/ApiError';
import {
  buildChapterFileName,
  ChapterMeta,
  createChapterMarkdown,
  createIndexMarkdown,
  estimateCharacterCount,
  formatChapterHeading,
  plainTextToHtml,
  safeFileName,
  escapeHtml,
} from '../utils/exportUtils';

interface PreparedProject {
  id: string;
  name: string;
  synopsis?: string | null;
  authors: string[];
  language?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface PreparedChapter extends ChapterMeta {
  content: string;
}

interface PreparedData {
  project: PreparedProject;
  chapters: PreparedChapter[];
  exportedAt: Date;
  range: 'all' | 'partial';
  exportStamp: string;
}

export interface MarkdownArchiveResult {
  archive: archiver.Archiver;
  fileName: string;
  metadata: Record<string, unknown>;
}

export interface EpubStreamResult {
  stream: PassThrough;
  fileName: string;
  promise: Promise<void>;
}

function resolveLanguageCode(language?: string | null): string {
  if (!language) {
    return 'zh-CN';
  }
  if (/en/i.test(language)) {
    return 'en';
  }
  if (/zh|中/i.test(language)) {
    return 'zh-CN';
  }
  return language;
}

function sortChapters(
  chapters: Array<{
    _id: Types.ObjectId;
    title?: string | null;
    content?: string | null;
    order?: number | null;
    updatedAt?: Date | null;
    createdAt?: Date | null;
  }>
): Array<{
  _id: Types.ObjectId;
  title?: string | null;
  content?: string | null;
  order?: number | null;
  updatedAt?: Date | null;
  createdAt?: Date | null;
}> {
  return [...chapters].sort((a, b) => {
    const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
    const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    const timeA = a.createdAt ? a.createdAt.getTime() : 0;
    const timeB = b.createdAt ? b.createdAt.getTime() : 0;
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    return a._id.toString().localeCompare(b._id.toString());
  });
}

function ensureUniqueObjectIds(chapterIds?: Types.ObjectId[]): Types.ObjectId[] | undefined {
  if (!chapterIds || !chapterIds.length) {
    return undefined;
  }
  const seen = new Set<string>();
  const unique: Types.ObjectId[] = [];
  chapterIds.forEach((id) => {
    const key = id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(id);
    }
  });
  return unique;
}

export default class ExportService {
  async prepareData(projectId: Types.ObjectId, chapterIds?: Types.ObjectId[]): Promise<PreparedData> {
    const project = await ProjectModel.findById(projectId).lean();
    if (!project) {
      throw new ApiError(404, '项目不存在或已删除。', { projectId }, 'PROJECT_NOT_FOUND');
    }

    const uniqueChapterIds = ensureUniqueObjectIds(chapterIds);

    const chapterQuery: Record<string, unknown> = { project: projectId };
    if (uniqueChapterIds) {
      chapterQuery._id = { $in: uniqueChapterIds };
    }

    const chapterDocs = await ChapterModel.find(chapterQuery)
      .select({ title: 1, content: 1, order: 1, updatedAt: 1, createdAt: 1 })
      .lean();

    if (uniqueChapterIds && chapterDocs.length !== uniqueChapterIds.length) {
      const foundIds = new Set(chapterDocs.map((chapter) => chapter._id.toString()));
      const missing = uniqueChapterIds
        .map((id) => id.toString())
        .filter((id) => !foundIds.has(id));
      throw new ApiError(404, '未找到指定章节，请刷新后重试。', { missing }, 'CHAPTER_NOT_FOUND');
    }

    const orderedChapters = sortChapters(chapterDocs);
    const exportedAt = new Date();
    const stamp = exportedAt.toISOString().replace(/[:]/g, '-').replace(/\..+?Z$/, 'Z');

    const preparedChapters: PreparedChapter[] = orderedChapters.map((chapter, index) => {
      const number = index + 1;
      const title = chapter.title?.trim() || `未命名章节 ${number}`;
      const fileName = buildChapterFileName(number, title);
      const content = chapter.content ?? '';
      const wordCount = estimateCharacterCount(content);
      return {
        id: chapter._id.toString(),
        title,
        number,
        order: typeof chapter.order === 'number' ? chapter.order : null,
        updatedAt: chapter.updatedAt ?? null,
        fileName,
        wordCount,
        content,
      };
    });

    const styleAuthors = project.styleProfile?.authors;
    const preparedProject: PreparedProject = {
      id: project._id.toString(),
      name: project.name?.trim() || '未命名项目',
      synopsis: project.synopsis ?? null,
      authors: Array.isArray(styleAuthors)
        ? styleAuthors.filter((author): author is string => typeof author === 'string' && author.trim()).map((author) => author.trim())
        : [],
      language: project.styleProfile?.language ?? '中文',
      createdAt: project.createdAt ?? null,
      updatedAt: project.updatedAt ?? null,
    };

    return {
      project: preparedProject,
      chapters: preparedChapters,
      exportedAt,
      range: uniqueChapterIds ? 'partial' : 'all',
      exportStamp: stamp,
    };
  }

  createMarkdownArchive(data: PreparedData): MarkdownArchiveResult {
    const archive = archiver('zip', { zlib: { level: 9 } });

    const indexMarkdown = createIndexMarkdown({
      projectName: data.project.name,
      synopsis: data.project.synopsis,
      language: data.project.language,
      exportedAt: data.exportedAt,
      chapters: data.chapters,
    });

    archive.append(indexMarkdown, { name: 'index.md' });

    const metadata = {
      format: 'markdown',
      exportedAt: data.exportedAt.toISOString(),
      range: data.range,
      project: {
        id: data.project.id,
        name: data.project.name,
        synopsis: data.project.synopsis,
        language: data.project.language,
        authors: data.project.authors,
        createdAt: data.project.createdAt ? data.project.createdAt.toISOString() : null,
        updatedAt: data.project.updatedAt ? data.project.updatedAt.toISOString() : null,
      },
      chapters: data.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        number: chapter.number,
        order: chapter.order,
        file: `chapters/${chapter.fileName}`,
        updatedAt: chapter.updatedAt ? chapter.updatedAt.toISOString() : null,
        wordCount: chapter.wordCount,
      })),
    };

    archive.append(`${JSON.stringify(metadata, null, 2)}\n`, { name: 'meta.json' });

    if (!data.chapters.length) {
      archive.append('', { name: 'chapters/.keep' });
    } else {
      data.chapters.forEach((chapter) => {
        const markdown = createChapterMarkdown({
          title: chapter.title,
          chapterNumber: chapter.number,
          content: chapter.content,
          updatedAt: chapter.updatedAt ?? null,
          tags: [],
        });
        archive.append(markdown, { name: `chapters/${chapter.fileName}` });
      });
    }

    const fileName = safeFileName(
      `${data.project.name}-${data.exportStamp}`,
      `project-${data.project.id}-${data.exportStamp}`,
      'zip'
    );

    return { archive, fileName, metadata };
  }

  createEpubStream(data: PreparedData): EpubStreamResult {
    const stream = new PassThrough();

    const summaryHtml = `
      <section class="project-overview">
        <h1>${escapeHtml(data.project.name)}</h1>
        <p>导出时间：${escapeHtml(data.exportedAt.toISOString())}</p>
        <p>章节数量：${data.chapters.length}</p>
        ${data.project.synopsis ? `<div class="synopsis"><h2>项目简介</h2><p>${escapeHtml(data.project.synopsis)}</p></div>` : ''}
      </section>
    `.trim();

    const content = [
      {
        title: '项目总览',
        data: summaryHtml,
        beforeToc: true,
        excludeFromToc: true,
        filename: 'overview.xhtml',
      },
      ...data.chapters.map((chapter) => {
        const heading = formatChapterHeading(chapter.number, chapter.title);
        const bodyHtml = plainTextToHtml(chapter.content);
        const updatedAtInfo = chapter.updatedAt
          ? `<p class="meta">最后更新：${escapeHtml(chapter.updatedAt.toISOString())}</p>`
          : '';
        const chapterHtml = `<h2>${escapeHtml(heading)}</h2>${updatedAtInfo}${bodyHtml}`;
        return {
          title: heading,
          data: chapterHtml,
          filename: safeFileName(`chapter-${chapter.number}-${chapter.title}`, `chapter-${chapter.number}`, 'xhtml'),
        };
      }),
    ];

    const languageCode = resolveLanguageCode(data.project.language);
    const options = {
      title: data.project.name,
      author: data.project.authors.length ? data.project.authors : '佚名',
      publisher: 'AI 小说写作助手',
      description: data.project.synopsis ?? undefined,
      lang: languageCode,
      tocTitle: '目录',
      appendChapterTitles: false,
      css: `body { font-family: "Noto Serif SC", "Source Han Serif", "Songti SC", serif; line-height: 1.8; }
            h1, h2 { font-family: inherit; }
            .meta { color: #666; font-size: 0.85em; margin-bottom: 0.8em; }
            .synopsis { margin-top: 1.2em; line-height: 1.7; }
            .project-overview { text-align: left; }`,
      content,
    };

    const epub = new Epub(options, stream);
    const promise = epub.promise.catch((error) => {
      stream.emit('error', error);
      throw error;
    });

    const fileName = safeFileName(
      `${data.project.name}-${data.exportStamp}`,
      `project-${data.project.id}-${data.exportStamp}`,
      'epub'
    );

    return { stream, fileName, promise };
  }
}
