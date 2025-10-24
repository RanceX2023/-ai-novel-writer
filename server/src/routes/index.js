const express = require('express');
const chapterController = require('../controllers/chapterController');
const projectController = require('../controllers/projectController');
const streamController = require('../controllers/streamController');

const router = express.Router();

router.post('/projects/:id/chapters/generate', chapterController.generateChapter);
router.post('/projects/:id/chapters/:chapterId/continue', chapterController.continueChapter);
router.post('/projects/:id/rewrite', projectController.rewriteProject);
router.get('/stream/:jobId', streamController.streamJob);

module.exports = router;
