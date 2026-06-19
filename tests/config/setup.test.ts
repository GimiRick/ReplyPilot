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
      undefined,
      'Reply in my tone.',
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
      12,
      'Crisp and warm.',
      false,
      true,
      true,
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
      30,
      'Reply in my tone.',
      false,
      false,
      false,
    ]);

    await promptForConfig(prompts);

    const baseUrlOptions = getFirstPromptOptions(prompts.input);
    const numberOptions = getFirstPromptOptions(prompts.number);

    expect(baseUrlOptions.validate?.('')).toBe('Base URL is required');
    expect(numberOptions.validate?.(undefined)).toBe(true);
    expect(numberOptions.validate?.(300)).toBe('Choose a value from 1 to 200');
  });

  it('saves setup output to the config store', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'replypilot-test-'));
    const store = createConfigStore({ cwd, projectName: 'replypilot-test' });
    const prompts = makePromptAdapter([
      'ollama',
      'http://localhost:11434/v1',
      'ollama',
      'qwen2.5',
      'Qwen Local',
      44,
      'Short and friendly.',
      true,
      false,
      false,
    ]);

    await runSetupWizard({ prompts, store });

    expect(loadConfig(store).context.messageCount).toBe(44);
    expect(loadConfig(store).safety.dryRun).toBe(true);
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
