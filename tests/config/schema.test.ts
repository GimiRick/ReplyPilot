import { describe, expect, it } from 'vitest';

import { ConfigValidationError } from '../../src/runtime/errors';
import {
  DEFAULT_APP_CONFIG,
  mergeAppConfig,
  parseAppConfig,
  redactConfig,
} from '../../src/config/schema';
import { makeConfig } from '../fixtures/app-config';

describe('config schema', () => {
  it('accepts a valid LM Studio config', () => {
    const config = makeConfig({
      llm: {
        provider: 'lmstudio',
        baseUrl: 'http://localhost:1234/v1',
        apiKey: 'lm-studio',
        modelName: 'llama-local',
        modelLabel: 'Local Llama',
      },
    });

    expect(parseAppConfig(config).llm.provider).toBe('lmstudio');
  });

  it('accepts a valid Ollama config', () => {
    const config = makeConfig({
      llm: {
        provider: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'ollama',
        modelName: 'qwen2.5',
        modelLabel: 'Qwen Local',
      },
    });

    expect(parseAppConfig(config).llm.provider).toBe('ollama');
  });

  it('accepts a valid custom provider config', () => {
    const config = makeConfig({
      llm: {
        provider: 'custom',
        baseUrl: 'https://llm.example.test/v1',
        apiKey: 'secret',
        modelName: 'office-assistant',
        modelLabel: 'Office Assistant',
      },
    });

    expect(parseAppConfig(config).llm.provider).toBe('custom');
  });

  it('rejects invalid base URLs', () => {
    expect(() =>
      parseAppConfig({
        ...DEFAULT_APP_CONFIG,
        llm: { ...DEFAULT_APP_CONFIG.llm, baseUrl: 'not-a-url' },
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects an empty model name', () => {
    expect(() =>
      parseAppConfig({
        ...DEFAULT_APP_CONFIG,
        llm: { ...DEFAULT_APP_CONFIG.llm, modelName: ' ' },
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects a context count below one', () => {
    expect(() =>
      parseAppConfig({
        ...DEFAULT_APP_CONFIG,
        context: { messageCount: 0 },
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects a context count above two hundred', () => {
    expect(() =>
      parseAppConfig({
        ...DEFAULT_APP_CONFIG,
        context: { messageCount: 201 },
      }),
    ).toThrow(ConfigValidationError);
  });

  it('redacts secrets for config show', () => {
    const redacted = redactConfig(makeConfig({ llm: { apiKey: 'top-secret' } }));

    expect(redacted.llm.apiKey).toBe('[redacted]');
    expect(redacted.llm.modelName).toBe(DEFAULT_APP_CONFIG.llm.modelName);
  });

  it('keeps empty API keys empty when redacting', () => {
    const redacted = redactConfig({
      ...DEFAULT_APP_CONFIG,
      llm: { ...DEFAULT_APP_CONFIG.llm, apiKey: '' },
    });

    expect(redacted.llm.apiKey).toBe('');
  });

  it('redacts fallback API keys', () => {
    const redacted = redactConfig(
      makeConfig({ llm: { apiKey: 'secret', fallbackApiKeys: ['key1', 'key2'] } }),
    );

    expect(redacted.llm.fallbackApiKeys).toEqual(['[redacted]', '[redacted]']);
  });

  it('handles empty fallbackApiKeys when redacting', () => {
    const redacted = redactConfig(makeConfig({ llm: { apiKey: 'secret' } }));

    expect(redacted.llm.fallbackApiKeys).toEqual([]);
  });

  it('merges nested overrides without replacing undefined values', () => {
    const merged = mergeAppConfig(makeConfig(), {
      llm: { modelName: undefined, modelLabel: 'Better Label' },
    });

    expect(merged.llm.modelName).toBe(DEFAULT_APP_CONFIG.llm.modelName);
    expect(merged.llm.modelLabel).toBe('Better Label');
  });

  it('validates the base config when no overrides are provided', () => {
    expect(mergeAppConfig(makeConfig())).toEqual(makeConfig());
  });

  it('accepts voiceNote config with whisper_cloud mode', () => {
    const config = makeConfig({
      voiceNote: {
        mode: 'whisper_cloud',
        whisperBaseUrl: 'https://whisper.example/v1',
        whisperApiKey: 'key',
        whisperModel: 'whisper-1',
      },
    });

    const parsed = parseAppConfig(config);
    expect(parsed.voiceNote?.mode).toBe('whisper_cloud');
    expect(parsed.voiceNote?.whisperModel).toBe('whisper-1');
  });

  it('accepts voiceNote config with native_audio mode', () => {
    const config = makeConfig({
      voiceNote: { mode: 'native_audio', whisperModel: 'whisper-1' },
    });

    const parsed = parseAppConfig(config);
    expect(parsed.voiceNote?.mode).toBe('native_audio');
  });

  it('accepts voiceNote config with whisper_local mode', () => {
    const config = makeConfig({
      voiceNote: {
        mode: 'whisper_local',
        localWhisperUrl: 'http://localhost:9000/inference',
      },
    });

    const parsed = parseAppConfig(config);
    expect(parsed.voiceNote?.mode).toBe('whisper_local');
    expect(parsed.voiceNote?.localWhisperUrl).toBe('http://localhost:9000/inference');
  });

  it('defaults voiceNote mode to ignore when omitted', () => {
    const parsed = parseAppConfig(DEFAULT_APP_CONFIG);

    expect(parsed.voiceNote?.mode).toBe('ignore');
  });

  it('redacts whisperApiKey in config show', () => {
    const redacted = redactConfig(
      makeConfig({
        voiceNote: {
          mode: 'whisper_cloud',
          whisperApiKey: 'sk-whisper',
          whisperModel: 'whisper-1',
        },
      }),
    );

    expect(redacted.voiceNote?.whisperApiKey).toBe('[redacted]');
  });

  it('rejects invalid voiceNote mode values', () => {
    expect(() =>
      parseAppConfig({
        ...DEFAULT_APP_CONFIG,
        voiceNote: { mode: 'invalid_mode' } as never,
      }),
    ).toThrow();
  });

  it('rejects invalid localWhisperUrl', () => {
    expect(() =>
      parseAppConfig({
        ...DEFAULT_APP_CONFIG,
        voiceNote: { mode: 'whisper_local', localWhisperUrl: 'not-a-url' },
      }),
    ).toThrow();
  });
});
