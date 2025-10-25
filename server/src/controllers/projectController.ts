import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import ProjectModel, { Project, StyleProfile as ProjectStyleProfile } from '../models/Project';
import OutlineNodeModel from '../models/OutlineNode';
import ApiError from '../utils/ApiError';
import { ProjectCreateInput, ProjectStyleInput } from '../validators/project';

function ensureObjectId(value: string | undefined, label: string): Types.ObjectId {
  if (!value || !Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `${label} must be a valid Mongo ObjectId`);
  }
  return new Types.ObjectId(value);
}

function normaliseStyleProfile(style?: ProjectStyleProfile | null) {
  if (!style) {
    return null;
  }
  return {
    genre: style.genre ?? null,
    tone: style.tone ?? null,
    pacing: style.pacing ?? null,
    pov: style.pov ?? null,
    voice: style.voice ?? null,
    language: style.language ?? null,
    instructions: style.instructions ?? null,
  };
}

type SerializableProject = Pick<Project, 'name' | 'synopsis' | 'styleProfile'> & {
  _id: Types.ObjectId;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

function serialiseProject(project: SerializableProject) {
  return {
    id: project._id.toString(),
    name: project.name,
    synopsis: project.synopsis ?? null,
    createdAt: project.createdAt ? new Date(project.createdAt).toISOString() : null,
    updatedAt: project.updatedAt ? new Date(project.updatedAt).toISOString() : null,
    styleProfile: normaliseStyleProfile(project.styleProfile ?? null),
  };
}

export const listProjects = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projects = await ProjectModel.find()
      .sort({ createdAt: -1 })
      .select({ name: 1, synopsis: 1, styleProfile: 1, createdAt: 1, updatedAt: 1 })
      .lean();

    res.json({
      projects: projects.map((project) => serialiseProject(project as SerializableProject)),
    });
  } catch (error) {
    next(error);
  }
};

export const createProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payload = req.body as ProjectCreateInput;
    const project = await ProjectModel.create({
      name: payload.name,
      synopsis: payload.synopsis ?? undefined,
    });
    const created = project.toObject();
    res.status(201).json({
      project: serialiseProject(created as SerializableProject),
    });
  } catch (error) {
    next(error);
  }
};

export const saveProjectStyle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = ensureObjectId(req.params.projectId, 'projectId');
    const payload = req.body as ProjectStyleInput;

    const project = await ProjectModel.findById(projectId);
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    project.styleProfile = {
      genre: payload.genre,
      tone: payload.tone,
      pacing: payload.pacing,
      pov: payload.pov,
      voice: payload.voice ?? undefined,
      language: payload.language ?? '中文',
      instructions: payload.instructions ?? undefined,
    };

    await project.save();

    const saved = project.toObject();
    res.json({
      project: serialiseProject(saved as SerializableProject),
    });
  } catch (error) {
    next(error);
  }
};

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

    const outlineDocs = await OutlineNodeModel.find({ project: projectId })
      .sort({ parentId: 1, order: 1, createdAt: 1 })
      .lean<{ nodeId: string; parentId?: string | null; order?: number; title?: string; summary?: string }[]>();

    let outline = outlineDocs
      .filter((node) => !node.parentId)
      .map((node, index) => ({
        id: node.nodeId,
        title: node.title || `大纲节点 ${index + 1}`,
        summary: node.summary || '',
        order: typeof node.order === 'number' ? node.order : index,
      }));

    if (!outline.length) {
      outline = (project.outlineNodes || []).map((node, index) => ({
        id: node.key || `${project._id.toString()}-${index}`,
        title: node.title || `大纲节点 ${index + 1}`,
        summary: node.summary || '',
        order: typeof node.order === 'number' ? node.order : index,
      }));
    }

    res.json({
      project: {
        id: project._id.toString(),
        name: project.name,
        synopsis: project.synopsis ?? null,
        outline,
        styleProfile: normaliseStyleProfile(project.styleProfile ?? null),
      },
    });
  } catch (error) {
    next(error);
  }
};
