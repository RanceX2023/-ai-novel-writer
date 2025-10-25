const { OpenAI } = require('openai');
const ApiError = require('../../utils/ApiError');
const OpenAIUsage = require('../../models/OpenAIUsage');
const OpenAIKeyManager = require('./apiKeyManager');
const OpenAIRateLimiter = require('./rateLimiter');
const {
  buildOutlinePrompt,
  buildCharacterPrompt,
  buildChapterPrompt,
  buildRewritePrompt,
} = require('../../utils/promptTemplates');

class OpenAIService {
  constructor({
    keyManager,
    rateLimiter,
    usageModel = OpenAIUsage,
    clientFactory,
    defaultModel,
  } = {}) {
    this.keyManager = keyManager || new OpenAIKeyManager();
    this.rateLimiter = rateLimiter || new OpenAIRateLimiter();
    this.usageModel = usageModel;
    this.clientFactory =
      clientFactory || ((apiKey) => new OpenAI({ apiKey }));
    this.defaultModel = defaultModel || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini';
  }

  async #withClient(handler) {
    const { keyDoc, apiKey } = await this.keyManager.getKeyForUse();
    await this.rateLimiter.consume(keyDoc._id);

    const client = this.clientFactory(apiKey);
    try {
      const response = await handler(client, keyDoc);
      return { response, keyDoc };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      const status = error.status ?? error.statusCode ?? 500;
      const message = error.message || 'OpenAI request failed';

      if (status === 429) {
        throw new ApiError(429, 'Upstream OpenAI rate limit reached, please retry later.');
      }

      throw new ApiError(status, message);
    }
  }

  #normaliseUsage(usage) {
    if (!usage) {
      return undefined;
    }
    return {
      promptTokens: usage.prompt_tokens ?? usage.promptTokens ?? 0,
      completionTokens: usage.completion_tokens ?? usage.completionTokens ?? 0,
      totalTokens: usage.total_tokens ?? usage.totalTokens ?? 0,
    };
  }

  async #executeChat({ messages, model, temperature, maxTokens, metadata }) {
    const targetModel = model || this.defaultModel;

    const { response, keyDoc } = await this.#withClient((client) =>
      client.chat.completions.create({
        model: targetModel,
        messages,
        temperature,
        max_tokens: maxTokens,
      })
    );

    const choice = response?.choices?.[0]?.message?.content;
    if (!choice) {
      throw new ApiError(502, 'OpenAI returned an empty response message');
    }

    const usage = this.#normaliseUsage(response.usage);

    await Promise.all([
      this.keyManager.markUsage(keyDoc, { tokens: usage?.totalTokens }),
      this.usageModel.create({
        apiKey: keyDoc._id,
        model: targetModel,
        promptTokens: usage?.promptTokens ?? 0,
        completionTokens: usage?.completionTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
        requestId: response.id,
        metadata,
      }),
    ]);

    return {
      content: choice,
      usage,
      requestId: response.id,
      apiKey: keyDoc,
    };
  }

  async generateOutline(context) {
    const prompt = buildOutlinePrompt(context);
    return this.#executeChat({
      ...prompt,
      metadata: {
        type: 'outline',
        projectTitle: context.projectTitle,
      },
    });
  }

  async generateCharacterSheet(context) {
    const prompt = buildCharacterPrompt(context);
    return this.#executeChat({
      ...prompt,
      metadata: {
        type: 'character',
        characterName: context.characterName,
        projectTitle: context.projectTitle,
      },
    });
  }

  async generateChapter(context) {
    const prompt = buildChapterPrompt(context);
    return this.#executeChat({
      ...prompt,
      metadata: {
        type: context.continuation ? 'chapter_continuation' : 'chapter',
        chapterTitle: context.chapterTitle,
        projectTitle: context.projectTitle,
      },
    });
  }

  async rewriteSynopsis(context) {
    const prompt = buildRewritePrompt(context);
    return this.#executeChat({
      ...prompt,
      metadata: {
        type: 'rewrite',
        projectTitle: context.projectTitle,
      },
    });
  }
}

module.exports = OpenAIService;
