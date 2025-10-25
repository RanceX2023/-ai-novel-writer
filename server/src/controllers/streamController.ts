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

    const metadata = job.metadata && typeof job.metadata === 'object' ? (job.metadata as Record<string, unknown>) : null;
    const resultObject = job.result && typeof job.result === 'object' ? (job.result as Record<string, unknown>) : null;
    const requestId = typeof metadata?.requestId === 'string'
      ? (metadata.requestId as string)
      : typeof resultObject?.requestId === 'string'
        ? (resultObject.requestId as string)
        : undefined;

    const initialPayload = {
      jobId,
      status: job.status,
      type: job.type,
      progress: job.progress,
      tokensGenerated: job.tokensGenerated,
      requestId,
    };

    res.write(`event: start\ndata: ${JSON.stringify(initialPayload)}\n\n`);

    logger.info({ jobId, status: job.status, type: job.type }, 'generation stream opened');

    if (job.status === 'completed') {
      const donePayload: Record<string, unknown> = { jobId, status: job.status, result: job.result };
      if (requestId) {
        donePayload.requestId = requestId;
      }
      res.write(`event: done\ndata: ${JSON.stringify(donePayload)}\n\n`);
      res.end();
      logger.info({ jobId }, 'generation stream closed (completed)');
      return;
    }

    if (job.status === 'failed') {
      const errorPayload: Record<string, unknown> = job.error
        ? { message: job.error.message, code: 'GENERATION_FAILED' }
        : { message: 'Generation job failed', code: 'GENERATION_FAILED' };
      if (requestId) {
        errorPayload.requestId = requestId;
      }
      res.write(`event: error\ndata: ${JSON.stringify(errorPayload)}\n\n`);
      const donePayload: Record<string, unknown> = {
        jobId,
        status: job.status,
        code: 'GENERATION_FAILED',
      };
      if (requestId) {
        donePayload.requestId = requestId;
      }
      res.write(`event: done\ndata: ${JSON.stringify(donePayload)}\n\n`);
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

export const cancelStreamJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      throw new ApiError(400, 'jobId parameter is required', undefined, 'BAD_REQUEST');
    }

    const generationService = getGenerationService(req);
    const job = await GenJobModel.findById(jobId);
    if (!job) {
      res.status(404).json({ code: 'NOT_FOUND', message: '未找到对应的生成任务。' });
      return;
    }

    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      res.status(409).json({ code: 'GENERATION_NOT_ACTIVE', message: '生成任务已结束，无需取消。' });
      return;
    }

    generationService.cancelJob(jobId, '用户手动取消生成任务');

    res.status(202).json({ code: 'GENERATION_CANCELLING', message: '已发送取消指令，请稍候确认状态。' });
  } catch (error) {
    next(error);
  }
};
