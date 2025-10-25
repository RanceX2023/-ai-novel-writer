import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import PlotArcModel, { PlotArcDocument } from '../models/PlotArc';
import PlotPointModel, { PlotPointDocument } from '../models/PlotPoint';
import ProjectModel from '../models/Project';
import ChapterModel from '../models/Chapter';
import ApiError from '../utils/ApiError';
import PlotService from '../services/plotService';
import type {
  PlotArcCreateInput,
  PlotArcUpdateInput,
  PlotPointCreateInput,
  PlotPointUpdateInput,
  PlotSuggestionInput,
} from '../validators/plot';

interface PlotArcResponse {
  id: string;
  title: string;
  color?: string;
  summary?: string;
  goal?: string;
  order: number;
  themes: string[];
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PlotPointResponse {
  id: string;
  arcId: string;
  chapterId?: string | null;
  title: string;
  description?: string;
  tension: number;
  order: number;
  beatType?: string;
  status?: string;
  aiSuggested?: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

function ensureValidObjectId(id: string | undefined, label: string): Types.ObjectId {
  if (!id || !Types.ObjectId.isValid(id)) {
    throw new ApiError(400, `${label} is not a valid id`);
  }
  return new Types.ObjectId(id);
}

function serialiseArc(doc: PlotArcDocument): PlotArcResponse {
  return {
    id: doc._id.toString(),
    title: doc.title,
    color: doc.color,
    summary: doc.summary,
    goal: doc.goal,
    order: doc.order ?? 0,
    themes: doc.themes ?? [],
    metadata: doc.metadata ?? null,
    createdAt: doc.createdAt ?? undefined,
    updatedAt: doc.updatedAt ?? undefined,
  };
}

function serialisePoint(doc: PlotPointDocument): PlotPointResponse {
  return {
    id: doc._id.toString(),
    arcId: doc.arc.toString(),
    chapterId: doc.chapter ? doc.chapter.toString() : null,
    title: doc.title,
    description: doc.description,
    tension: doc.tension,
    order: doc.order ?? 0,
    beatType: doc.beatType,
    status: doc.status,
    aiSuggested: doc.aiSuggested,
    metadata: doc.metadata ?? null,
    createdAt: doc.createdAt ?? undefined,
    updatedAt: doc.updatedAt ?? undefined,
  };
}

async function assertProjectExists(projectId: Types.ObjectId): Promise<void> {
  const exists = await ProjectModel.exists({ _id: projectId }).lean();
  if (!exists) {
    throw new ApiError(404, 'Project not found');
  }
}

export async function getPlotOverview(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = ensureValidObjectId(req.params.projectId, 'projectId');
    await assertProjectExists(projectId);

    const [arcs, points] = await Promise.all([
      PlotArcModel.find({ project: projectId }).sort({ order: 1, createdAt: 1 }),
      PlotPointModel.find({ project: projectId }).sort({ order: 1, createdAt: 1 }),
    ]);

    res.status(200).json({
      arcs: arcs.map(serialiseArc),
      points: points.map(serialisePoint),
    });
  } catch (error) {
    next(error);
  }
}

export async function createPlotArc(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = ensureValidObjectId(req.params.projectId, 'projectId');
    await assertProjectExists(projectId);

    const payload = req.body as PlotArcCreateInput;
    const order =
      payload.order ?? (await PlotArcModel.countDocuments({ project: projectId }));

    const arc = await PlotArcModel.create({
      project: projectId,
      title: payload.title,
      color: payload.color,
      summary: payload.summary,
      goal: payload.goal,
      themes: payload.themes ?? [],
      metadata: payload.metadata,
      order,
    });

    res.status(201).json({ arc: serialiseArc(arc) });
  } catch (error) {
    next(error);
  }
}

export async function updatePlotArc(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = ensureValidObjectId(req.params.projectId, 'projectId');
    const arcId = ensureValidObjectId(req.params.arcId, 'arcId');
    await assertProjectExists(projectId);

    const payload = req.body as PlotArcUpdateInput;
    const arc = await PlotArcModel.findOneAndUpdate(
      { _id: arcId, project: projectId },
      { $set: { ...payload } },
      { new: true }
    );

    if (!arc) {
      throw new ApiError(404, 'Plot arc not found');
    }

    res.status(200).json({ arc: serialiseArc(arc) });
  } catch (error) {
    next(error);
  }
}

