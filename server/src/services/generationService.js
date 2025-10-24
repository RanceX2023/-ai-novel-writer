const { nanoid } = require('nanoid');
const Chapter = require('../models/Chapter');
const GenJob = require('../models/GenJob');
const Project = require('../models/Project');
const ApiError = require('../utils/ApiError');

class GenerationService {
  constructor() {
    this.streamSubscriptions = new Map();
  }

  registerStream(jobId, res) {
    if (!this.streamSubscriptions.has(jobId)) {
      this.streamSubscriptions.set(jobId, new Set());
    }

    const subscription = {
      res,
      keepAlive: setInterval(() => {
        if (!res.writableEnded) {
          res.write('event: ping\ndata: {}\n\n');
        }
      }, 15000),
    };

    this.streamSubscriptions.get(jobId).add(subscription);

    res.on('close', () => {
      clearInterval(subscription.keepAlive);
      const bucket = this.streamSubscriptions.get(jobId);
      if (!bucket) {
        return;
      }
      bucket.delete(subscription);
      if (bucket.size === 0) {
        this.streamSubscriptions.delete(jobId);
      }
    });
  }

  emit(jobId, event, payload) {
    const bucket = this.streamSubscriptions.get(jobId);
    if (!bucket || bucket.size === 0) {
      return;
    }

    const serialised = payload === undefined ? '' : JSON.stringify(payload);
    bucket.forEach(({ res }) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${serialised}\n\n`);
      }
    });
  }

  close(jobId) {
    const bucket = this.streamSubscriptions.get(jobId);
    if (!bucket) {
      return;
    }

    bucket.forEach(({ res, keepAlive }) => {
      clearInterval(keepAlive);
      if (!res.writableEnded) {
        res.write('event: end\ndata: {}\n\n');
        res.end();
      }
    });

    this.streamSubscriptions.delete(jobId);
  }

  async createChapterGenerationJob({
    projectId,
    title,
    synopsis,
    outlineNodes,
    memory,
    styleProfile,
  }) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    this.#mergeProjectContext(project, outlineNodes, memory, styleProfile, synopsis);
    await project.save();

    const job = await GenJob.create({
      project: project._id,
      type: 'generate',
      metadata: {
        title,
        synopsis,
        outlineNodes,
        memory,
        styleProfile,
      },
    });

    this.#executeJob(job, async (jobDoc) => {
      const order = (await Chapter.countDocuments({ project: project._id })) + 1;
      const chapterTitle = title || `Chapter ${order}`;
      const projectFresh = await Project.findById(project._id).lean();

      const content = this.#composeChapterContent({
        project: projectFresh,
        title: chapterTitle,
        outlineNodes,
        memory,
        styleProfile,
      });

      await this.#streamContent(jobDoc, content);

      const chapter = await Chapter.create({
        project: project._id,
        title: chapterTitle,
        order,
        synopsis: synopsis || '',
        content,
        versions: [
          {
            version: 1,
            content,
            metadata: {
              outlineNodes,
              memory,
              styleProfile,
            },
            job: jobDoc._id,
          },
        ],
      });

      jobDoc.chapter = chapter._id;
      jobDoc.result = {
        chapterId: chapter._id,
        version: 1,
        content,
      };
      jobDoc.markModified('result');
    });

    return job;
  }

  async createChapterContinuationJob({
    projectId,
    chapterId,
    outlineNodes,
    memory,
    styleProfile,
  }) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    const chapter = await Chapter.findOne({ _id: chapterId, project: projectId });
    if (!chapter) {
      throw new ApiError(404, 'Chapter not found for project');
    }

    this.#mergeProjectContext(project, outlineNodes, memory, styleProfile);
    await project.save();

    const job = await GenJob.create({
      project: project._id,
      chapter: chapter._id,
      type: 'continue',
      metadata: {
        outlineNodes,
        memory,
        styleProfile,
      },
    });

    this.#executeJob(job, async (jobDoc) => {
      const projectFresh = await Project.findById(project._id).lean();
      const chapterFresh = await Chapter.findById(chapter._id);
      const versionNumber = chapterFresh.versions.length + 1;

      const continuation = this.#composeContinuation({
        project: projectFresh,
        chapter: chapterFresh.toObject(),
        outlineNodes,
        memory,
        styleProfile,
      });

      await this.#streamContent(jobDoc, continuation);

      const appended = `${chapterFresh.content ? `${chapterFresh.content}\n\n` : ''}${continuation}`;
      chapterFresh.content = appended;
      chapterFresh.versions.push({
        version: versionNumber,
        content: appended,
        metadata: {
          outlineNodes,
          memory,
          styleProfile,
        },
        job: jobDoc._id,
      });

      await chapterFresh.save();

      jobDoc.result = {
        chapterId: chapterFresh._id,
        version: versionNumber,
        content: appended,
        delta: continuation,
      };
      jobDoc.markModified('result');
    });

    return job;
  }

  async createProjectRewriteJob({ projectId, summary, styleProfile }) {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    const mergedStyle = this.#mergeProjectContext(project, undefined, undefined, styleProfile);
    await project.save();

    const job = await GenJob.create({
      project: project._id,
      type: 'rewrite',
      metadata: {
        summary,
        styleProfile,
      },
    });

    this.#executeJob(job, async (jobDoc) => {
      const projectFresh = await Project.findById(project._id);
      const nextVersion = projectFresh.rewriteHistory.length + 1;
      const rewritten = this.#composeProjectRewrite({
        project: projectFresh.toObject(),
        summary,
        styleProfile: mergedStyle,
      });

      await this.#streamContent(jobDoc, rewritten);

      projectFresh.synopsis = rewritten;
      projectFresh.rewriteHistory.push({
        version: nextVersion,
        content: rewritten,
        styleProfile: mergedStyle || {},
        job: jobDoc._id,
      });

      await projectFresh.save();

      jobDoc.result = {
        projectId: projectFresh._id,
        version: nextVersion,
        summary: rewritten,
      };
      jobDoc.markModified('result');
    });

    return job;
  }

  #executeJob(job, handler) {
    setImmediate(async () => {
      try {
        const jobDoc = await GenJob.findById(job._id);
        if (!jobDoc) {
          return;
        }

        jobDoc.status = 'running';
        jobDoc.startedAt = new Date();
        await jobDoc.save();
        this.emit(jobDoc.id, 'status', { status: 'running' });

        await handler(jobDoc);

        jobDoc.status = 'succeeded';
        jobDoc.completedAt = new Date();
        jobDoc.progress = 100;
        await jobDoc.save();

        this.emit(jobDoc.id, 'status', { status: 'succeeded' });
        this.emit(jobDoc.id, 'completed', jobDoc.result || {});
        this.close(jobDoc.id);
      } catch (error) {
        await this.#failJob(job._id, error);
      }
    });
  }

  async #failJob(jobId, error) {
    const jobDoc = await GenJob.findById(jobId);
    if (!jobDoc) {
      return;
    }

    jobDoc.status = 'failed';
    jobDoc.error = {
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    };
    jobDoc.completedAt = new Date();
    await jobDoc.save();

    this.emit(jobDoc.id, 'status', { status: 'failed' });
    this.emit(jobDoc.id, 'error', jobDoc.error);
    this.close(jobDoc.id);
  }

  async #streamContent(jobDoc, content) {
    const jobId = jobDoc.id;
    const tokens = this.#tokenise(content);
    const totalTokens = tokens.length;

    if (totalTokens === 0) {
      this.emit(jobId, 'progress', { progress: 100 });
      jobDoc.progress = 100;
      jobDoc.metadata = {
        ...(jobDoc.metadata || {}),
        tokenCount: 0,
        contentLength: content.length,
      };
      return;
    }

    let emitted = 0;
    for (const token of tokens) {
      emitted += 1;
      const progress = Math.round((emitted / totalTokens) * 100);

      this.emit(jobId, 'token', { token });
      this.emit(jobId, 'progress', { progress });

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    jobDoc.tokensGenerated = totalTokens;
    jobDoc.progress = 100;
    jobDoc.metadata = {
      ...(jobDoc.metadata || {}),
      tokenCount: totalTokens,
      contentLength: content.length,
    };
    jobDoc.markModified('metadata');
  }

  #tokenise(content) {
    return content.split(/\s+/).filter((token) => token.length > 0);
  }

  #mergeProjectContext(project, outlineNodes, memory, styleProfile, synopsis) {
    const sanitizedStyle =
      styleProfile && typeof styleProfile === 'object' ? styleProfile : {};
    const currentStyle = project.styleProfile
      ? typeof project.styleProfile.toObject === 'function'
        ? project.styleProfile.toObject()
        : { ...project.styleProfile }
      : {};

    const mergedStyle =
      Object.keys(sanitizedStyle).length > 0
        ? { ...currentStyle, ...sanitizedStyle }
        : currentStyle;

    if (Array.isArray(outlineNodes) && outlineNodes.length > 0) {
      project.outlineNodes = outlineNodes.map((node, index) => ({
        key: node.key || nanoid(8),
        title: node.title,
        summary: node.summary || node.description || node.prompt,
        order: node.order ?? index + 1,
        metadata: node.metadata,
      }));
    }

    if (Array.isArray(memory) && memory.length > 0) {
      project.memoryBank = memory.map((fragment) => ({
        key: fragment.key || nanoid(8),
        label: fragment.label || fragment.title,
        content: fragment.content || fragment.reminder || '',
        tags: fragment.tags || [],
        metadata: fragment.metadata,
      }));
    }

    if (Object.keys(mergedStyle).length > 0) {
      project.styleProfile = mergedStyle;
    }

    if (synopsis) {
      project.synopsis = synopsis;
    }

    return mergedStyle;
  }

  #composeChapterContent({ project, title, outlineNodes, memory, styleProfile }) {
    const contextOutline = Array.isArray(outlineNodes) && outlineNodes.length > 0
      ? outlineNodes
      : project.outlineNodes || [];
    const contextMemory = Array.isArray(memory) && memory.length > 0
      ? memory
      : project.memoryBank || [];

    const mergedStyle = {
      ...(project.styleProfile || {}),
      ...(styleProfile || {}),
    };

    const styleIntro = this.#buildStyleIntro(mergedStyle);
    const memoryBeat = contextMemory.length
      ? `Key memories: ${contextMemory
          .map((fragment) => fragment.content)
          .filter(Boolean)
          .join('; ')}.`
      : '';

    const beats = contextOutline.length
      ? contextOutline.map((node, index) => {
          const titleFragment = node.title || `Story beat ${index + 1}`;
          const summaryFragment = node.summary || node.description || node.prompt || '';
          const memoryFragment = contextMemory[index % (contextMemory.length || 1)]?.content;
          const memoryCue = memoryFragment ? ` This moment echoes the memory: "${memoryFragment}".` : '';
          return `${titleFragment}: ${summaryFragment}${memoryCue}`.trim();
        })
      : [`This chapter expands on the world of "${project.name}".`];

    const paragraphs = beats
      .map((beat) => this.#renderParagraph(beat, mergedStyle))
      .join('\n\n');

    const synopsisLine = project.synopsis ? `Synopsis reference: ${project.synopsis}` : '';

    return [
      title ? `# ${title}` : `# Chapter in ${project.name}`,
      styleIntro,
      memoryBeat,
      synopsisLine,
      paragraphs,
      'The chapter closes by setting the stage for the next pivotal conflict.',
    ]
      .filter((segment) => segment && segment.length > 0)
      .join('\n\n');
  }

