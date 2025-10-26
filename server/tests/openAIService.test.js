const OpenAIService = require('../src/services/openai');
const OpenAIKeyManager = require('../src/services/openai/apiKeyManager');
const OpenAIRateLimiter = require('../src/services/openai/rateLimiter');
const OpenAIApiKey = require('../src/models/OpenAIApiKey');
const OpenAIRateLimit = require('../src/models/OpenAIRateLimit');
const OpenAIUsage = require('../src/models/OpenAIUsage');
const { connect, disconnect, clearDatabase } = require('./helpers/mongo');

beforeAll(async () => {
  await connect();
});

afterEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await disconnect();
});

describe('OpenAIService', () => {
  test('generates chapter content and records usage metadata', async () => {
    const manager = new OpenAIKeyManager({ model: OpenAIApiKey, encryptionSecret: 'unit-test-secret' });
    const keyDoc = await manager.addKey({ alias: 'primary', apiKey: 'sk-test-abc' });

    const createMock = jest.fn().mockResolvedValue({
      id: 'chatcmpl-test',
      choices: [
        {
          message: {
            content: '## Chapter Draft\n\nThe story unfolds among the stars.',
          },
        },
      ],
      usage: {
        prompt_tokens: 32,
        completion_tokens: 256,
        total_tokens: 288,
      },
    });

    const clientFactory = jest.fn((apiKey) => {
      expect(apiKey).toBe('sk-test-abc');
      return {
        chat: {
          completions: {
            create: createMock,
          },
        },
      };
    });

    const service = new OpenAIService({
      keyManager: manager,
      rateLimiter: new OpenAIRateLimiter({
        model: OpenAIRateLimit,
        limitPerWindow: 5,
        windowMs: 1000,
      }),
      usageModel: OpenAIUsage,
      clientFactory,
      defaultModel: 'gpt-test-model',
    });

    const result = await service.generateChapter({
      projectTitle: 'Starfall Chronicles',
      synopsis: 'A rebellion ignites among the constellations.',
      chapterTitle: 'Chapter 1: Embers',
      outlineNodes: [{ title: 'Inciting Incident', summary: 'A distress signal is received.' }],
      memoryBank: [{ label: 'Vow', content: 'Protect the outer colonies at all costs.' }],
      styleProfile: { tone: 'urgent' },
    });

    expect(result.content).toContain('Chapter Draft');
    expect(result.usage.totalTokens).toBe(288);
    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-test-model',
        temperature: expect.any(Number),
        messages: expect.any(Array),
      })
    );

    const usageEntry = await OpenAIUsage.findOne({ apiKey: keyDoc._id }).lean();
    expect(usageEntry).toBeTruthy();
    expect(usageEntry.totalTokens).toBe(288);
    expect(usageEntry.metadata.type).toBe('chapter');

    const updatedKey = await OpenAIApiKey.findById(keyDoc._id).lean();
    expect(updatedKey.usageCount).toBe(1);
    expect(updatedKey.totalTokens).toBe(288);
  });

  test('rejects runtime override when disabled', async () => {
    const service = new OpenAIService({ allowRuntimeKeyOverride: false });

    await expect(
      service.completeChat(
        {
          messages: [{ role: 'user', content: 'ping' }],
        },
        { runtimeApiKey: 'sk-disabled' }
      )
    ).rejects.toThrow('Runtime OpenAI key overrides are disabled.');
  });

  test('uses runtime API key override when enabled', async () => {
    const manager = {
      getKeyForUse: jest.fn(),
      markUsage: jest.fn().mockResolvedValue(undefined),
    };

    const createMock = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: 'runtime override response',
          },
        },
      ],
    });

    const clientFactory = jest.fn((apiKey) => {
      expect(apiKey).toBe('sk-runtime-override');
      return {
        chat: {
          completions: {
            create: createMock,
          },
        },
      };
    });

    const usageModel = { create: jest.fn().mockResolvedValue(undefined) };

    const service = new OpenAIService({
      keyManager: manager,
      usageModel,
      clientFactory,
      allowRuntimeKeyOverride: true,
      defaultModel: 'gpt-test-model',
    });

    const result = await service.completeChat(
      {
        messages: [
          { role: 'user', content: 'hello?' },
        ],
      },
      { runtimeApiKey: 'sk-runtime-override' }
    );

    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(manager.getKeyForUse).not.toHaveBeenCalled();
    expect(manager.markUsage).not.toHaveBeenCalled();
    expect(usageModel.create).not.toHaveBeenCalled();
    expect(result.content).toBe('runtime override response');
    expect(result.keyDocId).toBeUndefined();
  });

  test('performs connectivity test without recording usage', async () => {
    const manager = new OpenAIKeyManager({ model: OpenAIApiKey, encryptionSecret: 'unit-test-secret' });
    const keyDoc = await manager.addKey({ alias: 'connectivity', apiKey: 'sk-test-conn' });
    const markUsageSpy = jest.spyOn(manager, 'markUsage');

    const rateLimiter = {
      consume: jest.fn().mockResolvedValue(undefined),
    };

    const createMock = jest.fn().mockResolvedValue({
      id: 'chatcmpl-conn',
      model: 'gpt-verify',
    });

    const clientFactory = jest.fn((apiKey) => {
      expect(apiKey).toBe('sk-test-conn');
      return {
        chat: {
          completions: {
            create: createMock,
          },
        },
      };
    });

    const service = new OpenAIService({
      keyManager: manager,
      rateLimiter,
      clientFactory,
      defaultModel: 'gpt-verify',
    });

    const result = await service.testConnection();

    expect(result.model).toBe('gpt-verify');
    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-verify',
        max_tokens: 1,
        temperature: 0,
      })
    );
    expect(rateLimiter.consume).toHaveBeenCalledWith(keyDoc._id);
    expect(markUsageSpy).not.toHaveBeenCalled();
    expect(await OpenAIUsage.countDocuments()).toBe(0);

    markUsageSpy.mockRestore();
  });
});
