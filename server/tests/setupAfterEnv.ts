process.env.OPENAI_KEY_SECRET = process.env.OPENAI_KEY_SECRET || 'unit-test-secret';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-123';
process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini';
process.env.OPENAI_DEFAULT_MODEL = process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini';
process.env.OPENAI_ALLOWED_MODELS = process.env.OPENAI_ALLOWED_MODELS || 'gpt-4o-mini';
process.env.GENERATION_RATE_LIMIT_MAX = process.env.GENERATION_RATE_LIMIT_MAX || '1';
process.env.GENERATION_RATE_LIMIT_WINDOW_MS = process.env.GENERATION_RATE_LIMIT_WINDOW_MS || '1000';

jest.setTimeout(30000);