  #composeContinuation({ project, chapter, outlineNodes, memory, styleProfile }) {
    const contextOutline = Array.isArray(outlineNodes) && outlineNodes.length > 0
      ? outlineNodes
      : project.outlineNodes || [];
    const contextMemory = Array.isArray(memory) && memory.length > 0
      ? memory
      : project.memoryBank || [];
    const mergedStyle = {
      ...(project.styleProfile || {}),
      ...(styleProfile || {}),
    };

    const lastParagraph = chapter.content
      ? chapter.content.split(/\n\n/).filter(Boolean).slice(-1)[0]
      : '';

    const bridge = lastParagraph
      ? `Building upon the previous moment where ${this.#summariseSentence(lastParagraph)},`
      : 'Picking up the momentum,';

    const nextBeat = contextOutline[chapter.versions.length] || contextOutline[0];
    const memoryFragment = contextMemory[(chapter.versions.length + 1) % (contextMemory.length || 1)];

    const continuationCore = nextBeat
      ? `${bridge} the narrative shifts to ${nextBeat.summary || nextBeat.description || nextBeat.prompt || 'a developing conflict'}.`
      : `${bridge} the narrative deepens the emotional stakes for the protagonists.`;

    const memoryLine = memoryFragment
      ? `Characters recall ${memoryFragment.content || memoryFragment.reminder}, allowing the scene to resonate with established history.`
      : '';

