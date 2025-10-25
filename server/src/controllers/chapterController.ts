import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import GenerationService from '../services/generationService';
import ChapterModel, { Chapter, ChapterDocument, ChapterVersion } from '../models/Chapter';
import ApiError from '../utils/ApiError';
import {
  ChapterContinuationInput,
  ChapterGenerationInput,
  ChapterRevertInput,
  ChapterUpdateInput,
} from '../validators/chapter';

const SNIPPET_LENGTH = 160;

type ChapterPlain = Chapter & {
  _id: Types.ObjectId;
  project: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

function getGenerationService(req: Request): GenerationService {
  const service = req.app.get('generationService') as GenerationService | undefined;
  if (!service) {
    throw new ApiError(500, 'Generation service not available');
  }
  return service;
}

function assertObjectId(id: string, label: string): void {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, `${label} must be a valid Mongo ObjectId`);
  }
}

function buildSnippet(content?: string | null, limit = SNIPPET_LENGTH): string {
  if (!content) {
    return '';
  }
  const withoutTags = content.replace(/<[^>]*>/g, ' ');
  const normalised = withoutTags.replace(/\s+/g, ' ').trim();
  if (normalised.length <= limit) {
    return normalised;
  }
  return `${normalised.slice(0, limit - 1)}…`;
}

function latestVersionFromPlain(versions?: ChapterVersion[]): ChapterVersion | undefined {
  if (!Array.isArray(versions) || versions.length === 0) {
    return undefined;
  }
  return versions[versions.length - 1];
}

function toPlainChapter(chapter: ChapterDocument | ChapterPlain): ChapterPlain {
  return 'toObject' in chapter ? (chapter as ChapterDocument).toObject() : (chapter as ChapterPlain);
}

function serializeChapterSummary(chapter: ChapterPlain) {
  const latestVersion = latestVersionFromPlain(chapter.versions);
  return {
    id: chapter._id.toString(),
    projectId: chapter.project.toString(),
    title: chapter.title,
    synopsis: chapter.synopsis ?? null,
    order: chapter.order ?? null,
    preview: buildSnippet(chapter.content),
    version: latestVersion?.version ?? 0,
    createdAt: chapter.createdAt ?? null,
    updatedAt: chapter.updatedAt ?? null,
  };
}

function serializeChapterDetail(chapter: ChapterPlain) {
  const latestVersion = latestVersionFromPlain(chapter.versions);
  return {
    id: chapter._id.toString(),
    projectId: chapter.project.toString(),
    title: chapter.title,
    synopsis: chapter.synopsis ?? null,
    order: chapter.order ?? null,
    content: chapter.content ?? '',
    version: latestVersion?.version ?? 0,
    createdAt: chapter.createdAt ?? null,
    updatedAt: chapter.updatedAt ?? null,
  };
}

function serializeVersionSummary(version: ChapterVersion) {
  return {
    version: version.version,
    createdAt: version.createdAt ?? null,
    metadata: version.metadata ?? null,
    preview: buildSnippet(version.content),
  };
}

function serializeVersionDetail(version: ChapterVersion) {
  return {
    version: version.version,
    createdAt: version.createdAt ?? null,
    metadata: version.metadata ?? null,
    content: version.content,
  };
}

function parseVersionParam(value: string): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    throw new ApiError(400, 'version parameter must be a positive integer');
  }
  return numeric;
}

export const listChapters = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      throw new ApiError(400, 'projectId parameter is required');
    }
    assertObjectId(projectId, 'projectId');

    const chapters = await ChapterModel.find({ project: projectId })
      .sort({ order: 1, createdAt: 1 })
      .lean<ChapterPlain>();

    res.json({ chapters: chapters.map((chapter) => serializeChapterSummary(chapter)) });
  } catch (error) {
    next(error);
  }
};

export const getChapter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId, chapterId } = req.params;
    if (!projectId || !chapterId) {
      throw new ApiError(400, 'projectId and chapterId parameters are required');
    }
    assertObjectId(projectId, 'projectId');
    assertObjectId(chapterId, 'chapterId');

    const chapter = await ChapterModel.findOne({ _id: chapterId, project: projectId }).lean<ChapterPlain>();
    if (!chapter) {
      throw new ApiError(404, 'Chapter not found for project');
    }

    res.json({ chapter: serializeChapterDetail(chapter) });
  } catch (error) {
    next(error);
  }
};

export const updateChapter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId, chapterId } = req.params;
    if (!projectId || !chapterId) {
      throw new ApiError(400, 'projectId and chapterId parameters are required');
    }
    assertObjectId(projectId, 'projectId');
    assertObjectId(chapterId, 'chapterId');

    const payload = req.body as ChapterUpdateInput;

    const chapter = await ChapterModel.findOne({ _id: chapterId, project: projectId });
    if (!chapter) {
      throw new ApiError(404, 'Chapter not found for project');
    }

    const latestVersionDoc = chapter.versions.length > 0 ? chapter.versions[chapter.versions.length - 1] : undefined;
    const latestVersionNumber = latestVersionDoc?.version ?? 0;
    if (payload.baseVersion !== undefined && payload.baseVersion !== latestVersionNumber) {
      throw new ApiError(409, 'Chapter has been updated by another session');
    }

    let hasChanges = false;
    let versionAdded = false;

    if (payload.title !== undefined && payload.title !== chapter.title) {
      chapter.title = payload.title;
      hasChanges = true;
    }

    if (payload.content !== undefined && payload.content !== chapter.content) {
      const metadata: Record<string, unknown> = {
        ...(payload.metadata ?? {}),
        source: payload.autosave ? 'autosave' : 'manual',
        baseVersion: payload.baseVersion ?? latestVersionNumber,
      };
      if (payload.autosave !== undefined) {
        metadata.autosave = payload.autosave;
      }

      chapter.content = payload.content;
      chapter.versions.push({
        version: latestVersionNumber + 1,
        content: payload.content,
        metadata,
      });
      hasChanges = true;
      versionAdded = true;
    }

    if (!hasChanges) {
      const plainChapter = toPlainChapter(chapter);
      res.json({
        chapter: serializeChapterDetail(plainChapter),
        savedVersion: null,
      });
      return;
    }

    await chapter.save();

    const plainChapter = toPlainChapter(chapter);
    const latestVersion = latestVersionFromPlain(plainChapter.versions || []);

    res.json({
      chapter: serializeChapterDetail(plainChapter),
      savedVersion: versionAdded && latestVersion ? serializeVersionSummary(latestVersion) : null,
    });
  } catch (error) {
    next(error);
  }
};

