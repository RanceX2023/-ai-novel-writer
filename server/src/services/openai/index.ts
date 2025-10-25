import { Model, Types } from 'mongoose';
import { OpenAI } from 'openai';
import ApiError from '../../utils/ApiError';
import OpenAIUsageModel, { OpenAIUsage } from '../../models/OpenAIUsage';
import { OpenAIApiKeyDocument } from '../../models/OpenAIApiKey';
import OpenAIKeyManager from './apiKeyManager';
import OpenAIRateLimiter from './rateLimiter';
import { buildChapterPrompt, ChapterPromptOptions } from '../../utils/promptTemplates';

export interface UsageRecord {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StreamChapterOptions extends ChapterPromptOptions {
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}

export interface StreamChapterResult {
  content: string;
  usage?: UsageRecord;
  model: string;
  requestId?: string;
  keyDocId: Types.ObjectId;
}

type ChatCompletionStreamChunk = {
  id?: string;
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export type ChatCompletionStream = AsyncIterable<ChatCompletionStreamChunk>;

export interface OpenAIClient {
  chat: {
    completions: {
      create: (params: Record<string, unknown>) => Promise<ChatCompletionStream>;
    };
  };
}

export type ClientFactory = (apiKey: string) => OpenAIClient;

export interface OpenAIServiceOptions {
  keyManager?: OpenAIKeyManager;
  rateLimiter?: OpenAIRateLimiter;
  usageModel?: Model<OpenAIUsage>;
  clientFactory?: ClientFactory;
  defaultModel?: string;
}

class OpenAIService {
  private keyManager: OpenAIKeyManager;

  private rateLimiter: OpenAIRateLimiter;

  private usageModel: Model<OpenAIUsage>;

  private clientFactory: ClientFactory;

  private defaultModel: string;

  constructor({
    keyManager,
    rateLimiter,
    usageModel = OpenAIUsageModel,
    clientFactory,
    defaultModel,
  }: OpenAIServiceOptions = {}) {
    this.keyManager = keyManager || new OpenAIKeyManager();
    this.rateLimiter = rateLimiter || new OpenAIRateLimiter();
    this.usageModel = usageModel;
    this.clientFactory = clientFactory || ((apiKey: string) => new OpenAI({ apiKey }) as unknown as OpenAIClient);
    this.defaultModel = defaultModel || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini';
  }

  private normaliseUsage(usage?: ChatCompletionStreamChunk['usage']): UsageRecord | undefined {
    if (!usage) {
      return undefined;
    }
    return {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
    };
  }

  private async withClient<T>(
    handler: (client: OpenAIClient, keyDoc: OpenAIApiKeyDocument) => Promise<T>
  ): Promise<T> {
    const { keyDoc, apiKey } = await this.keyManager.getKeyForUse();
    await this.rateLimiter.consume(keyDoc._id);

    const client = this.clientFactory(apiKey);
    try {
      const result = await handler(client, keyDoc);
      return result;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if ((error as Error & { name?: string }).name === 'AbortError') {
          throw new ApiError(499, 'OpenAI streaming request aborted by client.');
        }

        const status = (error as Error & { status?: number; statusCode?: number }).status
          ?? (error as Error & { status?: number; statusCode?: number }).statusCode
          ?? 500;
        const message = error.message || 'OpenAI request failed';

        if (status === 429) {
          throw new ApiError(429, 'Upstream OpenAI rate limit reached, please retry later.');
        }

        throw new ApiError(status, message);
      }

      throw new ApiError(500, 'Unknown error during OpenAI request');
    }
  }

  async streamChapter(options: StreamChapterOptions): Promise<StreamChapterResult> {
    const prompt = buildChapterPrompt(options);
    const model = prompt.model || this.defaultModel;

    return this.withClient(async (client, keyDoc) => {
      const params = {
        ...prompt,
        model,
        stream: true,
        signal: options.signal,
      } as Record<string, unknown>;

      let usage: UsageRecord | undefined;
      let requestId: string | undefined;
      const buffer: string[] = [];

      const stream = await client.chat.completions.create(params);

      for await (const chunk of stream) {
        if (!requestId && chunk.id) {
          requestId = chunk.id;
        }

        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          buffer.push(delta);
          options.onDelta?.(delta);
        }

        if (chunk.usage) {
          usage = this.normaliseUsage(chunk.usage);
        }
      }

      if (usage) {
        await Promise.all([
          this.keyManager.markUsage(keyDoc, {
            tokens: usage.totalTokens,
          }),
          this.usageModel.create({
            apiKey: keyDoc._id,
            model,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            requestId,
            metadata: {
              type: options.continuation ? 'chapter_continuation' : 'chapter_generation',
              projectTitle: options.projectTitle,
              chapterTitle: options.chapterTitle,
            },
          }),
        ]);
      }

      return {
        content: buffer.join(''),
        usage,
        model,
        requestId,
        keyDocId: keyDoc._id,
      };
    });
  }
}

export default OpenAIService;
