import { Request, Response, NextFunction } from 'express';
import OutlineService from '../services/outlineService';
import ApiError from '../utils/ApiError';
import {
  OutlineGenerateInput,
  OutlineNodeUpsertInput,
  OutlineReorderInput,
} from '../validators/outline';

function getOutlineService(req: Request): OutlineService {
  const service = req.app.get('outlineService') as OutlineService | undefined;
  if (!service) {
    throw new ApiError(500, '大纲服务暂不可用');
  }
  return service;
}

function ensureProjectId(req: Request): string {
  const projectId = req.params.projectId || req.params.id;
  if (!projectId) {
    throw new ApiError(400, '缺少项目 ID');
  }
  return projectId;
}

export const generateProjectOutline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = ensureProjectId(req);
    const payload = req.body as OutlineGenerateInput;
    const outline = await getOutlineService(req).generateOutline(projectId, payload);
    res.status(201).json({ outline });
  } catch (error) {
    next(error);
  }
};

export const getProjectOutline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = ensureProjectId(req);
    const outline = await getOutlineService(req).getOutlineTree(projectId);
    res.json({ outline });
  } catch (error) {
    next(error);
  }
};

export const upsertOutlineNode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = ensureProjectId(req);
    const payload = req.body as OutlineNodeUpsertInput;
    const node = await getOutlineService(req).upsertNode(projectId, payload);
    res.json({ node });
  } catch (error) {
    next(error);
  }
};

export const reorderOutlineNodes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = ensureProjectId(req);
    const payload = req.body as OutlineReorderInput;
    await getOutlineService(req).reorderNodes(projectId, payload);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const deleteOutlineNode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = ensureProjectId(req);
    const { nodeId } = req.params;
    if (!nodeId) {
      throw new ApiError(400, '缺少节点 ID');
    }
    const removed = await getOutlineService(req).deleteNode(projectId, nodeId);
    res.json({ removed });
  } catch (error) {
    next(error);
  }
};
