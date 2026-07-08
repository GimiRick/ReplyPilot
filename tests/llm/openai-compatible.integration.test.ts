import http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAiCompatibleProvider } from '../../src/llm/openai-compatible';
import { type GenerateReplyInput } from '../../src/llm/provider';
import { ProviderResponseError, ProviderTimeoutError } from '../../src/runtime/errors';

describe('OpenAiCompatibleProvider HTTP integration', () => {
  const servers: http.Server[] = [];

  afterEach(() => {
    for (const server of servers) {
      server.close();
    }
    servers.length = 0;
  });

  async function startServer(
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  ): Promise<number> {
    return new Promise((resolve) => {
      const server = http.createServer(handler);
      server.listen(0, '127.0.0.1', () => {
        servers.push(server);
        resolve((server.address() as { port: number }).port);
      });
    });
  }

  function createProvider(
    port: number,
    overrides: { timeoutMs?: number; maxRetries?: number } = {},
  ): OpenAiCompatibleProvider {
    return new OpenAiCompatibleProvider({
      provider: 'test-http',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: 'test-key',
      timeoutMs: overrides.timeoutMs ?? 10_000,
      maxRetries: overrides.maxRetries ?? 0,
    });
  }

  function makeInput(overrides: Partial<GenerateReplyInput> = {}): GenerateReplyInput {
    return {
      model: 'test-model',
      modelLabel: 'Test Model',
      ownerStylePrompt: 'Be brief.',
      messages: [{ direction: 'contact' as const, body: 'Hi' }],
      incomingMessage: 'Hello?',
      ...overrides,
    };
  }

  function jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  it('performs a full HTTP round-trip and returns cleaned reply text', async () => {
    let requestMethod: string | undefined;
    let requestUrl: string | undefined;
    let requestBody: string | undefined;

    const port = await startServer((req, res) => {
      requestMethod = req.method;
      requestUrl = req.url;

      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        requestBody = body;
        jsonResponse(res, 200, {
          choices: [{ message: { content: 'Reply: Hello back.' } }],
        });
      });
    });

    const provider = createProvider(port);
    const result = await provider.generateReply(makeInput());

    expect(requestMethod).toBe('POST');
    expect(requestUrl).toBe('/v1/chat/completions');
    expect(requestBody).toBeDefined();
    const parsed = JSON.parse(requestBody!);
    expect(parsed.model).toBe('test-model');
    expect(Array.isArray(parsed.messages)).toBe(true);
    expect(result.text).toBe('Hello back.');
    expect(result.provider).toBe('test-http');
    expect(result.model).toBe('test-model');
  });

  it('sends the correct Authorization header', async () => {
    let authHeader: string | undefined;

    const port = await startServer((req, res) => {
      authHeader = req.headers.authorization;
      jsonResponse(res, 200, {
        choices: [{ message: { content: 'OK' } }],
      });
    });

    const provider = createProvider(port);
    await provider.generateReply(makeInput());

    expect(authHeader).toBe('Bearer test-key');
  });

  it('throws ProviderResponseError when choices array is empty', async () => {
    const port = await startServer((_req, res) => {
      jsonResponse(res, 200, { choices: [] });
    });

    const provider = createProvider(port);
    await expect(provider.generateReply(makeInput())).rejects.toThrow(ProviderResponseError);
  });

  it('throws ProviderResponseError when content is empty after cleaning', async () => {
    const port = await startServer((_req, res) => {
      jsonResponse(res, 200, {
        choices: [{ message: { content: '   ' } }],
      });
    });

    const provider = createProvider(port);
    await expect(provider.generateReply(makeInput())).rejects.toThrow(ProviderResponseError);
  });

  it('retries on HTTP 503 and succeeds on second attempt', async () => {
    let attempt = 0;

    const port = await startServer((_req, res) => {
      attempt += 1;
      if (attempt === 1) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service Unavailable' }));
      } else {
        jsonResponse(res, 200, {
          choices: [{ message: { content: 'Recovered' } }],
        });
      }
    });

    const provider = createProvider(port, { maxRetries: 1, timeoutMs: 30_000 });
    const result = await provider.generateReply(makeInput());

    expect(result.text).toBe('Recovered');
    expect(attempt).toBe(2);
  });

  it('throws ProviderTimeoutError when the server does not respond in time', async () => {
    const port = await startServer(() => {
      // Never respond
    });

    const provider = createProvider(port, { timeoutMs: 100, maxRetries: 0 });
    await expect(provider.generateReply(makeInput())).rejects.toThrow(ProviderTimeoutError);
  });

  it('throws when the server returns non-JSON response', async () => {
    const port = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('not json');
    });

    const provider = createProvider(port);
    await expect(provider.generateReply(makeInput())).rejects.toThrow();
  });

  it('falls through primary timeout and HTTP error fallbacks to last success', async () => {
    const usedKeys: string[] = [];

    const port = await startServer((req, res) => {
      const auth = req.headers.authorization ?? '';
      usedKeys.push(auth);

      if (auth.includes('fallback-last')) {
        jsonResponse(res, 200, {
          choices: [{ message: { content: 'OK from fallback' } }],
        });
      } else if (auth.includes('fallback-503')) {
        jsonResponse(res, 503, { error: 'Service Unavailable' });
      } else {
        // primary key: don't respond — will trigger timeout
      }
    });

    const provider = new OpenAiCompatibleProvider({
      provider: 'test-http',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: 'primary-key',
      fallbackApiKeys: ['fallback-503', 'fallback-last'],
      timeoutMs: 300,
      maxRetries: 0,
    });

    const result = await provider.generateReply(makeInput());

    expect(result.text).toBe('OK from fallback');
    expect(usedKeys.length).toBe(3);
    expect(usedKeys[0]).toContain('primary-key');
    expect(usedKeys[1]).toContain('fallback-503');
    expect(usedKeys[2]).toContain('fallback-last');
  }, 30_000);

  it('retries 503 within a single key then falls through to next', async () => {
    const requestLog: { key: string; time: number }[] = [];
    let attemptCount = 0;
    const startTime = Date.now();

    const port = await startServer((req, res) => {
      attemptCount += 1;
      requestLog.push({ key: req.headers.authorization ?? '', time: Date.now() - startTime });

      // Return 503 for the first 3 requests (primary key with 2 retries)
      if (attemptCount <= 3) {
        return jsonResponse(res, 503, { error: 'Service Unavailable' });
      }

      // Fourth request → fallback key succeeds
      jsonResponse(res, 200, {
        choices: [{ message: { content: 'Recovered after retries' } }],
      });
    });

    const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const provider = new OpenAiCompatibleProvider({
      provider: 'test-http',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: 'primary-key',
      fallbackApiKeys: ['fallback-key'],
      timeoutMs: 10_000,
      maxRetries: 2,
      logger,
    });

    const result = await provider.generateReply(makeInput());

    expect(result.text).toBe('Recovered after retries');
    expect(attemptCount).toBe(4);
    expect(logger.warn).toHaveBeenCalled();
  }, 30_000);
});
