import http from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

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
    const port = await startServer((req, res) => {
      expect(req.method).toBe('POST');
      expect(req.url).toBe('/v1/chat/completions');

      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        expect(parsed.model).toBe('test-model');
        expect(parsed.messages).toBeDefined();
        expect(Array.isArray(parsed.messages)).toBe(true);

        jsonResponse(res, 200, {
          choices: [{ message: { content: 'Reply: Hello back.' } }],
        });
      });
    });

    const provider = createProvider(port);
    const result = await provider.generateReply(makeInput());

    expect(result.text).toBe('Hello back.');
    expect(result.provider).toBe('test-http');
    expect(result.model).toBe('test-model');
  });

  it('sends the correct Authorization header', async () => {
    const port = await startServer((req, res) => {
      expect(req.headers.authorization).toBe('Bearer test-key');
      jsonResponse(res, 200, {
        choices: [{ message: { content: 'OK' } }],
      });
    });

    const provider = createProvider(port);
    await provider.generateReply(makeInput());
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
});