export const getChapterVersions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { projectId, chapterId } = req.params;
    if (!projectId || !chapterId) {
      throw new ApiError(400, 'projectId and chapterId parameters are required');
    }
    assertObjectId(projectId, 'projectId');
    assertObjectId(chapterId, 'chapterId');

    const chapter = await ChapterModel.findOne({ _id: chapterId, project: projectId }).lean<ChapterPlain>();
    if (!chapter) {
      throw new ApiError(404, 'Chapter not found for project');
    }

    const versions = [...(chapter.versions ?? [])]
      .sort((a, b) => b.version - a.version)
      .map((version) => serializeVersionSummary(version));

    res.json({
      versions,
      currentVersion: latestVersionFromPlain(chapter.versions)?.version ?? 0,
    });
  } catch (error) {
    next(error);
  }
};

export const getChapterVersion = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { projectId, chapterId, version } = req.params;
    if (!projectId || !chapterId) {
      throw new ApiError(400, 'projectId and chapterId parameters are required');
    }
    assertObjectId(projectId, 'projectId');
    assertObjectId(chapterId, 'chapterId');

    const versionNumber = parseVersionParam(version);

    const chapter = await ChapterModel.findOne({ _id: chapterId, project: projectId }).lean<ChapterPlain>();
    if (!chapter) {
      throw new ApiError(404, 'Chapter not found for project');
    }

    const versionEntry = (chapter.versions ?? []).find((entry) => entry.version === versionNumber);
    if (!versionEntry) {
      throw new ApiError(404, 'Version not found for chapter');
    }

    res.json({ version: serializeVersionDetail(versionEntry) });
  } catch (error) {
    next(error);
  }
};

export const revertChapterVersion = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { projectId, chapterId, version } = req.params;
    if (!projectId || !chapterId) {
      throw new ApiError(400, 'projectId and chapterId parameters are required');
    }
    assertObjectId(projectId, 'projectId');
    assertObjectId(chapterId, 'chapterId');

    const versionNumber = parseVersionParam(version);
    const payload = req.body as ChapterRevertInput;

    const chapter = await ChapterModel.findOne({ _id: chapterId, project: projectId });
    if (!chapter) {
      throw new ApiError(404, 'Chapter not found for project');
    }

    const latestVersionDoc = chapter.versions.length > 0 ? chapter.versions[chapter.versions.length - 1] : undefined;
    const latestVersionNumber = latestVersionDoc?.version ?? 0;

    if (payload.baseVersion !== undefined && payload.baseVersion !== latestVersionNumber) {
      throw new ApiError(409, 'Chapter has been updated by another session');
    }

    if (versionNumber === latestVersionNumber) {
      throw new ApiError(400, 'Cannot revert to the current version');
    }

    const targetVersion = chapter.versions.find((entry) => entry.version === versionNumber);
    if (!targetVersion) {
      throw new ApiError(404, 'Version not found for chapter');
    }

    const metadata: Record<string, unknown> = {
      ...(payload.metadata ?? {}),
      source: 'revert',
      revertedFrom: versionNumber,
      baseVersion: payload.baseVersion ?? latestVersionNumber,
    };
    if (payload.reason) {
      metadata.reason = payload.reason;
    }

    chapter.content = targetVersion.content;
    chapter.versions.push({
      version: latestVersionNumber + 1,
      content: targetVersion.content,
      metadata,
    });

    await chapter.save();

    const plainChapter = toPlainChapter(chapter);
    const latestVersion = latestVersionFromPlain(plainChapter.versions || []);

    res.json({
      chapter: serializeChapterDetail(plainChapter),
      savedVersion: latestVersion ? serializeVersionSummary(latestVersion) : null,
    });
  } catch (error) {
    next(error);
  }
};

export const generateChapter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      throw new ApiError(400, 'projectId parameter is required');
    }
    assertObjectId(projectId, 'projectId');

    const payload = req.body as ChapterGenerationInput;
    const job = await getGenerationService(req).createChapterGenerationJob(projectId, payload);

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      type: job.type,
    });
  } catch (error) {
    next(error);
  }
};

export const continueChapter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId, chapterId } = req.params;
    if (!projectId || !chapterId) {
      throw new ApiError(400, 'projectId and chapterId parameters are required');
    }
    assertObjectId(projectId, 'projectId');
    assertObjectId(chapterId, 'chapterId');

    const payload = req.body as ChapterContinuationInput;
    const job = await getGenerationService(req).createChapterContinuationJob(projectId, chapterId, payload);

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      type: job.type,
    });
  } catch (error) {
    next(error);
  }
};
