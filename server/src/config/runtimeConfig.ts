import EventEmitter from 'events';
import { z } from 'zod';
import RuntimeConfigModel from '../models/RuntimeConfig';
import baseLogger from '../utils/logger';
import { appConfig } from './appConfig';

interface StoredRuntimeConfig {
  defaultModel: string;
  allowedModels: string[];
  sseHeartbeatMs: number;
  rateLimit: {
    windowMs: number;
    max: number;
  };
  generation: {
    maxChars: number;
    styleStrengthMax: number;
  };
  desiredPort?: number;
  allowRuntimeKeyOverride: boolean;
  allowSecretPersistence: boolean;
  openaiBaseUrl?: string;
}

export interface EffectiveRuntimeConfig {
  defaultModel: string;
  allowedModels: string[];
  availableModels: string[];
  sseHeartbeatMs: number;
  rateLimit: {
    windowMs: number;
    max: number;
  };
  generation: {
    maxChars: number;
    styleStrengthMax: number;
  };
  desiredPort?: number;
  allowRuntimeKeyOverride: boolean;
  allowSecretPersistence: boolean;
  secretPersistenceEnabled: boolean;
  masterKeyConfigured: boolean;
  port: number;
  openaiBaseUrl?: string;
  models: string[];
}

export interface RuntimeConfigUpdateInput {
  defaultModel?: string;
  allowedModels?: string[];
  sseHeartbeatMs?: number;
  rateLimit?: {
    windowMs?: number;
    max?: number;
  };
  generation?: {
    maxChars?: number;
    styleStrengthMax?: number;
  };
  desiredPort?: number | null;
  allowRuntimeKeyOverride?: boolean;
  allowSecretPersistence?: boolean;
  openaiBaseUrl?: string | null;
}

const storedConfigSchema = z.object({
  defaultModel: z.string().trim().min(1).max(120),
  allowedModels: z.array(z.string().trim().min(1).max(120)).min(1).max(64),
  sseHeartbeatMs: z.number().int().min(1000).max(60000),
  rateLimit: z.object({
    windowMs: z.number().int().min(1000).max(3_600_000),
    max: z.number().int().min(1).max(10_000),
  }),
  generation: z.object({
    maxChars: z.number().int().min(500).max(200_000),
    styleStrengthMax: z.number().min(0).max(1),
  }),
  desiredPort: z.number().int().min(1).max(65535).optional(),
  allowRuntimeKeyOverride: z.boolean(),
  allowSecretPersistence: z.boolean(),
  openaiBaseUrl: z.string().trim().url().optional(),
});

const updateSchema = storedConfigSchema.partial().extend({
  allowedModels: z.array(z.string().trim().min(1).max(120)).optional(),
  desiredPort: z.number().int().min(1).max(65535).nullable().optional(),
  openaiBaseUrl: z.string().trim().url().nullable().optional(),
});

function normaliseModels(models: string[], defaultModel: string): string[] {
  const list = models.map((model) => model.trim()).filter(Boolean);
  if (!list.includes(defaultModel)) {
    list.push(defaultModel);
  }
  return Array.from(new Set(list));
}

class RuntimeConfigManager extends EventEmitter {
  private logger = baseLogger.child({ module: 'runtime-config' });

  private storedConfig: StoredRuntimeConfig;

  private effectiveConfig: EffectiveRuntimeConfig;

  private availableModels: string[];

  private initialised = false;

  private readonly actualPort = appConfig.server.port;

  constructor() {
    super();
    const defaults = this.buildDefaultStoredConfig();
    this.storedConfig = defaults;
    this.availableModels = this.computeAvailableModels(defaults);
    this.effectiveConfig = this.buildEffectiveConfig(defaults);
  }

  async init(): Promise<void> {
    if (this.initialised) {
      return;
    }

    try {
      const doc = await RuntimeConfigModel.findOne({ scope: 'global' }).lean<{ _id: unknown; data: unknown } | null>();
      if (!doc) {
        await RuntimeConfigModel.create({ scope: 'global', data: this.storedConfig });
        this.logger.info('Runtime configuration document created with defaults');
        this.applyConfig(this.storedConfig, { silent: true });
      } else {
        const parsed = this.parseStoredConfig(doc.data);
        if (JSON.stringify(parsed) !== JSON.stringify(doc.data)) {
          await RuntimeConfigModel.updateOne({ scope: 'global' }, { $set: { data: parsed } }).exec();
        }
        this.applyConfig(parsed, { silent: true });
      }
      this.initialised = true;
      this.logger.info('Runtime configuration loaded');
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialise runtime configuration; falling back to defaults');
      this.applyConfig(this.storedConfig, { silent: true });
      this.initialised = true;
    }
  }

