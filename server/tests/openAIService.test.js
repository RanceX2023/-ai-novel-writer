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
});
