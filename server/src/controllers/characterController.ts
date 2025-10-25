import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import CharacterModel from '../models/Character';
import ProjectModel from '../models/Project';
import ApiError from '../utils/ApiError';
import { CharacterCreateInput, CharacterUpdateInput } from '../validators/character';

function ensureObjectId(value: string | undefined, label: string): Types.ObjectId {
  if (!value || !Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `${label} must be a valid Mongo ObjectId`);
  }
  return new Types.ObjectId(value);
}

function serialiseCharacter(doc: {
  _id: Types.ObjectId;
  project: Types.ObjectId;
  name: string;
  role?: string | null;
  background?: string | null;
  goals?: string | null;
  conflicts?: string | null;
  quirks?: string | null;
  voice?: string | null;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: doc._id.toString(),
    projectId: doc.project.toString(),
    name: doc.name,
    role: doc.role ?? null,
    background: doc.background ?? null,
    goals: doc.goals ?? null,
    conflicts: doc.conflicts ?? null,
    quirks: doc.quirks ?? null,
    voice: doc.voice ?? null,
    notes: doc.notes ?? null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

export const listCharacters = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = ensureObjectId(req.params.projectId, 'projectId');

    const characters = await CharacterModel.find({ project: projectId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ characters: characters.map((character) => serialiseCharacter(character)) });
  } catch (error) {
    next(error);
  }
};

async function assertProjectExists(projectId: Types.ObjectId): Promise<void> {
  const exists = await ProjectModel.exists({ _id: projectId });
  if (!exists) {
    throw new ApiError(404, 'Project not found');
  }
}

export const createCharacter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = ensureObjectId(req.params.projectId, 'projectId');
    const payload = req.body as CharacterCreateInput;

    await assertProjectExists(projectId);

    const created = await CharacterModel.create({
      project: projectId,
      name: payload.name.trim(),
      role: payload.role,
      background: payload.background,
      goals: payload.goals,
      conflicts: payload.conflicts,
      quirks: payload.quirks,
      voice: payload.voice,
      notes: payload.notes,
    });

    res.status(201).json({ character: serialiseCharacter(created.toObject()) });
  } catch (error) {
    next(error);
  }
};

export const updateCharacter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = ensureObjectId(req.params.projectId, 'projectId');
    const characterId = ensureObjectId(req.params.characterId, 'characterId');
    const payload = req.body as CharacterUpdateInput;

    const character = await CharacterModel.findOne({ _id: characterId, project: projectId });
    if (!character) {
      throw new ApiError(404, 'Character not found for project');
    }

    if (payload.name !== undefined) {
      character.name = payload.name.trim();
    }
    if (payload.role !== undefined) {
      character.role = payload.role;
    }
    if (payload.background !== undefined) {
      character.background = payload.background;
    }
    if (payload.goals !== undefined) {
      character.goals = payload.goals;
    }
    if (payload.conflicts !== undefined) {
      character.conflicts = payload.conflicts;
    }
    if (payload.quirks !== undefined) {
      character.quirks = payload.quirks;
    }
    if (payload.voice !== undefined) {
      character.voice = payload.voice;
    }
    if (payload.notes !== undefined) {
      character.notes = payload.notes;
    }

    await character.save();

    res.json({ character: serialiseCharacter(character.toObject()) });
  } catch (error) {
    next(error);
  }
};

export const deleteCharacter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const projectId = ensureObjectId(req.params.projectId, 'projectId');
    const characterId = ensureObjectId(req.params.characterId, 'characterId');

    const character = await CharacterModel.findOne({ _id: characterId, project: projectId });
    if (!character) {
      throw new ApiError(404, 'Character not found for project');
    }

    await character.deleteOne();

    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