export async function deletePlotArc(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = ensureValidObjectId(req.params.projectId, 'projectId');
    const arcId = ensureValidObjectId(req.params.arcId, 'arcId');
    await assertProjectExists(projectId);

    const arc = await PlotArcModel.findOneAndDelete({ _id: arcId, project: projectId });
    if (!arc) {
      throw new ApiError(404, 'Plot arc not found');
    }

    await PlotPointModel.deleteMany({ project: projectId, arc: arcId });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function createPlotPoint(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = ensureValidObjectId(req.params.projectId, 'projectId');
    await assertProjectExists(projectId);

    const payload = req.body as PlotPointCreateInput;
    const arcId = ensureValidObjectId(payload.arcId, 'arcId');

    const [arcExists, chapter] = await Promise.all([
      PlotArcModel.exists({ _id: arcId, project: projectId }),
      payload.chapterId
        ? ChapterModel.exists({ _id: payload.chapterId, project: projectId })
        : Promise.resolve(null),
    ]);

    if (!arcExists) {
      throw new ApiError(404, 'Plot arc not found for project');
    }

    if (payload.chapterId && !chapter) {
      throw new ApiError(404, 'Chapter not found for project');
    }

    const nextOrder =
      payload.order ?? (await PlotPointModel.countDocuments({ project: projectId, arc: arcId }));

    const point = await PlotPointModel.create({
      project: projectId,
      arc: arcId,
      chapter: payload.chapterId ? new Types.ObjectId(payload.chapterId) : undefined,
      title: payload.title,
      description: payload.description,
      tension: payload.tension ?? 5,
      order: nextOrder,
      beatType: payload.beatType,
      status: payload.status,
      aiSuggested: payload.aiSuggested ?? false,
      metadata: payload.metadata,
    });

    res.status(201).json({ point: serialisePoint(point) });
  } catch (error) {
    next(error);
  }
}

export async function updatePlotPoint(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = ensureValidObjectId(req.params.projectId, 'projectId');
    const pointId = ensureValidObjectId(req.params.pointId, 'pointId');
    await assertProjectExists(projectId);

    const payload = req.body as PlotPointUpdateInput;

    const updates: Record<string, unknown> = { ...payload };
    if (payload.arcId) {
      const arcId = ensureValidObjectId(payload.arcId, 'arcId');
      const exists = await PlotArcModel.exists({ _id: arcId, project: projectId });
      if (!exists) {
        throw new ApiError(404, 'Plot arc not found for project');
      }
      updates.arc = arcId;
    }

    if (payload.chapterId !== undefined) {
      if (payload.chapterId === null) {
        updates.chapter = null;
      } else {
        const chapterId = ensureValidObjectId(payload.chapterId, 'chapterId');
        const chapterExists = await ChapterModel.exists({ _id: chapterId, project: projectId });
        if (!chapterExists) {
          throw new ApiError(404, 'Chapter not found for project');
        }
        updates.chapter = chapterId;
      }
    }

    if (payload.arcId) {
      delete updates.arcId;
    }
    if (payload.chapterId !== undefined) {
      delete updates.chapterId;
    }

    const point = await PlotPointModel.findOneAndUpdate(
      { _id: pointId, project: projectId },
      { $set: updates },
      { new: true }
    );

    if (!point) {
      throw new ApiError(404, 'Plot point not found');
    }

    res.status(200).json({ point: serialisePoint(point) });
  } catch (error) {
    next(error);
  }
}

export async function deletePlotPoint(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = ensureValidObjectId(req.params.projectId, 'projectId');
    const pointId = ensureValidObjectId(req.params.pointId, 'pointId');
    await assertProjectExists(projectId);

    const point = await PlotPointModel.findOneAndDelete({ _id: pointId, project: projectId });
    if (!point) {
      throw new ApiError(404, 'Plot point not found');
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function generatePlotSuggestions(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = ensureValidObjectId(req.params.projectId, 'projectId');
    await assertProjectExists(projectId);

    const payload = req.body as PlotSuggestionInput;

    const plotService: PlotService | undefined = req.app.get('plotService');
    if (!plotService) {
      throw new ApiError(500, 'Plot service not initialised');
    }

    const suggestions = await plotService.generateSuggestions(projectId.toString(), payload);
    res.status(200).json({ suggestions });
  } catch (error) {
    next(error);
  }
}
