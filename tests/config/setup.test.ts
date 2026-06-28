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
import { createConfigStore, loadConfig, saveConfig } from '../../src/config/store';

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
      false,
      false,
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
    expect(config.automation.debounceMs).toBe(0);
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
      false,
      false,
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
    expect(config.automation.debounceMs).toBe(0);
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
      undefined,
      false,
      false,
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

    await promptForConfig(prompts);

    const getValidate = (target: typeof prompts.input | typeof prompts.editor, msg: string) => {
      const call = vi.mocked(target).mock.calls.find(
        (c) => (c[0] as { message: string }).message.includes(msg)
      )!;
      return (call[0] as { validate: (v: unknown) => true | string }).validate;
    };

    const baseUrlValidate = getValidate(prompts.input, 'LLM base URL');
    const ownerStyleValidate = getValidate(prompts.editor, 'Owner personality and style prompt');
    const whisperBaseUrlValidate = getValidate(prompts.input, 'Whisper base URL');

    expect(baseUrlValidate('')).toBe('Base URL is required');
    expect(baseUrlValidate('not-a-url')).toBe('LLM base URL must be a valid URL');
    expect(baseUrlValidate('http://localhost:1234/v1')).toBe(true);

    const numberOptions = getFirstPromptOptions(prompts.number);
    expect(numberOptions.validate?.(undefined)).toBe(true);
    expect(numberOptions.validate?.(30.5)).toBe('Value must be an integer');
    expect(numberOptions.validate?.(300)).toBe('Choose a value from 1 to 200');

    expect(ownerStyleValidate('   ')).toBe('Owner style prompt is required');
    expect(ownerStyleValidate('test')).toBe(true);

    expect(whisperBaseUrlValidate('   ')).toBe(true);
    expect(whisperBaseUrlValidate('not-a-url')).toBe('Base URL must be a valid URL');
    expect(whisperBaseUrlValidate('http://localhost:1234/v1')).toBe(true);
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
      false,
      false,
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
      false,
      false,
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
      false,
      false,
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
      false,
      false,
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
      'lmstudio', 'http://localhost', 'key', 'model', 'Model', false, undefined, false, false, 'tone', false, false, false, true, 'whisper_cloud', 'http://whisper', 'key', '__custom__', 'my-model'
    ]);
    await promptForConfig(prompts);
    const customModelCall = vi.mocked(prompts.input).mock.calls.find((call) => (call[0] as { message?: string }).message === 'Custom Whisper model name')!;
    const customModelOptions = customModelCall[0]! as { validate: (value: string) => true | string };
    expect(customModelOptions.validate('')).toBe('Model name is required');
    expect(customModelOptions.validate('my-model')).toBe(true);
  });

  it('validates local whisper URLs', async () => {
    const prompts = makePromptAdapter([
      'lmstudio', 'http://localhost', 'key', 'model', 'Model', false, undefined, false, false, 'tone', false, false, false, true, 'whisper_local', 'http://localhost:9000/transcribe'
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
        'default',
        'ollama',
        'http://localhost:11434/v1',
        'ollama',
        'qwen2.5',
        'Qwen Local',
        false,
        44,
        false,
        false,
        'Short and friendly.',
        true,
        false,
        false,
        false,
      ]);

      const result = await runSetupWizard({ prompts, store });

      expect(result.configName).toBe('default');
      expect(loadConfig(undefined, store).context.messageCount).toBe(44);
      expect(loadConfig(undefined, store).safety.dryRun).toBe(true);
      expect(loadConfig(undefined, store).automation.debounceMs).toBe(0);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects duplicate config names in the setup wizard', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'replypilot-test-'));
    try {
      const store = createConfigStore({ cwd, projectName: 'replypilot-test' });
      saveConfig(
        createConfigFromSetupAnswers({ provider: 'ollama', modelName: 'mistral' }),
        'work',
        store,
      );

      const prompts = makePromptAdapter([
        'work',
        'ollama',
        'http://localhost:11434/v1',
        'ollama',
        'qwen2.5',
        'Qwen Local',
        false,
        44,
        false,
        false,
        'Short and friendly.',
        true,
        false,
        false,
        false,
      ]);

      await runSetupWizard({ prompts, store });

      const namePromptCall = vi.mocked(prompts.input).mock.calls.find(
        (c) => (c[0] as { message: string }).message === 'Configuration name',
      )!;
      const validate = (namePromptCall[0] as { validate: (v: string) => true | string }).validate;

      expect(validate('work')).toBe('A configuration named "work" already exists.');
      expect(validate('new-config')).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('allows setting max LLM API calls per minute limit', async () => {
    const prompts = makePromptAdapter([
      'lmstudio',
      'http://localhost:1234/v1',
      'lm-studio',
      'loaded-model',
      'Local Llama',
      false,
      undefined,
      true,
      50,
      false,
      'Reply in my tone.',
      false,
      false,
      false,
      false,
    ]);

    const config = await promptForConfig(prompts);

    expect(config.automation.maxCallsPerMinute).toBe(50);
    expect(config.automation.debounceMs).toBe(0);
  });

  it('lets users set a custom wait time before sending', async () => {
    const prompts = makePromptAdapter([
      'lmstudio',
      'http://localhost:1234/v1',
      'lm-studio',
      'loaded-model',
      'Local Llama',
      false,
      undefined,
      false,
      true,
      30,
      'Reply in my tone.',
      false,
      false,
      false,
      false,
    ]);

    const config = await promptForConfig(prompts);

    expect(config.automation.debounceMs).toBe(30000);
  });

  it('sets debounceMs to 0 when no wait time is wanted', async () => {
    const prompts = makePromptAdapter([
      'lmstudio',
      'http://localhost:1234/v1',
      'lm-studio',
      'loaded-model',
      'Local Llama',
      false,
      undefined,
      false,
      false,
      'Reply in my tone.',
      false,
      false,
      false,
      false,
    ]);

    const config = await promptForConfig(prompts);

    expect(config.automation.debounceMs).toBe(0);
  });

  it('validates wait time input', async () => {
    const prompts = makePromptAdapter([
      'lmstudio',
      'http://localhost:1234/v1',
      'lm-studio',
      'loaded-model',
      'Local Llama',
      false,
      undefined,
      false,
      true,
      undefined,
      'Reply in my tone.',
      false,
      false,
      false,
      false,
    ]);

    await promptForConfig(prompts);

    const debounceOptions = getNthPromptOptions(prompts.number, 1);
    expect(debounceOptions.validate?.(undefined)).toBe(true);
    expect(debounceOptions.validate?.(30.5)).toBe('Value must be an integer');
    expect(debounceOptions.validate?.(-1)).toBe('Choose a value from 0 to 600');
    expect(debounceOptions.validate?.(601)).toBe('Choose a value from 0 to 600');
    expect(debounceOptions.validate?.(10)).toBe(true);
  });

  it('validates max calls per minute input', async () => {
    const prompts = makePromptAdapter([
      'lmstudio',
      'http://localhost:1234/v1',
      'lm-studio',
      'loaded-model',
      'Local Llama',
      false,
      undefined,
      true,
      undefined,
      false,
      'Reply in my tone.',
      false,
      false,
      false,
      false,
    ]);

    await promptForConfig(prompts);

    const rateLimitOptions = getNthPromptOptions(prompts.number, 1);
    expect(rateLimitOptions.validate?.(undefined)).toBe(true);
    expect(rateLimitOptions.validate?.(30.5)).toBe('Value must be an integer');
    expect(rateLimitOptions.validate?.(0)).toBe('Choose a value from 1 to 120');
    expect(rateLimitOptions.validate?.(121)).toBe('Choose a value from 1 to 120');
    expect(rateLimitOptions.validate?.(36)).toBe(true);
  });
});

function makePromptAdapter(values: unknown[]): PromptAdapter {
  const next = async () => values.shift();

  return {
    select: vi.fn(next),
    input: vi.fn(next),
    editor: vi.fn(next),
    password: vi.fn(next),
    number: vi.fn(next),
    confirm: vi.fn(next),
  } as unknown as PromptAdapter;
}

function getFirstPromptOptions(prompt: unknown) {
  return getNthPromptOptions(prompt, 0);
}

function getNthPromptOptions(prompt: unknown, index: number) {
  return (prompt as ReturnType<typeof vi.fn>).mock.calls[index][0] as {
    validate?: (value: unknown) => true | string;
  };
}
