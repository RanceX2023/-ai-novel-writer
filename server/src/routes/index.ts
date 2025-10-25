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
import {
  createProject,
  getProjectEditorContext,
  getProjectStyle,
  listProjects,
  saveProjectStyle,
} from '../controllers/projectController';
import {
  createCharacter,
  deleteCharacter,
  listCharacters,
  updateCharacter,
} from '../controllers/characterController';
import { getProjectMemory, getProjectMemoryConflicts, syncProjectMemory } from '../controllers/memoryController';
import { cancelStreamJob, streamJob } from '../controllers/streamController';
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
import {
  deleteOutlineNode,
  generateProjectOutline,
  getProjectOutline,
  reorderOutlineNodes,
  upsertOutlineNode,
} from '../controllers/outlineController';
import { validateBody } from '../middleware/validate';
import { chapterContinuationLimiter, chapterGenerationLimiter } from '../middleware/rateLimiters';
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
import { characterCreateSchema, characterUpdateSchema } from '../validators/character';
import {
  outlineGenerateSchema,
  outlineNodeUpsertSchema,
  outlineReorderSchema,
} from '../validators/outline';

const router = Router();

router.get('/projects', listProjects);
router.post('/projects', validateBody(projectCreateSchema), createProject);
router.get('/projects/:projectId/style', getProjectStyle);
router.post('/projects/:projectId/style', validateBody(projectStyleSchema), saveProjectStyle);

router.get('/projects/:projectId/characters', listCharacters);
router.post('/projects/:projectId/characters', validateBody(characterCreateSchema), createCharacter);
router.patch(
  '/projects/:projectId/characters/:characterId',
  validateBody(characterUpdateSchema),
  updateCharacter
);
router.delete('/projects/:projectId/characters/:characterId', deleteCharacter);

router.post(
  '/projects/:projectId/outline/generate',
  validateBody(outlineGenerateSchema),
  generateProjectOutline
);
router.get('/projects/:projectId/outline', getProjectOutline);
router.post('/projects/:projectId/outline', validateBody(outlineNodeUpsertSchema), upsertOutlineNode);
router.patch(
  '/projects/:projectId/outline/reorder',
  validateBody(outlineReorderSchema),
  reorderOutlineNodes
);
router.delete('/projects/:projectId/outline/:nodeId', deleteOutlineNode);

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
  chapterGenerationLimiter,
  validateBody(chapterGenerationSchema),
  generateChapter
);

router.post(
  '/projects/:projectId/chapters/:chapterId/continue',
  chapterContinuationLimiter,
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
router.get('/projects/:projectId/memory/conflicts', getProjectMemoryConflicts);
router.post(
  '/projects/:projectId/memory/sync',
  validateBody(memorySyncSchema),
  syncProjectMemory
);

router.get('/stream/:jobId', streamJob);
router.post('/stream/:jobId/cancel', cancelStreamJob);

export default router;
