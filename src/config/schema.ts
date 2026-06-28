import { z } from 'zod';

import { ConfigValidationError } from '../runtime/errors';

export const CONFIG_VERSION = 1 as const;

export const providerSchema = z.enum(['lmstudio', 'ollama', 'custom']);
export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

export type ConfigVersion = typeof CONFIG_VERSION;
export type LlmProviderName = z.infer<typeof providerSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;

export const PROVIDER_DEFAULTS: Record<
  Exclude<LlmProviderName, 'custom'>,
  { baseUrl: string; apiKey: string; modelLabel: string }
> = {
  lmstudio: {
    baseUrl: 'http://localhost:1234/v1',
    apiKey: 'lm-studio',
    modelLabel: 'LM Studio Local',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    modelLabel: 'Ollama Local',
  },
};

const nonEmptyString = (field: string) => z.string().trim().min(1, `${field} is required`);

export const appConfigSchema = z
  .object({
    version: z.literal(CONFIG_VERSION),
    whatsapp: z.object({
      sessionName: nonEmptyString('WhatsApp session name').default('default'),
      allowGroups: z.boolean().default(false),
      allowBroadcasts: z.boolean().default(false),
    }),
    llm: z.object({
      provider: providerSchema,
      baseUrl: z.string().trim().url('LLM base URL must be a valid URL'),
      apiKey: nonEmptyString('LLM API key'),
      modelName: nonEmptyString('LLM model name'),
      modelLabel: nonEmptyString('LLM model label'),
      visionSupport: z.boolean().default(false),
      timeoutMs: z.number().int().positive().default(60_000),
      maxRetries: z.number().int().min(0).max(5).default(1),
      fallbackApiKeys: z.array(z.string().trim().min(1)).default([]),
    }),
    personality: z.object({
      ownerStylePrompt: nonEmptyString('Owner style prompt'),
    }),
    context: z.object({
      messageCount: z.number().int().min(1).max(200).default(30),
    }),
    voiceNote: z.object({
      mode: z.enum(['ignore', 'whisper_cloud', 'whisper_local', 'native_audio']).default('ignore'),
      whisperBaseUrl: z.string().trim().url().optional(),
      whisperApiKey: z.string().optional(),
      whisperModel: z.string().trim().min(1).default('whisper-1'),
      localWhisperUrl: z.string().trim().url().optional(),
    }).default({ mode: 'ignore', whisperModel: 'whisper-1' }),
    safety: z.object({
      dryRun: z.boolean().default(false),
      ignoreSelf: z.boolean().default(true),
    }),
    logging: z.object({
      level: logLevelSchema.default('info'),
    }),
    automation: z.object({
      debounceMs: z.number().int().min(0).max(600_000).default(10000),
      maxCallsPerMinute: z.number().int().min(1).max(120).optional(),
    }).default({ debounceMs: 10000 }),
  })
  .strict();

export type AppConfig = z.infer<typeof appConfigSchema>;

export type PartialAppConfig = {
  [K in keyof AppConfig]?: AppConfig[K] extends object ? Partial<AppConfig[K]> : AppConfig[K];
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  version: CONFIG_VERSION,
  whatsapp: {
    sessionName: 'default',
    allowGroups: false,
    allowBroadcasts: false,
  },
  llm: {
    provider: 'lmstudio',
    baseUrl: PROVIDER_DEFAULTS.lmstudio.baseUrl,
    apiKey: PROVIDER_DEFAULTS.lmstudio.apiKey,
    modelName: 'local-model',
    modelLabel: PROVIDER_DEFAULTS.lmstudio.modelLabel,
    visionSupport: false,
    timeoutMs: 60_000,
    maxRetries: 1,
    fallbackApiKeys: [],
  },
  personality: {
    ownerStylePrompt: 'Reply naturally, concisely, and in my usual WhatsApp style.',
  },
  context: {
    messageCount: 30,
  },
  voiceNote: {
    mode: 'ignore',
    whisperModel: 'whisper-1',
  },
  safety: {
    dryRun: false,
    ignoreSelf: true,
  },
  logging: {
    level: 'info',
  },
  automation: {
    debounceMs: 10000,
  },
};

export function parseAppConfig(input: unknown): AppConfig {
  const result = appConfigSchema.safeParse(input);

  if (!result.success) {
    throw new ConfigValidationError('ReplyPilot configuration is invalid.', result.error);
  }

  return result.data;
}

export function mergeAppConfig(base: AppConfig, overrides?: PartialAppConfig): AppConfig {
  if (!overrides) {
    return parseAppConfig(base);
  }

  return parseAppConfig(deepMerge(base, overrides));
}

export function redactConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    llm: {
      ...config.llm,
      apiKey: config.llm.apiKey ? '[redacted]' : '',
      fallbackApiKeys: config.llm.fallbackApiKeys.map(() => '[redacted]'),
    },
    voiceNote: {
      ...config.voiceNote,
      ...(config.voiceNote.whisperApiKey && { whisperApiKey: '[redacted]' }),
    },
  };
}

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  overrides: Record<string, unknown>,
): T {
  const output: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    const baseValue = output[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      output[key] = deepMerge(baseValue, value);
    } else {
      output[key] = value;
    }
  }

  return output as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
