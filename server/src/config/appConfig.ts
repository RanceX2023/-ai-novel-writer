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

function parseIntegerInRange(
  raw: unknown,
  field: string,
  { min, max, defaultValue }: { min: number; max: number; defaultValue: number }
): number {
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  const numeric = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(numeric)) {
    throw new Error(`${field} must be a finite number`);
  }
  const integer = Math.floor(numeric);
  if (integer < min || integer > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return integer;
}

function parseFloatInRange(
  raw: unknown,
  field: string,
  { min, max, defaultValue }: { min: number; max: number; defaultValue: number }
): number {
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  const numeric = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(numeric)) {
    throw new Error(`${field} must be a finite number`);
  }
  if (numeric < min || numeric > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return numeric;
}

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.union([z.string(), z.number()]).optional(),
  MONGO_URI: z.string().optional(),
  MONGODB_URI: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  OPENAI_DEFAULT_MODEL: z.string().optional(),
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
  SSE_HEARTBEAT_MS: z.union([z.string(), z.number()]).optional(),
  OPENAI_RATE_LIMIT_PER_MINUTE: z.union([z.string(), z.number()]).optional(),
  OPENAI_RATE_LIMIT_WINDOW_MS: z.union([z.string(), z.number()]).optional(),
  GENERATION_MAX_CHARS: z.union([z.string(), z.number()]).optional(),
  STYLE_STRENGTH_MAX: z.union([z.string(), z.number()]).optional(),
  MASTER_KEY: z.string().optional(),
  OPENAI_COST_PER_1K_TOKENS: z.union([z.string(), z.number()]).optional(),
  OPENAI_KEY_SECRET: z.string().optional(),
});

type EnvShape = z.infer<typeof envSchema>;

function parsePort(raw: EnvShape['PORT']): number {
  return parseIntegerInRange(raw, 'PORT', { min: 1, max: 65535, defaultValue: 3001 });
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
const environment = env.NODE_ENV?.trim() || 'development';
const mongoUri = env.MONGODB_URI?.trim() || env.MONGO_URI?.trim() || 'mongodb://localhost:27017/ai_novel_writer';
const allowRuntimeKeyOverride = parseBoolean(env.ALLOW_RUNTIME_KEY_OVERRIDE, 'ALLOW_RUNTIME_KEY_OVERRIDE');
const defaultModelSource = env.OPENAI_MODEL ?? env.OPENAI_DEFAULT_MODEL ?? 'gpt-4o-mini';
const resolvedDefaultModel = defaultModelSource.trim() || 'gpt-4o-mini';
const allowedModels = parseAllowedModels(env.OPENAI_ALLOWED_MODELS, resolvedDefaultModel);
const sseHeartbeatMs = parseIntegerInRange(env.SSE_HEARTBEAT_MS, 'SSE_HEARTBEAT_MS', {
  min: 1000,
  max: 60000,
  defaultValue: 15000,
});
const rateLimitMax = parseIntegerInRange(env.OPENAI_RATE_LIMIT_PER_MINUTE, 'OPENAI_RATE_LIMIT_PER_MINUTE', {
  min: 1,
  max: 10000,
  defaultValue: 60,
});
const rateLimitWindowMs = parseIntegerInRange(env.OPENAI_RATE_LIMIT_WINDOW_MS, 'OPENAI_RATE_LIMIT_WINDOW_MS', {
  min: 1000,
  max: 3_600_000,
  defaultValue: 60000,
});
const generationMaxChars = parseIntegerInRange(env.GENERATION_MAX_CHARS, 'GENERATION_MAX_CHARS', {
  min: 500,
  max: 200000,
  defaultValue: 5000,
});
const styleStrengthMax = parseFloatInRange(env.STYLE_STRENGTH_MAX, 'STYLE_STRENGTH_MAX', {
  min: 0,
  max: 1,
  defaultValue: 1,
});
const costPer1KTokens = parseFloatInRange(env.OPENAI_COST_PER_1K_TOKENS, 'OPENAI_COST_PER_1K_TOKENS', {
  min: 0,
  max: Number.MAX_SAFE_INTEGER,
  defaultValue: 0,
});

const masterKey = env.MASTER_KEY?.trim() || undefined;
const encryptionSecret = env.OPENAI_KEY_SECRET?.trim() || masterKey;
const apiKey = env.OPENAI_API_KEY?.trim() || undefined;
const baseUrl = env.OPENAI_BASE_URL;

export const appConfig = {
  environment,
  server: {
    port,
  },
  mongo: {
    uri: mongoUri,
  },
  openai: {
    apiKey,
    defaultModel: resolvedDefaultModel,
    allowedModels,
    baseUrl,
    allowRuntimeKeyOverride,
  },
  runtimeDefaults: {
    sseHeartbeatMs,
    rateLimit: {
      windowMs: rateLimitWindowMs,
      max: rateLimitMax,
    },
    generation: {
      maxChars: generationMaxChars,
      styleStrengthMax,
    },
  },
  security: {
    masterKey,
    encryptionSecret,
  },
  metrics: {
    costPer1KTokens,
  },
} as const;

export type AppConfig = typeof appConfig;

export type OpenAIConfig = AppConfig['openai'];
