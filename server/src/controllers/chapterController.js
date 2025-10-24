const ApiError = require('../utils/ApiError');

function getGenerationService(req) {
  const service = req.app.get('generationService');
  if (!service) {
    throw new ApiError(500, 'Generation service not available');
  }
  return service;
}

exports.generateChapter = async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      throw new ApiError(400, 'Request body must be a JSON object');
    }

    const { id: projectId } = req.params;
    const {
      title,
      synopsis,
      outlineNodes,
      memory,
      styleProfile,
    } = req.body;

    const job = await getGenerationService(req).createChapterGenerationJob({
      projectId,
      title,
      synopsis,
      outlineNodes,
      memory,
      styleProfile,
    });

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      type: job.type,
    });
  } catch (error) {
    next(error);
  }
};

exports.continueChapter = async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      throw new ApiError(400, 'Request body must be a JSON object');
    }

    const { id: projectId, chapterId } = req.params;
    const {
      outlineNodes,
      memory,
      styleProfile,
    } = req.body;

    const job = await getGenerationService(req).createChapterContinuationJob({
      projectId,
      chapterId,
      outlineNodes,
      memory,
      styleProfile,
    });

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      type: job.type,
    });
  } catch (error) {
    next(error);
  }
};
