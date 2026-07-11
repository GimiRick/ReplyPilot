import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Message } from 'whatsapp-web.js';

import { createLogger, type Logger } from '../../src/runtime/logger';
import { downloadMediaWithRetry } from '../../src/whatsapp/client';

type ClientHandler = (...args: unknown[]) => void;

const mocks = vi.hoisted(() => {
  let latestClient: MockWhatsAppClient | undefined;

  class MockWhatsAppClient {
    readonly handlers = new Map<string, ClientHandler[]>();
    initialize = vi.fn(async () => undefined);
    destroy = vi.fn(async () => {
      this.emit('disconnected', 'LOGOUT');
    });

    on(event: string, handler: ClientHandler): void {
      const existing = this.handlers.get(event) ?? [];
      existing.push(handler);
      this.handlers.set(event, existing);
    }

    emit(event: string, ...args: unknown[]): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
    }
  }

  return {
    MockWhatsAppClient,
    getLatestClient: () => latestClient,
    setLatestClient: (client: MockWhatsAppClient | undefined) => {
      latestClient = client;
    },
    Client: vi.fn(function Client(this: MockWhatsAppClient) {
      const client = new MockWhatsAppClient();
      mocks.setLatestClient(client);
      return client;
    }),
    LocalAuth: vi.fn(),
  };
});

vi.mock('qrcode-terminal', () => ({
  default: { generate: vi.fn() },
}));

vi.mock('node:module', () => ({
  createRequire: () => (specifier: string) => {
    if (specifier === 'whatsapp-web.js') {
      return {
        Client: mocks.Client,
        LocalAuth: mocks.LocalAuth,
      };
    }
    throw new Error(`Unexpected require: ${specifier}`);
  },
}));

describe('loginWhatsAppAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.setLatestClient(undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when destroy emits disconnected after successful authentication', async () => {
    const { loginWhatsAppAccount } = await import('../../src/whatsapp/client');
    const logger = createLogger('error');

    const loginPromise = loginWhatsAppAccount('work-phone', logger);
    const client = mocks.getLatestClient();
    expect(client).toBeDefined();

    client!.emit('ready');
    await vi.advanceTimersByTimeAsync(500);

    await expect(loginPromise).resolves.toBeUndefined();
    expect(client!.destroy).toHaveBeenCalled();
  });

  it('rejects when disconnected happens before authentication completes', async () => {
    const { loginWhatsAppAccount } = await import('../../src/whatsapp/client');
    const logger = createLogger('error');

    const loginPromise = loginWhatsAppAccount('work-phone', logger);
    const client = mocks.getLatestClient();

    client!.emit('disconnected', 'NAVIGATION');

    await expect(loginPromise).rejects.toThrow('WhatsApp disconnected during login: NAVIGATION');
  });

  it('destroys client when initialize fails', async () => {
    const { loginWhatsAppAccount } = await import('../../src/whatsapp/client');
    const logger = createLogger('error');

    mocks.Client.mockImplementationOnce(function Client(
      this: InstanceType<typeof mocks.MockWhatsAppClient>,
    ) {
      const client = new mocks.MockWhatsAppClient();
      client.initialize = vi.fn(async () => {
        throw new Error('browser missing');
      });
      mocks.setLatestClient(client);
      return client;
    });

    const loginPromise = loginWhatsAppAccount('work-phone', logger);
    const client = mocks.getLatestClient();

    await expect(loginPromise).rejects.toThrow('browser missing');
    expect(client!.destroy).toHaveBeenCalled();
  });

  it('rejects unsafe account names before creating a WhatsApp client', async () => {
    const { loginWhatsAppAccount } = await import('../../src/whatsapp/client');
    const logger = createLogger('error');

    await expect(loginWhatsAppAccount('../outside', logger)).rejects.toThrow('may only contain');
    expect(mocks.Client).not.toHaveBeenCalled();
  });
});

describe('downloadMediaWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeMessage(downloadMedia: () => Promise<unknown>): Message {
    return { downloadMedia } as unknown as Message;
  }

  function makeLogger() {
    return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
  }

  it('returns media data on first successful attempt', async () => {
    const message = makeMessage(async () => ({
      data: 'base64data',
      mimetype: 'image/jpeg',
    }));
    const logger = makeLogger();

    const result = await downloadMediaWithRetry(message, logger, 'image/sticker');

    expect(result).toEqual({ data: 'base64data', mimetype: 'image/jpeg' });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('retries on transient failure and returns data on subsequent attempt', async () => {
    let callCount = 0;
    const message = makeMessage(async () => {
      callCount++;
      if (callCount < 2) {
        throw Object.assign(new TypeError('Cannot read properties of undefined'), {
          name: 'TypeError',
        });
      }
      return { data: 'recovered', mimetype: 'image/png' };
    });
    const logger = makeLogger();

    const promise = downloadMediaWithRetry(message, logger, 'image/sticker');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ data: 'recovered', mimetype: 'image/png' });
    expect(callCount).toBe(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 0 }),
      'image/sticker media download failed, retrying...',
    );
  });

  it('returns undefined after all attempts fail', async () => {
    const message = makeMessage(async () => {
      throw Object.assign(new TypeError('consistent failure'), { name: 'TypeError' });
    });
    const logger = makeLogger();

    const promise = downloadMediaWithRetry(message, logger, 'test');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(4);
    expect(logger.warn).toHaveBeenLastCalledWith(
      'test media download failed after 3 attempts, continuing without media data',
    );
  });

  it('returns undefined when downloadMedia returns null', async () => {
    const message = makeMessage(async () => null);
    const logger = makeLogger();

    const result = await downloadMediaWithRetry(message, logger, 'test');

    expect(result).toBeUndefined();
  });

  it('returns undefined when downloadMedia returns object with empty data', async () => {
    const message = makeMessage(async () => ({ data: '', mimetype: 'image/jpeg' }));
    const logger = makeLogger();

    const result = await downloadMediaWithRetry(message, logger, 'test');

    expect(result).toBeUndefined();
  });

  it('returns undefined when downloadMedia returns object with empty mimetype', async () => {
    const message = makeMessage(async () => ({ data: 'base64', mimetype: '' }));
    const logger = makeLogger();

    const result = await downloadMediaWithRetry(message, logger, 'test');

    expect(result).toBeUndefined();
  });

  it('waits 1 second between retries', async () => {
    const message = makeMessage(async () => {
      throw Object.assign(new TypeError('fail'), { name: 'TypeError' });
    });
    const logger = makeLogger();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const promise = downloadMediaWithRetry(message, logger, 'test');
    await vi.runAllTimersAsync();
    await promise;

    const sleepCalls = setTimeoutSpy.mock.calls.filter(
      ([, ms]) => typeof ms === 'number' && ms === 1000,
    );
    expect(sleepCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('includes attempt number and error message in log', async () => {
    const message = makeMessage(async () => {
      throw Object.assign(new TypeError('connection reset'), { name: 'TypeError' });
    });
    const logger = makeLogger();

    const promise = downloadMediaWithRetry(message, logger, 'test');
    await vi.runAllTimersAsync();
    await promise;

    for (let i = 0; i < 3; i++) {
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: i, errMsg: 'connection reset' }),
        'test media download failed, retrying...',
      );
    }
  });

  it('handles non-Error thrown values gracefully', async () => {
    const message = makeMessage(async () => {
      throw 'string error';
    });
    const logger = makeLogger();

    const promise = downloadMediaWithRetry(message, logger, 'test');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errMsg: 'string error' }),
      expect.any(String),
    );
  });
});
