import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import ProjectModel from '../models/Project';
import ApiError from '../utils/ApiError';

function ensureObjectId(value: string | undefined, label: string): Types.ObjectId {
  if (!value || !Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `${label} must be a valid Mongo ObjectId`);
  }
  return new Types.ObjectId(value);
}

export const getProjectEditorContext = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const projectId = ensureObjectId(req.params.projectId, 'projectId');

    const project = await ProjectModel.findById(projectId).lean();
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    const outline = (project.outlineNodes || []).map((node, index) => ({
      id: node.key || `${project._id.toString()}-${index}`,
      title: node.title || `大纲节点 ${index + 1}`,
      summary: node.summary || '',
      order: typeof node.order === 'number' ? node.order : index,
    }));

    res.json({
      project: {
        id: project._id.toString(),
        name: project.name,
        synopsis: project.synopsis ?? null,
        outline,
      },
    });
  } catch (error) {
    next(error);
  }
};
