import { Router } from 'express';
import { generateChapter, continueChapter } from '../controllers/chapterController';
import { streamJob } from '../controllers/streamController';
import { validateBody } from '../middleware/validate';
import { chapterContinuationSchema, chapterGenerationSchema } from '../validators/chapter';

const router = Router();

router.post(
  '/projects/:projectId/chapters/generate',
  validateBody(chapterGenerationSchema),
  generateChapter
);

router.post(
  '/projects/:projectId/chapters/:chapterId/continue',
  validateBody(chapterContinuationSchema),
  continueChapter
);

router.get('/stream/:jobId', streamJob);

export default router;
