const ApiError = require('../utils/ApiError');

function getGenerationService(req) {
  const service = req.app.get('generationService');
  if (!service) {
    throw new ApiError(500, 'Generation service not available');
  }
  return service;
}

exports.rewriteProject = async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      throw new ApiError(400, 'Request body must be a JSON object');
    }

    const { id: projectId } = req.params;
    const { summary, styleProfile } = req.body;

    const job = await getGenerationService(req).createProjectRewriteJob({
      projectId,
      summary,
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
