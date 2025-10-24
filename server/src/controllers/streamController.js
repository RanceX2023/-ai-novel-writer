const GenJob = require('../models/GenJob');
const ApiError = require('../utils/ApiError');

function getGenerationService(req) {
  const service = req.app.get('generationService');
  if (!service) {
    throw new ApiError(500, 'Generation service not available');
  }
  return service;
}

exports.streamJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const job = await GenJob.findById(jobId).lean();

    if (!job) {
      res.status(404).json({ message: 'Job not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const initialPayload = {
      status: job.status,
      progress: job.progress,
      type: job.type,
      tokensGenerated: job.tokensGenerated,
    };
    res.write(`event: status\ndata: ${JSON.stringify(initialPayload)}\n\n`);

    if (job.status === 'succeeded') {
      if (job.result) {
        res.write(`event: completed\ndata: ${JSON.stringify(job.result)}\n\n`);
      }
      res.write('event: end\ndata: {}\n\n');
      res.end();
      return;
    }

    if (job.status === 'failed') {
      if (job.error) {
        res.write(`event: error\ndata: ${JSON.stringify(job.error)}\n\n`);
      }
      res.write('event: end\ndata: {}\n\n');
      res.end();
      return;
    }

    const service = getGenerationService(req);
    service.registerStream(jobId, res);
  } catch (error) {
    next(error);
  }
};
