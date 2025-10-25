import { Request, Response, NextFunction } from 'express';
import GenJobModel from '../models/GenJob';
import GenerationService from '../services/generationService';
import ApiError from '../utils/ApiError';
import { getRequestLogger } from '../utils/httpLogger';

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
      throw new ApiError(400, 'jobId parameter is required', undefined, 'BAD_REQUEST');
    }

    const logger = getRequestLogger(req);

    const job = await GenJobModel.findById(jobId).lean();
    if (!job) {
      logger.warn({ jobId }, 'generation job not found for streaming');
      res.status(404).json({ code: 'NOT_FOUND', message: 'Job not found' });
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

    logger.info({ jobId, status: job.status, type: job.type }, 'generation stream opened');

    if (job.status === 'completed') {
      res.write(`event: done\ndata: ${JSON.stringify({ jobId, status: job.status, result: job.result })}\n\n`);
      res.end();
      logger.info({ jobId }, 'generation stream closed (completed)');
      return;
    }

    if (job.status === 'failed') {
      const errorPayload = job.error ? { message: job.error.message, code: 'GENERATION_FAILED' } : { message: 'Generation job failed', code: 'GENERATION_FAILED' };
      res.write(`event: error\ndata: ${JSON.stringify(errorPayload)}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ jobId, status: job.status, code: 'GENERATION_FAILED' })}\n\n`);
      res.end();
      logger.warn({ jobId }, 'generation stream closed (failed)');
      return;
    }

    const generationService = getGenerationService(req);
    generationService.registerStream(jobId, res);
  } catch (error) {
    next(error);
  }
};
