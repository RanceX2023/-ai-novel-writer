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
import { createProject, getProjectEditorContext, listProjects, saveProjectStyle } from '../controllers/projectController';
import { getProjectMemory, syncProjectMemory } from '../controllers/memoryController';
import { streamJob } from '../controllers/streamController';
import {
  createPlotArc,
  createPlotPoint,
  deletePlotArc,
  deletePlotPoint,
  generatePlotSuggestions,
  getPlotOverview,
  updatePlotArc,
  updatePlotPoint,
} from '../controllers/plotController';
import { validateBody } from '../middleware/validate';
import {
  chapterContinuationSchema,
  chapterGenerationSchema,
  chapterRevertSchema,
  chapterUpdateSchema,
} from '../validators/chapter';
import { memorySyncSchema } from '../validators/memory';
import {
  plotArcCreateSchema,
  plotArcUpdateSchema,
  plotPointCreateSchema,
  plotPointUpdateSchema,
  plotSuggestionSchema,
} from '../validators/plot';
import { projectCreateSchema, projectStyleSchema } from '../validators/project';

const router = Router();

router.get('/projects', listProjects);
router.post('/projects', validateBody(projectCreateSchema), createProject);
router.post('/projects/:projectId/style', validateBody(projectStyleSchema), saveProjectStyle);

router.get('/projects/:projectId/editor-context', getProjectEditorContext);
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

router.get('/projects/:projectId/plot', getPlotOverview);
router.post('/projects/:projectId/plot/arcs', validateBody(plotArcCreateSchema), createPlotArc);
router.patch('/projects/:projectId/plot/arcs/:arcId', validateBody(plotArcUpdateSchema), updatePlotArc);
router.delete('/projects/:projectId/plot/arcs/:arcId', deletePlotArc);
router.post('/projects/:projectId/plot/points', validateBody(plotPointCreateSchema), createPlotPoint);
router.patch(
  '/projects/:projectId/plot/points/:pointId',
  validateBody(plotPointUpdateSchema),
  updatePlotPoint
);
router.delete('/projects/:projectId/plot/points/:pointId', deletePlotPoint);
router.post(
  '/projects/:projectId/plot/suggestions',
  validateBody(plotSuggestionSchema),
  generatePlotSuggestions
);

router.get('/projects/:projectId/memory', getProjectMemory);
router.post(
  '/projects/:projectId/memory/sync',
  validateBody(memorySyncSchema),
  syncProjectMemory
);

router.get('/stream/:jobId', streamJob);

export default router;
