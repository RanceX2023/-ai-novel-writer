const OpenAIRateLimiter = require('../src/services/openai/rateLimiter');
const OpenAIKeyManager = require('../src/services/openai/apiKeyManager');
const OpenAIRateLimit = require('../src/models/OpenAIRateLimit');
const OpenAIApiKey = require('../src/models/OpenAIApiKey');
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

describe('OpenAIRateLimiter', () => {
  test('enforces sliding window limits', async () => {
    const manager = new OpenAIKeyManager({ model: OpenAIApiKey, encryptionSecret: 'unit-test-secret' });
    const keyDoc = await manager.addKey({ alias: 'primary', apiKey: 'sk-test' });
    const limiter = new OpenAIRateLimiter({
      model: OpenAIRateLimit,
      limitPerWindow: 2,
      windowMs: 1000,
    });

    await expect(limiter.consume(keyDoc._id)).resolves.toBeDefined();
    await expect(limiter.consume(keyDoc._id)).resolves.toBeDefined();
    await expect(limiter.consume(keyDoc._id)).rejects.toThrow(/OpenAI rate limit exceeded/);

    await limiter.reset(keyDoc._id);
    await expect(limiter.consume(keyDoc._id)).resolves.toBeDefined();
  });
});
