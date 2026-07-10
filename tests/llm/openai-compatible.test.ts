import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { OpenAiCompatibleProvider } from '../../src/llm/openai-compatible';
import { ProviderResponseError, ProviderTimeoutError } from '../../src/runtime/errors';

describe('OpenAiCompatibleProvider', () => {
  it('uses configured model and prompt messages', async () => {
    const create = vi.fn(async () => ({
      choices: [{ message: { content: 'Reply: See you soon' } }],
    }));
    const provider = makeProvider(create);

    const result = await provider.generateReply(makeInput({ model: 'llama3.1' }));

    expect(result).toEqual({
      text: 'See you soon',
      provider: 'ollama',
      model: 'llama3.1',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'llama3.1',
        temperature: 0.7,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('rejects empty LLM output', async () => {
    const provider = makeProvider(
      vi.fn(async () => ({
        choices: [{ message: { content: '   ' } }],
      })),
    );

    await expect(provider.generateReply(makeInput())).rejects.toThrow(ProviderResponseError);
  });

  it('retries transient empty reply from LLM', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: '   ' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Retried successfully' } }] });
    const provider = makeProvider(create, { maxRetries: 1 });

    await expect(provider.generateReply(makeInput())).resolves.toMatchObject({ text: 'Retried successfully' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('retries transient provider failures once', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 503 }))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Done' } }] });
    const provider = makeProvider(create, { maxRetries: 1 });

    await expect(provider.generateReply(makeInput())).resolves.toMatchObject({ text: 'Done' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent failures', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('bad request'), { status: 400 }));
    const provider = makeProvider(create, { maxRetries: 1 });

    await expect(provider.generateReply(makeInput())).rejects.toThrow('bad request');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('handles provider timeouts', async () => {
    const provider = makeProvider(() => new Promise(() => undefined), { timeoutMs: 1 });

    await expect(provider.generateReply(makeInput())).rejects.toThrow(ProviderTimeoutError);
  });

  it('retries 429 rate-limited errors', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('rate limited'), { statusCode: 429 }));
    const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const provider = new OpenAiCompatibleProvider({
      provider: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'secret',
      timeoutMs: 1_000,
      maxRetries: 1,
      logger: logger as never,
      client: {
        chat: { completions: { create } },
      },
    });

    await expect(provider.generateReply(makeInput())).rejects.toThrow('rate limited');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('retries transient network code failures', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Recovered' } }] });
    const provider = makeProvider(create, { maxRetries: 1 });

    await expect(provider.generateReply(makeInput())).resolves.toMatchObject({ text: 'Recovered' });
  });

  it('constructs a real OpenAI client when no client is injected', () => {
    const provider = new OpenAiCompatibleProvider({
      provider: 'lmstudio',
      baseUrl: 'http://localhost:1234/v1',
      apiKey: 'lm-studio',
      timeoutMs: 1_000,
      maxRetries: 1,
    });

    expect(provider).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  it('retries when error is ProviderTimeoutError', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new ProviderTimeoutError(1000))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Recovered' } }] });
    const provider = makeProvider(create, { maxRetries: 1 });
    await expect(provider.generateReply(makeInput())).resolves.toMatchObject({ text: 'Recovered' });
  });

  it('retries when error is APITimeoutError', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'APITimeoutError' }))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Recovered' } }] });
    const provider = makeProvider(create, { maxRetries: 1 });
    await expect(provider.generateReply(makeInput())).resolves.toMatchObject({ text: 'Recovered' });
  });

  it('does not retry when error is not an object', async () => {
    const create = vi.fn().mockRejectedValue('just a string error');
    const provider = makeProvider(create, { maxRetries: 1 });
    await expect(provider.generateReply(makeInput())).rejects.toThrow();
  });

  it('switches to fallback API key on failure', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Fallback worked' } }] });
    const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const provider = new OpenAiCompatibleProvider({
      provider: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'primary-key',
      fallbackApiKeys: ['fallback-key'],
      timeoutMs: 1_000,
      maxRetries: 0,
      logger: logger as never,
      client: {
        chat: { completions: { create } },
      },
    });

    const result = await provider.generateReply(makeInput());

    expect(result).toEqual({
      text: 'Fallback worked',
      provider: 'custom',
      model: 'local-model',
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      { keyIndex: 0, totalKeys: 2 },
      'Key failed, trying next API key',
    );
  });

  it('fails when all keys are exhausted', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('always fails'), { status: 500 }));
    const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const provider = new OpenAiCompatibleProvider({
      provider: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'key-1',
      fallbackApiKeys: ['key-2', 'key-3'],
      timeoutMs: 1_000,
      maxRetries: 0,
      logger: logger as never,
      client: {
        chat: { completions: { create } },
      },
    });

    await expect(provider.generateReply(makeInput())).rejects.toThrow('always fails');
    expect(create).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('falls through to fallback key on non-transient error', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('bad request'), { status: 400 }))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Fallback worked' } }] });
    const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const provider = new OpenAiCompatibleProvider({
      provider: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'primary',
      fallbackApiKeys: ['fallback'],
      timeoutMs: 1_000,
      maxRetries: 0,
      logger: logger as never,
      client: { chat: { completions: { create } } },
    });

    const result = await provider.generateReply(makeInput());

    expect(result.text).toBe('Fallback worked');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('falls through to fallback key on empty reply (ProviderResponseError)', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: '   ' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Fallback replied' } }] });
    const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const provider = new OpenAiCompatibleProvider({
      provider: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'primary',
      fallbackApiKeys: ['fallback'],
      timeoutMs: 1_000,
      maxRetries: 0,
      logger: logger as never,
      client: { chat: { completions: { create } } },
    });

    const result = await provider.generateReply(makeInput());

    expect(result.text).toBe('Fallback replied');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('uses third fallback key when first two fail', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('key1 failed'), { status: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error('key2 failed'), { status: 500 }))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Third key worked' } }] });
    const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const provider = new OpenAiCompatibleProvider({
      provider: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'key-1',
      fallbackApiKeys: ['key-2', 'key-3'],
      timeoutMs: 1_000,
      maxRetries: 0,
      logger: logger as never,
      client: { chat: { completions: { create } } },
    });

    const result = await provider.generateReply(makeInput());

    expect(result.text).toBe('Third key worked');
    expect(create).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('primary exhausts retries then fallback succeeds', async () => {
    vi.useFakeTimers();

    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('server error'), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error('server error'), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error('server error'), { status: 503 }))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Fallback after retries' } }] });
    const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const provider = new OpenAiCompatibleProvider({
      provider: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'primary',
      fallbackApiKeys: ['fallback'],
      timeoutMs: 10_000,
      maxRetries: 2,
      logger: logger as never,
      client: { chat: { completions: { create } } },
    });

    const resultPromise = provider.generateReply(makeInput());

    await vi.advanceTimersByTimeAsync(30_000);

    const result = await resultPromise;

    expect(result.text).toBe('Fallback after retries');
    expect(create).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('treats APIConnectionTimeoutError as transient for retry', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new OpenAI.APIConnectionTimeoutError())
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Recovered' } }] });
    const provider = makeProvider(create, { maxRetries: 1 });

    await expect(provider.generateReply(makeInput())).resolves.toMatchObject({ text: 'Recovered' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('treats APIUserAbortError as transient for retry', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new OpenAI.APIUserAbortError())
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Recovered after abort' } }] });
    const provider = makeProvider(create, { maxRetries: 1 });

    await expect(provider.generateReply(makeInput())).resolves.toMatchObject({ text: 'Recovered after abort' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('all keys exhaust retries without fallback on permanent failure', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('permanent failure'), { status: 400 }));
    const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const provider = new OpenAiCompatibleProvider({
      provider: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'key-1',
      fallbackApiKeys: ['key-2'],
      timeoutMs: 1_000,
      maxRetries: 0,
      logger: logger as never,
      client: { chat: { completions: { create } } },
    });

    await expect(provider.generateReply(makeInput())).rejects.toThrow('permanent failure');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('falls through 10 fallback API keys until one succeeds', async () => {
    const keys = Array.from({ length: 10 }, (_, i) => `fallback-key-${i + 1}`);
    const create = vi.fn();
    for (let i = 0; i < keys.length; i++) {
      create.mockRejectedValueOnce(
        Object.assign(new Error(`key ${i + 1} failed`), { status: 400 }),
      );
    }
    create.mockResolvedValueOnce({
      choices: [{ message: { content: '10th key worked' } }],
    });
    const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const provider = new OpenAiCompatibleProvider({
      provider: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'primary-key',
      fallbackApiKeys: keys,
      timeoutMs: 1_000,
      maxRetries: 0,
      logger: logger as never,
      client: { chat: { completions: { create } } },
    });

    const result = await provider.generateReply(makeInput());

    expect(result.text).toBe('10th key worked');
    expect(create).toHaveBeenCalledTimes(11);
    expect(logger.warn).toHaveBeenCalledTimes(10);
  });

  it('exhausts all 10 fallback API keys and throws', async () => {
    const keys = Array.from({ length: 10 }, (_, i) => `fallback-key-${i + 1}`);
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('all keys exhausted'), { status: 400 }));
    const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const provider = new OpenAiCompatibleProvider({
      provider: 'custom',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'primary-key',
      fallbackApiKeys: keys,
      timeoutMs: 1_000,
      maxRetries: 0,
      logger: logger as never,
      client: { chat: { completions: { create } } },
    });

    await expect(provider.generateReply(makeInput())).rejects.toThrow('all keys exhausted');
    expect(create).toHaveBeenCalledTimes(11);
    expect(logger.warn).toHaveBeenCalledTimes(10);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

function makeProvider(
  create: (request: unknown) => Promise<{
    choices?: Array<{ message?: { content?: string | null } }>;
  }>,
  overrides: { timeoutMs?: number; maxRetries?: number } = {},
) {
  return new OpenAiCompatibleProvider({
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    timeoutMs: overrides.timeoutMs ?? 1_000,
    maxRetries: overrides.maxRetries ?? 0,
    client: {
      chat: {
        completions: {
          create,
        },
      },
    },
  });
}

function makeInput(overrides: { model?: string } = {}) {
  return {
    model: overrides.model ?? 'local-model',
    modelLabel: 'Local Model',
    ownerStylePrompt: 'Short and friendly.',
    messages: [{ direction: 'contact' as const, body: 'Hi' }],
    incomingMessage: 'Are you there?',
  };
}