  getEffectiveConfig(): EffectiveRuntimeConfig {
    return this.effectiveConfig;
  }

  getDefaultModel(): string {
    return this.effectiveConfig.defaultModel;
  }

  getAllowedModels(): string[] {
    return this.effectiveConfig.allowedModels;
  }

  getModelOptions(): string[] {
    return this.availableModels;
  }

  getSseHeartbeatMs(): number {
    return this.effectiveConfig.sseHeartbeatMs;
  }

  getRateLimitConfig(): { windowMs: number; max: number } {
    return this.effectiveConfig.rateLimit;
  }

  getGenerationConfig(): { maxChars: number; styleStrengthMax: number } {
    return this.effectiveConfig.generation;
  }

  allowRuntimeKeyOverride(): boolean {
    return this.effectiveConfig.allowRuntimeKeyOverride;
  }

  canPersistSecrets(): boolean {
    return this.effectiveConfig.secretPersistenceEnabled;
  }

  getOpenAIBaseUrl(): string | undefined {
    return this.effectiveConfig.openaiBaseUrl ?? appConfig.openai.baseUrl;
  }

  async update(
    payload: RuntimeConfigUpdateInput
  ): Promise<{ config: EffectiveRuntimeConfig; desiredPortChanged: boolean }> {
    const normalised = this.normaliseUpdatePayload(payload);
    if (Object.keys(normalised).length === 0) {
      return { config: this.effectiveConfig, desiredPortChanged: false };
    }

    const parsed = updateSchema.parse(normalised);
    const merged = this.mergeConfigs(this.storedConfig, parsed);
    const finalConfig = this.parseStoredConfig(merged);
    const desiredPortChanged = 'desiredPort' in normalised
      && (normalised.desiredPort ?? undefined) !== this.storedConfig.desiredPort;

    await RuntimeConfigModel.findOneAndUpdate(
      { scope: 'global' },
      { $set: { data: finalConfig } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    this.applyConfig(finalConfig);

    return { config: this.effectiveConfig, desiredPortChanged };
  }

  private buildDefaultStoredConfig(): StoredRuntimeConfig {
    const defaultModel = appConfig.openai.defaultModel;
    const allowedModels = normaliseModels(appConfig.openai.allowedModels, defaultModel);

    return {
      defaultModel,
      allowedModels,
      sseHeartbeatMs: appConfig.runtimeDefaults.sseHeartbeatMs,
      rateLimit: {
        windowMs: appConfig.runtimeDefaults.rateLimit.windowMs,
        max: appConfig.runtimeDefaults.rateLimit.max,
      },
      generation: {
        maxChars: appConfig.runtimeDefaults.generation.maxChars,
        styleStrengthMax: appConfig.runtimeDefaults.generation.styleStrengthMax,
      },
      allowRuntimeKeyOverride: appConfig.openai.allowRuntimeKeyOverride,
      allowSecretPersistence: false,
      openaiBaseUrl: appConfig.openai.baseUrl,
    };
  }

  private computeAvailableModels(config: StoredRuntimeConfig): string[] {
    return Array.from(new Set([...config.allowedModels]));
  }

  private buildEffectiveConfig(config: StoredRuntimeConfig): EffectiveRuntimeConfig {
    const masterKeyConfigured = Boolean(appConfig.security.masterKey);
    const secretPersistenceEnabled = config.allowSecretPersistence && masterKeyConfigured;
    const allowedModels = [...config.allowedModels];
    const availableModels = this.computeAvailableModels(config);

    return {
      defaultModel: config.defaultModel,
      allowedModels,
      availableModels,
      sseHeartbeatMs: config.sseHeartbeatMs,
      rateLimit: { ...config.rateLimit },
      generation: { ...config.generation },
      desiredPort: config.desiredPort,
      allowRuntimeKeyOverride: config.allowRuntimeKeyOverride,
      allowSecretPersistence: config.allowSecretPersistence,
      secretPersistenceEnabled,
      masterKeyConfigured,
      port: this.actualPort,
      openaiBaseUrl: config.openaiBaseUrl ?? appConfig.openai.baseUrl,
      models: allowedModels,
    };
  }

  private applyConfig(config: StoredRuntimeConfig, options: { silent?: boolean } = {}): void {
    this.storedConfig = config;
    this.availableModels = this.computeAvailableModels(config);
    this.effectiveConfig = this.buildEffectiveConfig(config);
    if (!options.silent) {
      this.emit('update', this.effectiveConfig);
    }
  }

  private parseStoredConfig(raw: unknown): StoredRuntimeConfig {
    const merged = {
      ...this.buildDefaultStoredConfig(),
      ...(typeof raw === 'object' && raw !== null ? raw : {}),
    } as Record<string, unknown>;

    const parsed = storedConfigSchema.parse(merged);
    const defaultModel = parsed.defaultModel.trim();
    const allowedModels = normaliseModels(parsed.allowedModels, defaultModel);

    const result: StoredRuntimeConfig = {
      defaultModel,
      allowedModels,
      sseHeartbeatMs: parsed.sseHeartbeatMs,
      rateLimit: {
        windowMs: parsed.rateLimit.windowMs,
        max: parsed.rateLimit.max,
      },
      generation: {
        maxChars: parsed.generation.maxChars,
        styleStrengthMax: parsed.generation.styleStrengthMax,
      },
      allowRuntimeKeyOverride: parsed.allowRuntimeKeyOverride,
      allowSecretPersistence: parsed.allowSecretPersistence,
    };

    if (parsed.desiredPort !== undefined) {
      result.desiredPort = parsed.desiredPort;
    }

    if (parsed.openaiBaseUrl) {
      result.openaiBaseUrl = parsed.openaiBaseUrl;
    }

    return result;
  }

  private mergeConfigs(base: StoredRuntimeConfig, updates: Partial<StoredRuntimeConfig>): StoredRuntimeConfig {
    const merged: StoredRuntimeConfig = {
      ...base,
      ...updates,
      rateLimit: {
        ...base.rateLimit,
        ...(updates.rateLimit ?? {}),
      },
      generation: {
        ...base.generation,
        ...(updates.generation ?? {}),
      },
    };

    if (updates.allowedModels) {
      merged.allowedModels = updates.allowedModels;
    }

    if ('desiredPort' in updates && updates.desiredPort === undefined) {
      delete merged.desiredPort;
    }

    if ('openaiBaseUrl' in updates) {
      merged.openaiBaseUrl = updates.openaiBaseUrl;
    }

    return merged;
  }

  private normaliseUpdatePayload(payload: RuntimeConfigUpdateInput): Partial<StoredRuntimeConfig> & {
    desiredPort?: number;
  } {
    const result: Partial<StoredRuntimeConfig> & { desiredPort?: number } = {};

    if (payload.defaultModel !== undefined) {
      const trimmed = payload.defaultModel?.trim();
      if (trimmed) {
        result.defaultModel = trimmed;
      }
    }

    if (payload.allowedModels !== undefined) {
      result.allowedModels = payload.allowedModels
        ?.map((model) => model.trim())
        .filter((model) => model.length > 0);
    }

    if (payload.sseHeartbeatMs !== undefined) {
      result.sseHeartbeatMs = payload.sseHeartbeatMs;
    }

    if (payload.rateLimit) {
      const rateLimitUpdates: Partial<StoredRuntimeConfig['rateLimit']> = {};
      if (payload.rateLimit.windowMs !== undefined) {
        rateLimitUpdates.windowMs = payload.rateLimit.windowMs;
      }
      if (payload.rateLimit.max !== undefined) {
        rateLimitUpdates.max = payload.rateLimit.max;
      }
      if (Object.keys(rateLimitUpdates).length > 0) {
        result.rateLimit = rateLimitUpdates as StoredRuntimeConfig['rateLimit'];
      }
    }

    if (payload.generation) {
      const generationUpdates: Partial<StoredRuntimeConfig['generation']> = {};
      if (payload.generation.maxChars !== undefined) {
        generationUpdates.maxChars = payload.generation.maxChars;
      }
      if (payload.generation.styleStrengthMax !== undefined) {
        generationUpdates.styleStrengthMax = payload.generation.styleStrengthMax;
      }
      if (Object.keys(generationUpdates).length > 0) {
        result.generation = generationUpdates as StoredRuntimeConfig['generation'];
      }
    }

    if ('desiredPort' in payload) {
      if (payload.desiredPort === null || payload.desiredPort === undefined) {
        result.desiredPort = undefined;
      } else {
        result.desiredPort = payload.desiredPort;
      }
    }

    if (payload.allowRuntimeKeyOverride !== undefined) {
      result.allowRuntimeKeyOverride = payload.allowRuntimeKeyOverride;
    }

    if (payload.allowSecretPersistence !== undefined) {
      result.allowSecretPersistence = payload.allowSecretPersistence;
    }

    if ('openaiBaseUrl' in payload) {
      const trimmed = payload.openaiBaseUrl?.trim();
      result.openaiBaseUrl = trimmed && trimmed.length ? trimmed : undefined;
    }

    return result;
  }
}

const runtimeConfig = new RuntimeConfigManager();

export default runtimeConfig;
