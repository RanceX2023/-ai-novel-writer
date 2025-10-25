import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import ApiError from '../utils/ApiError';
import MemoryService from '../services/memoryService';
import { MemorySyncRequest } from '../validators/memory';

function getMemoryService(req: Request): MemoryService {
  const service = req.app.get('memoryService') as MemoryService | undefined;
  if (!service) {
    throw new ApiError(500, 'Memory service not available');
  }
  return service;
}

function assertObjectId(value: string, label: string): void {
  if (!Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `${label} must be a valid Mongo ObjectId`);
  }
}

export const syncProjectMemory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      throw new ApiError(400, 'projectId parameter is required');
    }
    assertObjectId(projectId, 'projectId');

    const payload = req.body as MemorySyncRequest;
    const projectObjectId = new Types.ObjectId(projectId);
    const chapterObjectId = payload.chapterId ? new Types.ObjectId(payload.chapterId) : undefined;

    const result = await getMemoryService(req).syncMemory({
      projectId: projectObjectId,
      chapterId: chapterObjectId,
      chapterLabel: payload.chapterTitle,
      items: payload.items,
      source: 'api',
    });

    res.json({ result });
  } catch (error) {
    next(error);
  }
};

export const getProjectMemory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      throw new ApiError(400, 'projectId parameter is required');
    }
    assertObjectId(projectId, 'projectId');

    const projectObjectId = new Types.ObjectId(projectId);
    const docs = await getMemoryService(req).getProjectMemory(projectObjectId);

    type MemoryResponseItem = {
      id: string;
      key: string;
      type: string;
      content: string;
      weight: number;
      category: string | null;
      metadata: Record<string, unknown> | null;
      refs: Array<{ chapterId: string | null; label: string | null; addedAt: Date | null }>;
      updatedAt: Date | null;
    };

    const grouped: {
      world: MemoryResponseItem[];
      facts: MemoryResponseItem[];
      priorSummary: MemoryResponseItem[];
      taboo: MemoryResponseItem[];
    } = {
      world: [],
      facts: [],
      priorSummary: [],
      taboo: [],
    };

    docs.forEach((doc) => {
      const entry: MemoryResponseItem = {
        id: doc._id.toString(),
        key: doc.key,
        type: doc.type,
        content: doc.content,
        weight: doc.weight,
        category: doc.category ?? null,
        metadata: doc.metadata ?? null,
        refs: (doc.refs || []).map((ref) => ({
          chapterId: ref.chapterId ? ref.chapterId.toString() : null,
          label: ref.label ?? null,
          addedAt: ref.addedAt ?? null,
        })),
        updatedAt: doc.updatedAt ?? doc.createdAt ?? null,
      };

      switch (doc.type) {
        case 'world':
          grouped.world.push(entry);
          break;
        case 'fact':
          grouped.facts.push(entry);
          break;
        case 'prior_summary':
          grouped.priorSummary.push(entry);
          break;
        case 'taboo':
        default:
          grouped.taboo.push(entry);
          break;
      }
    });

    res.json({ memory: grouped });
  } catch (error) {
    next(error);
  }
};
