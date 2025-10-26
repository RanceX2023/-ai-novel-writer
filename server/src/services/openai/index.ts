import { Model, Types } from 'mongoose';
import { OpenAI } from 'openai';
import ApiError from '../../utils/ApiError';
import OpenAIUsageModel, { OpenAIUsage } from '../../models/OpenAIUsage';
import { OpenAIApiKeyDocument } from '../../models/OpenAIApiKey';
import OpenAIKeyManager from './apiKeyManager';
import OpenAIRateLimiter from './rateLimiter';
import { buildChapterPrompt, ChapterPromptOptions } from '../../utils/promptTemplates';
import { appConfig } from '../../config/appConfig';

export interface UsageRecord {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StreamChapterOptions extends ChapterPromptOptions {
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  onRequestId?: (requestId: string) => void;
}

export interface StreamChapterResult {
  content: string;
  usage?: UsageRecord;
  model: string;
  requestId?: string;
  keyDocId: Types.ObjectId;
}

export interface MemoryExtractionOptions {
  projectTitle: string;
  synopsis?: string;
  chapterTitle?: string;
  chapterOrder?: number;
  chapterContent: string;
}

export interface MemoryExtractionResult {
  content: string;
  usage?: UsageRecord;
  model: string;
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

interface ChatCompletionResponseChoice {
  message?: {
    content?: string | null;
  };
  finish_reason?: string | null;
}

interface ChatCompletionResponse {
  id?: string;
  choices?: ChatCompletionResponseChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export type ChatCompletionStream = AsyncIterable<ChatCompletionStreamChunk>;

type ChatCompletionResult = ChatCompletionStream | ChatCompletionResponse;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  maxTokens?: number;
  responseFormat?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  messages: ChatMessage[];
}

export interface ChatCompletionResultData {
  content: string;
  usage?: UsageRecord;
  model: string;
  keyDocId: Types.ObjectId;
  requestId?: string;
}

export interface OpenAIClient {
  chat: {
    completions: {
      create: (params: Record<string, unknown>) => Promise<ChatCompletionResult>;
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
  baseUrl?: string;
  allowRuntimeKeyOverride?: boolean;
}

export interface RequestContextOptions {
  runtimeApiKey?: string;
}

class OpenAIService {
  private keyManager: OpenAIKeyManager;

  private rateLimiter: OpenAIRateLimiter;

  private usageModel: Model<OpenAIUsage>;

  private clientFactory: ClientFactory;

  private baseUrl?: string;

  private defaultModel: string;

  private allowRuntimeKeyOverride: boolean;

  constructor({
    keyManager,
    rateLimiter,
    usageModel = OpenAIUsageModel,
    clientFactory,
    defaultModel,
    baseUrl,
    allowRuntimeKeyOverride,
  }: OpenAIServiceOptions = {}) {
    this.keyManager = keyManager || new OpenAIKeyManager();
    this.rateLimiter = rateLimiter || new OpenAIRateLimiter();
    this.usageModel = usageModel;
    this.baseUrl = baseUrl ?? appConfig.openai.baseUrl;
    this.defaultModel = defaultModel || appConfig.openai.defaultModel;
    this.allowRuntimeKeyOverride = allowRuntimeKeyOverride ?? appConfig.openai.allowRuntimeKeyOverride;
    this.clientFactory = clientFactory
      || ((apiKey: string) => {
        const options: Record<string, unknown> = { apiKey };
        if (this.baseUrl) {
          options.baseURL = this.baseUrl;
        }
        return new OpenAI(options) as unknown as OpenAIClient;
      });
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
    handler: (client: OpenAIClient, context: { keyDoc: OpenAIApiKeyDocument | null }) => Promise<T>,
    options: RequestContextOptions = {}
  ): Promise<T> {
    const overrideKey = options.runtimeApiKey?.trim();
    if (overrideKey) {
      if (!this.allowRuntimeKeyOverride) {
        throw new ApiError(400, 'Runtime OpenAI key overrides are disabled.');
      }
      const client = this.clientFactory(overrideKey);
      return this.executeWithClient(handler, client, null);
    }

    const { keyDoc, apiKey } = await this.keyManager.getKeyForUse();
    await this.rateLimiter.consume(keyDoc._id);

    const client = this.clientFactory(apiKey);
    return this.executeWithClient(handler, client, keyDoc);
  }

  private async executeWithClient<T>(
    handler: (client: OpenAIClient, context: { keyDoc: OpenAIApiKeyDocument | null }) => Promise<T>,
    client: OpenAIClient,
    keyDoc: OpenAIApiKeyDocument | null
  ): Promise<T> {
    try {
      return await handler(client, { keyDoc });
    } catch (error) {
      this.handleClientError(error);
    }
  }

  private handleClientError(error: unknown): never {
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

  async streamChapter(options: StreamChapterOptions, requestOptions: RequestContextOptions = {}): Promise<StreamChapterResult> {
    const prompt = buildChapterPrompt(options);
    const model = prompt.model || this.defaultModel;

    return this.withClient(async (client, { keyDoc }) => {
      const params: Record<string, unknown> = {
        model,
        messages: prompt.messages,
        temperature: prompt.temperature ?? 0.7,
        stream: true,
        signal: options.signal,
      };

      if (prompt.topP !== undefined) {
        params.top_p = prompt.topP;
      }
      if (prompt.presencePenalty !== undefined) {
        params.presence_penalty = prompt.presencePenalty;
      }
      if (prompt.maxTokens !== undefined) {
        params.max_tokens = prompt.maxTokens;
      }

      let usage: UsageRecord | undefined;
      let requestId: string | undefined;
      const buffer: string[] = [];

      const stream = (await client.chat.completions.create(params)) as ChatCompletionStream;

      for await (const chunk of stream) {
        if (!requestId && chunk.id) {
          requestId = chunk.id;
          if (requestId) {
            options.onRequestId?.(requestId);
          }
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

      if (usage && keyDoc) {
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
        keyDocId: keyDoc ? keyDoc._id : undefined,
      };
    }, requestOptions);
  }

  async completeChat(options: ChatCompletionOptions): Promise<ChatCompletionResultData> {
    const model = options.model || this.defaultModel;

    return this.withClient(async (client, keyDoc) => {
      const params: Record<string, unknown> = {
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
      };

      if (options.topP !== undefined) {
        params.top_p = options.topP;
      }
      if (options.presencePenalty !== undefined) {
        params.presence_penalty = options.presencePenalty;
      }
      if (options.frequencyPenalty !== undefined) {
        params.frequency_penalty = options.frequencyPenalty;
      }
      if (options.maxTokens !== undefined) {
        params.max_tokens = options.maxTokens;
      }
      if (options.responseFormat) {
        params.response_format = options.responseFormat;
      }
      if (options.metadata) {
        params.metadata = options.metadata;
      }

      const response = (await client.chat.completions.create(params)) as ChatCompletionResponse;
      const content = response.choices?.[0]?.message?.content ?? '';
      const usage = this.normaliseUsage(response.usage);
      const requestId = response.id;

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
              type: 'chat_completion',
              ...(options.metadata ?? {}),
            },
          }),
        ]);
      }

      return {
        content,
        usage,
        model,
        keyDocId: keyDoc._id,
        requestId,
      };
    });
  }