    const styleOutro = this.#buildStyleOutro(mergedStyle);

    return [continuationCore, memoryLine, styleOutro]
      .filter((segment) => segment && segment.length > 0)
      .join(' ');
  }

  #composeProjectRewrite({ project, summary, styleProfile }) {
    const mergedStyle = {
      ...(project.styleProfile || {}),
      ...(styleProfile || {}),
    };

    const intro = `${project.name} — refreshed project synopsis`;
    const styleDetails = this.#buildStyleIntro(mergedStyle);
    const outlineFocus = project.outlineNodes && project.outlineNodes.length
      ? `The narrative arc emphasises ${project.outlineNodes
          .map((node) => node.title || node.summary)
          .filter(Boolean)
          .slice(0, 3)
          .join(', ')}.`
      : '';
    const baseSummary = summary || project.synopsis || 'A tale that continues to evolve in scope and emotion.';
    const outro = this.#buildStyleOutro(mergedStyle);

    return [intro, styleDetails, baseSummary, outlineFocus, outro]
      .filter((segment) => segment && segment.length > 0)
      .join('\n\n');
  }

  #buildStyleIntro(styleProfile = {}) {
    const descriptors = [];
    if (styleProfile.voice) descriptors.push(`voice: ${styleProfile.voice}`);
    if (styleProfile.tone) descriptors.push(`tone: ${styleProfile.tone}`);
    if (styleProfile.pacing) descriptors.push(`pacing: ${styleProfile.pacing}`);
    if (styleProfile.mood) descriptors.push(`mood: ${styleProfile.mood}`);
    if (styleProfile.genre) descriptors.push(`genre: ${styleProfile.genre}`);

    if (descriptors.length === 0 && !styleProfile.instructions) {
      return '';
    }

    const instructions = styleProfile.instructions
      ? `Guiding instruction: ${styleProfile.instructions}.`
      : '';

    return [`Narrative style => ${descriptors.join(', ')}`, instructions]
      .filter(Boolean)
      .join(' ');
  }

  #buildStyleOutro(styleProfile = {}) {
    if (styleProfile.mood || styleProfile.tone) {
      return `Maintain a ${styleProfile.mood || styleProfile.tone} cadence that honours the established atmosphere.`;
    }
    if (styleProfile.voice) {
      return `Keep the ${styleProfile.voice} perspective steady as the scene develops.`;
    }
    return 'Maintain continuity with the established character motivations as the story presses forward.';
  }

  #renderParagraph(seed, styleProfile = {}) {
    const tone = styleProfile.tone || styleProfile.mood || 'immersive';
    return `In a ${tone} cadence, ${seed}`;
  }

  #summariseSentence(text) {
    const normalised = text.replace(/\s+/g, ' ').trim();
    return normalised.length > 120 ? `${normalised.slice(0, 117)}...` : normalised;
  }
}

module.exports = GenerationService;
