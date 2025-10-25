import { Request, Response, NextFunction } from 'express';
import GenJobModel from '../models/GenJob';
import GenerationService from '../services/generationService';
import ApiError from '../utils/ApiError';

function getGenerationService(req: Request): GenerationService {
  const service = req.app.get('generationService') as GenerationService | undefined;
  if (!service) {
    throw new ApiError(500, 'Generation service not available');
  }
  return service;
}

export const streamJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      throw new ApiError(400, 'jobId parameter is required');
    }

    const job = await GenJobModel.findById(jobId).lean();
    if (!job) {
      res.status(404).json({ message: 'Job not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const initialPayload = {
      jobId,
      status: job.status,
      type: job.type,
      progress: job.progress,
      tokensGenerated: job.tokensGenerated,
    };

    res.write(`event: start\ndata: ${JSON.stringify(initialPayload)}\n\n`);

    if (job.status === 'completed') {
      res.write(`event: done\ndata: ${JSON.stringify({ jobId, status: job.status, result: job.result })}\n\n`);
      res.end();
      return;
    }

    if (job.status === 'failed') {
      const errorPayload = job.error || { message: 'Generation job failed' };
      res.write(`event: error\ndata: ${JSON.stringify(errorPayload)}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ jobId, status: job.status })}\n\n`);
      res.end();
      return;
    }

    const generationService = getGenerationService(req);
    generationService.registerStream(jobId, res);
  } catch (error) {
    next(error);
  }
};
