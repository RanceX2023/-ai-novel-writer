process.env.OPENAI_KEY_SECRET = process.env.OPENAI_KEY_SECRET || 'unit-test-secret';
process.env.OPENAI_DEFAULT_MODEL = process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini';

jest.setTimeout(30000);
