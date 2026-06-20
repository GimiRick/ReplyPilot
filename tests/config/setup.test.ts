import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createConfigFromSetupAnswers,
  promptForConfig,
  runSetupWizard,
  type PromptAdapter,
} from '../../src/config/setup';
import { createConfigStore, loadConfig } from '../../src/config/store';

describe('setup wizard config creation', () => {
  it('applies LM Studio defaults', () => {
    const config = createConfigFromSetupAnswers({
      provider: 'lmstudio',
      modelName: 'loaded-model',
    });

    expect(config.llm.baseUrl).toBe('http://localhost:1234/v1');
    expect(config.llm.apiKey).toBe('lm-studio');
    expect(config.context.messageCount).toBe(30);
  });

  it('applies Ollama defaults', () => {
    const config = createConfigFromSetupAnswers({
      provider: 'ollama',
      modelName: 'llama3.1',
    });

    expect(config.llm.baseUrl).toBe('http://localhost:11434/v1');
    expect(config.llm.apiKey).toBe('ollama');
  });

  it('requires custom provider details', () => {
    expect(() =>
      createConfigFromSetupAnswers({
        provider: 'custom',
        modelName: 'my-model',
      }),
    ).toThrow();
  });

  it('persists user-provided context count', () => {
    const config = createConfigFromSetupAnswers({
      provider: 'custom',
      baseUrl: 'https://example.test/v1',
      apiKey: 'secret',
      modelName: 'office',
      modelLabel: 'Office Assistant',
      messageCount: 77,
    });

    expect(config.context.messageCount).toBe(77);
  });

  it('collects answers with prompt defaults', async () => {
    const prompts = makePromptAdapter([
      'lmstudio',
      'http://localhost:1234/v1',
      'lm-studio',
      'loaded-model',
      'Local Llama',
      false,
      undefined,
      'Reply in my tone.',
      false,
      false,
      false,
      false,
    ]);

    const config = await promptForConfig(prompts);

    expect(config.llm.provider).toBe('lmstudio');
    expect(config.context.messageCount).toBe(30);
    expect(config.personality.ownerStylePrompt).toBe('Reply in my tone.');
  });

  it('collects custom provider answers with the password prompt', async () => {
    const prompts = makePromptAdapter([
      'custom',
      'https://provider.example/v1',
      'secret-key',
      'custom-model',
      'Custom Model',
      false,
      12,
      'Crisp and warm.',
      false,
      true,
      true,
      false,
    ]);

    const config = await promptForConfig(prompts);

    expect(config.llm.provider).toBe('custom');
    expect(config.llm.apiKey).toBe('secret-key');
    expect(config.whatsapp.allowGroups).toBe(true);
    expect(config.whatsapp.allowBroadcasts).toBe(true);
    expect(prompts.password).toHaveBeenCalledOnce();
  });

  it('exposes prompt validation messages', async () => {
    const prompts = makePromptAdapter([
      'lmstudio',
      'http://localhost:1234/v1',
      'lm-studio',
      'loaded-model',
      'Local Llama',
      false,
      30,
      'Reply in my tone.',
      false,
      false,
      false,
      false,
    ]);

    await promptForConfig(prompts);

    const baseUrlOptions = getFirstPromptOptions(prompts.input);
    const numberOptions = getFirstPromptOptions(prompts.number);

    expect(baseUrlOptions.validate?.('')).toBe('Base URL is required');
    expect(baseUrlOptions.validate?.('not-a-url')).toBe('LLM base URL must be a valid URL');
    expect(baseUrlOptions.validate?.('http://localhost:1234/v1')).toBe(true);
    expect(numberOptions.validate?.(undefined)).toBe(true);
    expect(numberOptions.validate?.(30.5)).toBe('Value must be an integer');
    expect(numberOptions.validate?.(300)).toBe('Choose a value from 1 to 200');
  });

  it('lets users configure Whisper Cloud voice transcription', async () => {
    const prompts = makePromptAdapter([
      'lmstudio',
      'http://localhost:1234/v1',
      'lm-studio',
      'loaded-model',
      'Local Llama',
      false,
      undefined,
      'Reply in my tone.',
      false,
      false,
      false,
      true,
      'whisper_cloud',
      'https://whisper.example/v1',
      'sk-whisper-key',
      'whisper-1',
    ]);

    const config = await promptForConfig(prompts);

    expect(config.voiceNote?.mode).toBe('whisper_cloud');
    expect(config.voiceNote?.whisperBaseUrl).toBe('https://whisper.example/v1');
    expect(config.voiceNote?.whisperApiKey).toBe('sk-whisper-key');
    expect(config.voiceNote?.whisperModel).toBe('whisper-1');
  });

  it('lets users pick a custom Whisper model for cloud transcription', async () => {
    const prompts = makePromptAdapter([
      'lmstudio',
      'http://localhost:1234/v1',
      'lm-studio',
      'loaded-model',
      'Local Llama',
      false,
      undefined,
      'Reply in my tone.',
      false,
      false,
      false,
      true,
      'whisper_cloud',
      'https://whisper.example/v1',
      'sk-whisper-key',
      '__custom__',
      'whisper-large-v3-turbo',
    ]);

    const config = await promptForConfig(prompts);

    expect(config.voiceNote?.whisperModel).toBe('whisper-large-v3-turbo');
  });

  it('lets users configure Whisper Local voice transcription', async () => {
    const prompts = makePromptAdapter([
      'lmstudio',
      'http://localhost:1234/v1',
      'lm-studio',
      'loaded-model',
      'Local Llama',
      false,
      undefined,
      'Reply in my tone.',
      false,
      false,
      false,
      true,
      'whisper_local',
      'http://localhost:9000/transcribe',
    ]);

    const config = await promptForConfig(prompts);

    expect(config.voiceNote?.mode).toBe('whisper_local');
    expect(config.voiceNote?.localWhisperUrl).toBe('http://localhost:9000/transcribe');
  });

  it('lets users configure Native Audio voice handling', async () => {
    const prompts = makePromptAdapter([
      'lmstudio',
      'http://localhost:1234/v1',
      'lm-studio',
      'loaded-model',
      'Local Llama',
      false,
      undefined,
      'Reply in my tone.',
      false,
      false,
      false,
      true,
      'native_audio',
    ]);

    const config = await promptForConfig(prompts);

    expect(config.voiceNote?.mode).toBe('native_audio');
    expect(config.llm.provider).toBe('lmstudio');
  });

  it('validates custom whisper model names', async () => {
    const prompts = makePromptAdapter([
      'lmstudio', 'http://localhost', 'key', 'model', 'Model', false, undefined, 'tone', false, false, false, true, 'whisper_cloud', 'http://whisper', 'key', '__custom__', 'my-model'
    ]);
    await promptForConfig(prompts);
    const customModelCall = vi.mocked(prompts.input).mock.calls.find((call) => (call[0] as { message?: string }).message === 'Custom Whisper model name')!;
    const customModelOptions = customModelCall[0]! as { validate: (value: string) => true | string };
    expect(customModelOptions.validate('')).toBe('Model name is required');
    expect(customModelOptions.validate('my-model')).toBe(true);
  });

  it('validates local whisper URLs', async () => {
    const prompts = makePromptAdapter([
      'lmstudio', 'http://localhost', 'key', 'model', 'Model', false, undefined, 'tone', false, false, false, true, 'whisper_local', 'http://localhost:9000/transcribe'
    ]);
    await promptForConfig(prompts);
    const localUrlCall = vi.mocked(prompts.input).mock.calls.find((call) => (call[0] as { message?: string }).message === 'Local Whisper URL')!;
    const localUrlOptions = localUrlCall[0]! as { validate: (value: string) => true | string };
    expect(localUrlOptions.validate('')).toBe('URL is required');
    expect(localUrlOptions.validate('not-a-url')).toBe('Local Whisper URL must be a valid URL');
    expect(localUrlOptions.validate('http://localhost:9000')).toBe(true);
  });

  it('saves setup output to the config store', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'replypilot-test-'));
    try {
      const store = createConfigStore({ cwd, projectName: 'replypilot-test' });
      const prompts = makePromptAdapter([
        'ollama',
        'http://localhost:11434/v1',
        'ollama',
        'qwen2.5',
        'Qwen Local',
        false,
        44,
        'Short and friendly.',
        true,
        false,
        false,
        false,
      ]);

      await runSetupWizard({ prompts, store });

      expect(loadConfig(store).context.messageCount).toBe(44);
      expect(loadConfig(store).safety.dryRun).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

function makePromptAdapter(values: unknown[]): PromptAdapter {
  const next = async () => values.shift();

  return {
    select: vi.fn(next),
    input: vi.fn(next),
    password: vi.fn(next),
    number: vi.fn(next),
    confirm: vi.fn(next),
  } as unknown as PromptAdapter;
}

function getFirstPromptOptions(prompt: unknown) {
  return (prompt as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
    validate?: (value: unknown) => true | string;
  };
}
