import { z } from 'zod';

const booleanStrings = new Map<unknown, boolean>([
  [true, true],
  [false, false],
  ['true', true],
  ['false', false],
  ['1', true],
  ['0', false],
  ['yes', true],
  ['no', false],
  ['y', true],
  ['n', false],
  ['on', true],
  ['off', false],
]);

function parseBoolean(value: unknown, field: string): boolean {
  if (value === undefined || value === null || value === '') {
    return false;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return false;
  }
  const normalised = typeof value === 'string' ? value.trim().toLowerCase() : value;
  if (booleanStrings.has(normalised)) {
    return Boolean(booleanStrings.get(normalised));
  }
  throw new Error(`${field} must be a boolean-like value (true/false)`);
}

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.union([z.string(), z.number()]).optional(),
  OPENAI_API_KEY: z.string().trim().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_MODEL: z.string().trim().min(1).optional(),
  OPENAI_DEFAULT_MODEL: z.string().trim().min(1).optional(),
  OPENAI_ALLOWED_MODELS: z.string().optional(),
  OPENAI_BASE_URL: z
    .preprocess((value) => {
      if (typeof value !== 'string') {
        return value;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }, z.string().url('OPENAI_BASE_URL must be a valid URL'))
    .optional(),
  ALLOW_RUNTIME_KEY_OVERRIDE: z.union([z.string(), z.boolean(), z.number()]).optional(),
});

type EnvShape = z.infer<typeof envSchema>;

function parsePort(raw: EnvShape['PORT']): number {
  if (raw === undefined || raw === null || raw === '') {
    return 3001;
  }
  const numeric = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 65535) {
    throw new Error('PORT must be a valid integer between 1 and 65535');
  }
  return Math.floor(numeric);
}

function parseAllowedModels(raw: string | undefined, defaultModel: string): string[] {
  const items = raw
    ? raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  if (!items.includes(defaultModel)) {
    items.push(defaultModel);
  }

  return Array.from(new Set(items));
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

const env = parsed.data;

const port = parsePort(env.PORT);
const allowRuntimeKeyOverride = parseBoolean(env.ALLOW_RUNTIME_KEY_OVERRIDE, 'ALLOW_RUNTIME_KEY_OVERRIDE');
const defaultModelSource = env.OPENAI_MODEL ?? env.OPENAI_DEFAULT_MODEL ?? 'gpt-4o-mini';
const defaultModel = defaultModelSource.trim();
if (!defaultModel) {
  throw new Error('Default OpenAI model must not be empty');
}
const allowedModels = parseAllowedModels(env.OPENAI_ALLOWED_MODELS, defaultModel);

export const appConfig = {
  environment: env.NODE_ENV ?? 'development',
  server: {
    port,
  },
  openai: {
    apiKey: env.OPENAI_API_KEY,
    defaultModel,
    allowedModels,
    baseUrl: env.OPENAI_BASE_URL,
    allowRuntimeKeyOverride,
  },
} as const;

export type AppConfig = typeof appConfig;

export type OpenAIConfig = AppConfig['openai'];
