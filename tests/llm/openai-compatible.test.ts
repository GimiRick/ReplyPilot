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

  it('does not retry 429 rate-limited errors', async () => {
    const create = vi.fn().mockRejectedValue(
      Object.assign(new Error('rate limited'), { statusCode: 429 }),
    );
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
    expect(create).toHaveBeenCalledTimes(1);
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
    const create = vi.fn()
      .mockRejectedValueOnce(new ProviderTimeoutError(1000))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Recovered' } }] });
    const provider = makeProvider(create, { maxRetries: 1 });
    await expect(provider.generateReply(makeInput())).resolves.toMatchObject({ text: 'Recovered' });
  });

  it('retries when error is APITimeoutError', async () => {
    const create = vi.fn()
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
