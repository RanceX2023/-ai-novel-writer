const OpenAIKeyManager = require('../src/services/openai/apiKeyManager');
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

describe('OpenAIKeyManager', () => {
  test('stores encrypted key and retrieves decrypted value', async () => {
    const manager = new OpenAIKeyManager({ model: OpenAIApiKey, encryptionSecret: 'unit-test-secret' });

    await manager.addKey({ alias: 'primary', apiKey: 'sk-test-123', metadata: { owner: 'tests' } });

    const { keyDoc, apiKey } = await manager.getKeyForUse();
    expect(apiKey).toBe('sk-test-123');
    expect(keyDoc.alias).toBe('primary');
    expect(keyDoc.encryptedKey).not.toBe('sk-test-123');

    await manager.markUsage(keyDoc, { tokens: 128 });

    const updated = await OpenAIApiKey.findById(keyDoc._id).lean();
    expect(updated.usageCount).toBe(1);
    expect(updated.totalTokens).toBe(128);
    expect(updated.lastUsedAt).toBeTruthy();
  });

  test('throws when no keys available', async () => {
    const manager = new OpenAIKeyManager({ model: OpenAIApiKey, encryptionSecret: 'unit-test-secret' });
    await expect(manager.getKeyForUse()).rejects.toThrow('No OpenAI API keys are configured');
  });
});
