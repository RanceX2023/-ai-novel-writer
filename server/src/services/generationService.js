const { nanoid } = require('nanoid');
const Chapter = require('../models/Chapter');
const GenJob = require('../models/GenJob');
const Project = require('../models/Project');
const ApiError = require('../utils/ApiError');
const OpenAIService = require('./openai');

class GenerationService {
  constructor({ openAIService } = {}) {
    this.streamSubscriptions = new Map();
    this.openAIService = openAIService || new OpenAIService();
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

    const mergedStyle = this.#mergeProjectContext(
      project,
      outlineNodes,
      memory,
      styleProfile,
      synopsis
    );
    await project.save();

    const job = await GenJob.create({
      project: project._id,
      type: 'generate',
      metadata: {
        title,
        synopsis,
        outlineNodes,
        memory,
        styleProfile: mergedStyle,
      },
    });

    this.#executeJob(job, async (jobDoc) => {
      const order = (await Chapter.countDocuments({ project: project._id })) + 1;
      const chapterTitle = title || `Chapter ${order}`;
      const projectSnapshot = await Project.findById(project._id).lean();

      const { content, usage } = await this.openAIService.generateChapter({
        projectTitle: projectSnapshot.name,
        synopsis: projectSnapshot.synopsis,
        chapterTitle,
        outlineNodes: Array.isArray(outlineNodes) && outlineNodes.length
          ? outlineNodes
          : projectSnapshot.outlineNodes || [],
        memoryBank: Array.isArray(memory) && memory.length
          ? memory
          : projectSnapshot.memoryBank || [],
        styleProfile: mergedStyle || projectSnapshot.styleProfile,
        continuation: false,
      });

      await this.#streamContent(jobDoc, content, { usage });

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
              styleProfile: mergedStyle,
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

    const mergedStyle = this.#mergeProjectContext(project, outlineNodes, memory, styleProfile);
    await project.save();

    const job = await GenJob.create({
      project: project._id,
      chapter: chapter._id,
      type: 'continue',
      metadata: {
        outlineNodes,
        memory,
        styleProfile: mergedStyle,
      },
    });

    this.#executeJob(job, async (jobDoc) => {
      const projectSnapshot = await Project.findById(project._id).lean();
      const chapterSnapshot = await Chapter.findById(chapter._id).lean();
      const versionNumber = (chapterSnapshot.versions?.length || 0) + 1;

      const { content: continuation, usage } = await this.openAIService.generateChapter({
        projectTitle: projectSnapshot.name,
        synopsis: projectSnapshot.synopsis,
        chapterTitle: chapterSnapshot.title,
        outlineNodes: Array.isArray(outlineNodes) && outlineNodes.length
          ? outlineNodes
          : projectSnapshot.outlineNodes || [],
        memoryBank: Array.isArray(memory) && memory.length
          ? memory
          : projectSnapshot.memoryBank || [],
        styleProfile: mergedStyle || projectSnapshot.styleProfile,
        continuation: true,
        previousChapterSummary: this.#summariseText(chapterSnapshot.content),
        instructions: 'Extend the chapter with the next significant scene while preserving established tone and continuity.',
      });

      await this.#streamContent(jobDoc, continuation, { usage });

      const appended = `${chapterSnapshot.content ? `${chapterSnapshot.content}\n\n` : ''}${continuation}`;
      const chapterDoc = await Chapter.findById(chapter._id);
      chapterDoc.content = appended;
      chapterDoc.versions.push({
        version: versionNumber,
        content: appended,
        delta: continuation,
        metadata: {
          outlineNodes,
          memory,
          styleProfile: mergedStyle,
        },
        job: jobDoc._id,
      });

      await chapterDoc.save();

      jobDoc.result = {
        chapterId: chapterDoc._id,
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
        styleProfile: mergedStyle,
      },
    });

    this.#executeJob(job, async (jobDoc) => {
      const projectSnapshot = await Project.findById(project._id).lean();
      const nextVersion = (projectSnapshot.rewriteHistory?.length || 0) + 1;

      const { content: rewritten, usage } = await this.openAIService.rewriteSynopsis({
        projectTitle: projectSnapshot.name,
        synopsis: projectSnapshot.synopsis,
        styleProfile: mergedStyle || projectSnapshot.styleProfile,
        focusAreas: summary ? [summary] : [],
        instructions: summary
          ? `Incorporate these editorial notes into the rewrite: ${summary}`
          : undefined,
      });

      await this.#streamContent(jobDoc, rewritten, { usage });

      const projectDoc = await Project.findById(project._id);
      projectDoc.synopsis = rewritten;
      projectDoc.rewriteHistory.push({
        version: nextVersion,
        content: rewritten,
        styleProfile: mergedStyle || {},
        job: jobDoc._id,
      });

      await projectDoc.save();

      jobDoc.result = {
        projectId: projectDoc._id,
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

  async #streamContent(jobDoc, content, { usage } = {}) {
    const jobId = jobDoc.id;
    const tokens = this.#tokenise(content || '');
    const totalTokens = tokens.length;

    if (totalTokens === 0) {
      this.emit(jobId, 'progress', { progress: 100 });
      jobDoc.progress = 100;
      jobDoc.tokensGenerated = usage?.completionTokens ?? 0;
      const metadata = {
        ...(jobDoc.metadata || {}),
        tokenCount: usage?.completionTokens ?? 0,
        contentLength: content?.length || 0,
      };
      if (usage) {
        metadata.usage = usage;
      }
      jobDoc.metadata = metadata;
      jobDoc.markModified('metadata');
      return;
    }

    let emitted = 0;
    for (const token of tokens) {
      emitted += 1;
      const progress = Math.round((emitted / totalTokens) * 100);

      this.emit(jobId, 'token', { token });
      this.emit(jobId, 'progress', { progress });

      // Simulate streaming cadence to allow SSE clients to process tokens.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    jobDoc.tokensGenerated = usage?.completionTokens ?? totalTokens;
    jobDoc.progress = 100;
    const metadata = {
      ...(jobDoc.metadata || {}),
      tokenCount: usage?.completionTokens ?? totalTokens,
      contentLength: content ? content.length : 0,
    };
    if (usage) {
      metadata.usage = usage;
    }
    jobDoc.metadata = metadata;
    jobDoc.markModified('metadata');
  }

  #tokenise(content) {
    return content.split(/\s+/).filter((token) => token.length > 0);
  }

  #mergeProjectContext(project, outlineNodes, memory, styleProfile, synopsis) {
    const sanitisedStyle =
      styleProfile && typeof styleProfile === 'object' ? styleProfile : {};
    const currentStyle = project.styleProfile
      ? typeof project.styleProfile.toObject === 'function'
        ? project.styleProfile.toObject()
        : { ...project.styleProfile }
      : {};

    const mergedStyle =
      Object.keys(sanitisedStyle).length > 0
        ? { ...currentStyle, ...sanitisedStyle }
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

  #summariseText(text, maxLength = 480) {
    if (!text) {
      return '';
    }
    const normalised = text.replace(/\s+/g, ' ').trim();
    return normalised.length > maxLength
      ? `${normalised.slice(0, maxLength - 3)}...`
      : normalised;
  }
}

module.exports = GenerationService;
