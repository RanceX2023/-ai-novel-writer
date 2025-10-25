import { Request, Response, NextFunction } from 'express';
import GenerationService from '../services/generationService';
import ApiError from '../utils/ApiError';
import { ChapterContinuationInput, ChapterGenerationInput } from '../validators/chapter';

function getGenerationService(req: Request): GenerationService {
  const service = req.app.get('generationService') as GenerationService | undefined;
  if (!service) {
    throw new ApiError(500, 'Generation service not available');
  }
  return service;
}

export const generateChapter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      throw new ApiError(400, 'projectId parameter is required');
    }

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
