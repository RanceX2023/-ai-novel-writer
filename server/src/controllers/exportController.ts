import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import ExportService from '../services/exportService';
import ApiError from '../utils/ApiError';

function getExportService(req: Request): ExportService {
  const service = req.app.get('exportService') as ExportService | undefined;
  if (!service) {
    throw new ApiError(500, '导出服务不可用，请稍后重试。', undefined, 'EXPORT_SERVICE_UNAVAILABLE');
  }
  return service;
}

function ensureObjectId(value: string | undefined, label: string): Types.ObjectId {
  if (!value || !Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `${label} 必须是有效的 Mongo ObjectId。`, { value }, 'INVALID_OBJECT_ID');
  }
  return new Types.ObjectId(value);
}

function parseFormat(raw: unknown): 'md' | 'epub' {
  if (!raw) {
    return 'md';
  }
  const value = Array.isArray(raw) ? raw[0] : raw;
  const normalised = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalised === 'epub') {
    return 'epub';
  }
  if (normalised === 'md' || normalised === 'markdown') {
    return 'md';
  }
  throw new ApiError(400, '导出格式不支持，请选择 Markdown 或 EPUB。', { value }, 'EXPORT_FORMAT_INVALID');
}

function parseChapterIds(raw: unknown): Types.ObjectId[] | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const values: string[] = [];
  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (typeof item === 'string') {
        values.push(...item.split(',').map((part) => part.trim()).filter(Boolean));
      }
    });
  } else if (typeof raw === 'string') {
    values.push(...raw.split(',').map((part) => part.trim()).filter(Boolean));
  }

  if (!values.length) {
    throw new ApiError(400, '请选择至少一个章节后再导出。', undefined, 'EXPORT_CHAPTER_EMPTY');
  }

  const invalid = values.filter((value) => !Types.ObjectId.isValid(value));
  if (invalid.length) {
    throw new ApiError(400, '存在无效的章节 ID，请刷新页面后重试。', { invalid }, 'EXPORT_CHAPTER_INVALID');
  }

  return values.map((value) => new Types.ObjectId(value));
}

function buildContentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\w\-\.]+/g, '_');
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function setDownloadHeaders(res: Response, fileName: string, contentType: string): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', buildContentDisposition(fileName));
  res.setHeader('Cache-Control', 'no-store');
}

export const exportProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const exportService = getExportService(req);
    const projectId = ensureObjectId(req.params.projectId, 'projectId');
    const format = parseFormat(req.query.format);

    const chapterIds = req.query.range === 'all' || req.query.chapters === undefined ? undefined : parseChapterIds(req.query.chapters);

    if (req.setTimeout) {
      req.setTimeout(600_000);
    }
    if (res.setTimeout) {
      res.setTimeout(600_000);
    }

    const prepared = await exportService.prepareData(projectId, chapterIds);

    res.setHeader('X-Export-Format', format);
    res.setHeader('X-Export-Chapter-Count', String(prepared.chapters.length));
    res.setHeader('X-Export-Range', prepared.range);

    if (format === 'md') {
      const { archive, fileName } = exportService.createMarkdownArchive(prepared);
      setDownloadHeaders(res, fileName, 'application/zip');

      archive.on('error', (error) => {
        if (!res.headersSent) {
          next(error);
        } else {
          res.destroy(error as Error);
        }
      });

      req.on('aborted', () => {
        if (!res.writableEnded) {
          archive.abort();
        }
      });

      archive.pipe(res);
      await archive.finalize();
      return;
    }

    const { stream, fileName, promise } = exportService.createEpubStream(prepared);
    setDownloadHeaders(res, fileName, 'application/epub+zip');

    stream.on('error', (error) => {
      if (!res.headersSent) {
        next(error);
      } else {
        res.destroy(error as Error);
      }
    });

    req.on('aborted', () => {
      stream.destroy();
    });

    stream.pipe(res);
    await promise;
  } catch (error) {
    next(error);
  }
};
