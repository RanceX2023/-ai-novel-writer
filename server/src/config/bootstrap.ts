import OpenAIApiKeyModel from '../models/OpenAIApiKey';
import OpenAIKeyManager from '../services/openai/apiKeyManager';

export async function initialiseOpenAIKeys(): Promise<void> {
  const secret = process.env.OPENAI_KEY_SECRET;
  if (!secret) {
    console.warn('[bootstrap] OPENAI_KEY_SECRET is not configured; skipping OpenAI API key initialisation.');
    return;
  }

  const rawApiKey = process.env.OPENAI_API_KEY?.trim();
  if (!rawApiKey) {
    return;
  }

  const alias = process.env.OPENAI_API_KEY_ALIAS?.trim() || 'default';

  const existing = await OpenAIApiKeyModel.findOne({ alias }).exec();
  if (existing) {
    console.log(`[bootstrap] OpenAI API key with alias "${alias}" already exists; skipping seeding.`);
    return;
  }

  try {
    const manager = new OpenAIKeyManager({ encryptionSecret: secret });
    await manager.addKey({ alias, apiKey: rawApiKey, metadata: { source: 'env' } });
    console.log(`[bootstrap] Stored OpenAI API key with alias "${alias}" from environment.`);
  } catch (error) {
    const duplicateKeyError =
      error && typeof error === 'object' && 'code' in error && (error as { code?: number }).code === 11000;
    if (duplicateKeyError) {
      console.log(`[bootstrap] OpenAI API key with alias "${alias}" already exists; skipping seeding.`);
      return;
    }

    console.error('[bootstrap] Failed to store OpenAI API key from environment', error);
  }
}