  async extractMemory(options: MemoryExtractionOptions): Promise<MemoryExtractionResult> {
    const model = process.env.OPENAI_MEMORY_MODEL || process.env.OPENAI_DEFAULT_MODEL || this.defaultModel;
    const messages = this.buildMemoryExtractionMessages(options);

    return this.withClient(async (client, keyDoc) => {
      const params = {
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages,
      } as Record<string, unknown>;

      const response = (await client.chat.completions.create(params)) as ChatCompletionResponse;
      const content = response.choices?.[0]?.message?.content ?? '{}';
      const usage = this.normaliseUsage(response.usage);

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
            metadata: {
              type: 'memory_extraction',
              projectTitle: options.projectTitle,
              chapterTitle: options.chapterTitle,
            },
          }),
        ]);
      }

      return {
        content,
        usage,
        model,
        keyDocId: keyDoc._id,
      };
    });
  }

  private buildMemoryExtractionMessages(options: MemoryExtractionOptions): Array<{
    role: 'system' | 'user';
    content: string;
  }> {
    const synopsisLine = options.synopsis ? `故事梗概：${options.synopsis}` : '故事梗概：无。';
    const chapterTitle = options.chapterTitle ? `章节标题：${options.chapterTitle}` : '章节标题：未命名章节。';
    const orderLine = options.chapterOrder ? `章节顺序：第${options.chapterOrder}章。` : '';
    const chapterBody = this.truncateForExtraction(options.chapterContent);

    const userContent = [
      `项目名称：《${options.projectTitle || '未命名项目'}》。`,
      synopsisLine,
      chapterTitle,
      orderLine,
      '章节正文：',
      '"""',
      chapterBody,
      '"""',
      '',
      '提取准则：只保留正文中可验证的事实或设定，忽略作者评论、情绪与主观猜测。',
      '请从正文中提取最多 12 条记忆项，并严格输出以下 JSON 结构：',
      '{',
      '  "items": [',
      '    {',
      '      "type": "world|fact|prior_summary|taboo",',
      '      "key": "不超过20个汉字的标题",',
      '      "content": "不超过120个汉字的描述",',
      '      "weight": 0.4-0.9之间的小数,',
      '      "category": "new_fact|character_update|unresolved_thread|contradiction|summary",',
      '      "refs": [ { "chapterId": "章节ID或留空", "label": "可选来源说明" } ],',
      '      "characterIds": ["可选的角色ID"],',
      '      "characterStateChange": "人物状态或关系变化（选填）",',
      '      "worldRuleChange": "世界规则或设定变更（选填）",',
      '      "updatedAt": "可选 ISO 时间，例如 \"2024-05-12T10:30:00Z\"",',
      '      "metadata": { "notes": "可选附加信息" }',
      '    }',
      '  ]',
      '}',
      '',
      '约束：',
      '- 仅提取正文中可验证的事实、设定或禁忌，不要加入主观评价、推测或情绪化字句；',
      '- 至少输出一条 type 为 prior_summary 的章节概要，其 category 设为 "summary"；',
      '- 角色或世界观的变化使用 type "world"，必要时填写 characterIds 与 characterStateChange；',
      '- 新的剧情事实或伏笔使用 type "fact"，未解决的问题请标记 category "unresolved_thread"；',
      '- 矛盾或需要避免的事项使用 type "taboo"，category 设为 "contradiction"，如涉及规则调整请写入 worldRuleChange；',
      '- refs 至少提供 chapterId 或 label 之一，chapterId 留空时需用 label 简要说明来源；',
      '- key 保持精简唯一，content 不得超过 120 个汉字，weight 介于 0.4 与 0.9；',
      '- characterIds 须为已存在的角色 ID，未知时可省略该字段；',
      '- 若没有合适的 refs、characterIds、characterStateChange、worldRuleChange 或 metadata，可省略或使用空数组/空字符串；',
      '- 输出中仅包含 JSON 对象，不要添加额外解释。',
    ]
      .filter(Boolean)
      .join('\n');

    return [
      {
        role: 'system',
        content:
          '你是一名严谨的中文长篇小说记忆管理员。你的任务是从章节文本中提炼关键事实、设定与禁忌，'
          + '并保持世界观、人物与剧情的一致性。输出必须是结构化 JSON，确保信息准确、简洁、可用于后续提示；'
          + '不得加入任何主观评价或推测。',
      },
      {
        role: 'user',
        content: userContent,
      },
    ];
  }

  private truncateForExtraction(text: string, limit = 6000): string {
    const normalised = text.replace(/[\u0000-\u001f]+/g, '');
    if (normalised.length <= limit) {
      return normalised;
    }
    return `${normalised.slice(0, limit - 1)}…`;
  }
}

export default OpenAIService;
