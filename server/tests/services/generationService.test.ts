import { EventEmitter } from 'events';
import { Response } from 'express';
import { Types } from 'mongoose';
import GenerationService from '../../src/services/generationService';
import { StreamChapterOptions, StreamChapterResult, UsageRecord } from '../../src/services/openai';
import ProjectModel from '../../src/models/Project';
import OutlineNodeModel from '../../src/models/OutlineNode';
import GenJobModel, { GenerationJob } from '../../src/models/GenJob';

const mongo = require('../helpers/mongo');

class StubOpenAIService {
  private readonly content: string;

  private readonly usage?: UsageRecord;

  private readonly delayMs: number;

  private readonly errorOnAbort: boolean;

  constructor({ content, usage, delayMs = 10, errorOnAbort = true }: {
    content: string;
    usage?: UsageRecord;
    delayMs?: number;
    errorOnAbort?: boolean;
  }) {
    this.content = content;
    this.usage = usage;
    this.delayMs = delayMs;
    this.errorOnAbort = errorOnAbort;
  }

  streamChapter(options: StreamChapterOptions): Promise<StreamChapterResult> {
    return new Promise((resolve, reject) => {
      let aborted = false;
      const abortHandler = () => {
        aborted = true;
        if (this.errorOnAbort) {
          reject(new Error('openai request aborted'));
        }
      };

      options.signal?.addEventListener('abort', abortHandler, { once: true });

      setTimeout(() => {
        if (aborted) {
          return;
        }
        options.onDelta?.(this.content);
        resolve({
          content: this.content,
          usage: this.usage,
          model: options.model ?? 'gpt-4o-mini',
          keyDocId: new Types.ObjectId(),
          requestId: 'req-test',
        });
      }, this.delayMs);
    });
  }
}

class MockSseResponse extends EventEmitter {
  public headers: Record<string, string> = {};

  public chunks: string[] = [];

  public writableEnded = false;

  public statusCode = 200;

  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  flushHeaders(): void {
    // no-op for tests
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(): void {
    this.writableEnded = true;
    this.emit('close');
  }

  triggerClose(): void {
    this.emit('close');
  }
}

async function waitForJobStatus(jobId: string, status: GenerationJob['status'], timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await GenJobModel.findById(jobId).lean<GenerationJob & { _id: Types.ObjectId }>();
    if (job && job.status === status) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for job ${jobId} to reach status ${status}`);
}

describe('GenerationService streaming lifecycle', () => {
  beforeAll(async () => {
    await mongo.connect();
  });

  afterEach(async () => {
    await mongo.clearDatabase();
  });

  afterAll(async () => {
    await mongo.disconnect();
  });

  it('marks a job as failed with error details when the client disconnects mid-stream', async () => {
    const project = await ProjectModel.create({ name: 'Test Project', outlineNodes: [] });
    await OutlineNodeModel.create({
      project: project._id,
      nodeId: 'outline-node-1',
      title: 'Outline Node',
      summary: 'Summary',
      order: 1,
    });

    const openAI = new StubOpenAIService({ content: 'Partial content', delayMs: 80 });
    const service = new GenerationService({ openAIService: openAI as unknown as any });

    const job = await service.createChapterGenerationJob(project._id.toString(), {
      outlineNodeId: 'outline-node-1',
      model: 'gpt-4o-mini',
    });

    const mockResponse = new MockSseResponse();
    service.registerStream(job.id, mockResponse as unknown as Response);

    await new Promise((resolve) => setTimeout(resolve, 20));

    mockResponse.triggerClose();

    const failedJob = await waitForJobStatus(job.id, 'failed');

    expect(failedJob.error?.message).toBe('Client disconnected from stream');
    expect(failedJob.completedAt).toBeDefined();
    expect(mockResponse.writableEnded).toBe(true);
  });

  it('records usage metrics and cost when a job completes successfully', async () => {
    process.env.OPENAI_COST_PER_1K_TOKENS = '0.02';

    const project = await ProjectModel.create({ name: 'Metrics Project', outlineNodes: [] });
    await OutlineNodeModel.create({
      project: project._id,
      nodeId: 'outline-node-2',
      title: 'Metrics Node',
      summary: 'Summary',
      order: 1,
    });

    const usage: UsageRecord = {
      promptTokens: 120,
      completionTokens: 220,
      totalTokens: 340,
    };

    const openAI = new StubOpenAIService({ content: 'Final content output.', usage, delayMs: 10 });
    const service = new GenerationService({ openAIService: openAI as unknown as any });

    const job = await service.createChapterGenerationJob(project._id.toString(), {
      outlineNodeId: 'outline-node-2',
      model: 'gpt-4o-mini',
    });

    const completedJob = await waitForJobStatus(job.id, 'completed');

    expect(completedJob.status).toBe('completed');
    expect(completedJob.promptTokens).toBe(usage.promptTokens);
    expect(completedJob.completionTokens).toBe(usage.completionTokens);
    expect(completedJob.tokensGenerated).toBe(usage.completionTokens);
    expect(completedJob.cost).toBeCloseTo(0.0068, 5);
    expect(completedJob.model).toBe('gpt-4o-mini');
    expect(completedJob.error).toBeNull();
  });
});
