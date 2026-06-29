import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from '../../src/runtime/logger';

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
    await vi.advanceTimersByTimeAsync(2000);

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

    mocks.Client.mockImplementationOnce(function Client(this: InstanceType<typeof mocks.MockWhatsAppClient>) {
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
});
