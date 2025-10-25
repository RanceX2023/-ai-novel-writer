import { Router } from 'express';
import {
  continueChapter,
  generateChapter,
  getChapter,
  getChapterVersion,
  getChapterVersions,
  listChapters,
  revertChapterVersion,
  updateChapter,
} from '../controllers/chapterController';
import { streamJob } from '../controllers/streamController';
import { validateBody } from '../middleware/validate';
import {
  chapterContinuationSchema,
  chapterGenerationSchema,
  chapterRevertSchema,
  chapterUpdateSchema,
} from '../validators/chapter';

const router = Router();

router.get('/projects/:projectId/chapters', listChapters);
router.get('/projects/:projectId/chapters/:chapterId', getChapter);
router.patch(
  '/projects/:projectId/chapters/:chapterId',
  validateBody(chapterUpdateSchema),
  updateChapter
);
router.get('/projects/:projectId/chapters/:chapterId/versions', getChapterVersions);
router.get('/projects/:projectId/chapters/:chapterId/versions/:version', getChapterVersion);
router.post(
  '/projects/:projectId/chapters/:chapterId/versions/:version/revert',
  validateBody(chapterRevertSchema),
  revertChapterVersion
);

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
