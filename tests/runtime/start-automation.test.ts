import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeConfig } from '../fixtures/app-config';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  onMessage: vi.fn(),
  start: vi.fn(),
  WhatsAppClientAdapter: vi.fn(),
}));

vi.mock('../../src/config/store', async () => ({
  ...(await vi.importActual<typeof import('../../src/config/store')>('../../src/config/store')),
  loadConfig: mocks.loadConfig,
}));

vi.mock('../../src/whatsapp/client', () => ({
  WhatsAppClientAdapter: mocks.WhatsAppClientAdapter,
}));

vi.mock('../../src/llm/openai-compatible', () => ({
  OpenAiCompatibleProvider: vi.fn(function OpenAiCompatibleProviderMock() {
    return {
      generateReply: vi.fn().mockResolvedValue({ text: 'mocked', provider: 'test', model: 'test' }),
    };
  }),
}));

describe('startAutomation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockReturnValue(makeConfig());
    mocks.WhatsAppClientAdapter.mockImplementation(function WhatsAppClientAdapterMock() {
      return {
        onMessage: mocks.onMessage,
        start: mocks.start,
      };
    });
    mocks.start.mockResolvedValue(undefined);
  });

  it('wires config, WhatsApp client, and message handler', async () => {
    const { startAutomation } = await import('../../src/runtime/automation');

    await startAutomation({ safety: { dryRun: true } });

    expect(mocks.loadConfig).toHaveBeenCalled();
    expect(mocks.WhatsAppClientAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ safety: expect.objectContaining({ dryRun: true }) }),
      expect.anything(),
    );
    expect(mocks.onMessage).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.start).toHaveBeenCalled();
  });

  it('prints session expiry message on EBUSY error', async () => {
    const previousExitCode = process.exitCode;
    const error = new Error("EBUSY: resource busy or locked, unlink '...first_party_sets.db'");
    mocks.start.mockRejectedValue(error);

    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((message) => errors.push(String(message)));

    const { startAutomation } = await import('../../src/runtime/automation');
    
    try {
      await startAutomation();

      expect(errors.join('\n')).toContain('Your WhatsApp session has expired or is corrupted.');
      expect(errors.join('\n')).toContain('replypilot logout');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
      vi.restoreAllMocks();
    }
  });

  it('prints generic error message on non-session failure', async () => {
    const previousExitCode = process.exitCode;
    const error = new Error('Failed to launch browser process');
    mocks.start.mockRejectedValue(error);

    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((message) => errors.push(String(message)));

    const { startAutomation } = await import('../../src/runtime/automation');
    
    try {
      await startAutomation();

      expect(errors.join('\n')).toContain('Failed to launch browser process');
      expect(errors.join('\n')).not.toContain('Your WhatsApp session has expired');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
      vi.restoreAllMocks();
    }
  });

  it('registers graceful shutdown handler and calls stop on client', async () => {
    const processOn = vi.spyOn(process, 'on').mockImplementation(() => process);
    const processExit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as (...args: unknown[]) => never);

    const stopMock = vi.fn().mockResolvedValue(undefined);
    mocks.WhatsAppClientAdapter.mockImplementation(function WhatsAppClientAdapterMock() {
      return {
        onMessage: mocks.onMessage,
        start: mocks.start,
        stop: stopMock,
      };
    });

    const { startAutomation } = await import('../../src/runtime/automation');
    
    try {
      await startAutomation();
      
      const sigintCall = processOn.mock.calls.find(c => c[0] === 'SIGINT');
      expect(sigintCall).toBeDefined();
      
      const shutdown = sigintCall![1] as () => Promise<void>;
      await shutdown();
      
      expect(stopMock).toHaveBeenCalled();
      expect(processExit).toHaveBeenCalledWith(0);
    } finally {
      processOn.mockRestore();
      processExit.mockRestore();
    }
  });

  it('handles errors during graceful shutdown', async () => {
    const processOn = vi.spyOn(process, 'on').mockImplementation(() => process);
    const processExit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as (...args: unknown[]) => never);

    const stopMock = vi.fn().mockRejectedValue(new Error('stop failed'));
    mocks.WhatsAppClientAdapter.mockImplementation(function WhatsAppClientAdapterMock() {
      return {
        onMessage: mocks.onMessage,
        start: mocks.start,
        stop: stopMock,
      };
    });

    const { startAutomation } = await import('../../src/runtime/automation');
    
    try {
      await startAutomation();
      
      const sigintCall = processOn.mock.calls.find(c => c[0] === 'SIGINT');
      const shutdown = sigintCall![1] as () => Promise<void>;
      await shutdown();
      
      expect(stopMock).toHaveBeenCalled();
      expect(processExit).toHaveBeenCalledWith(0);
    } finally {
      processOn.mockRestore();
      processExit.mockRestore();
    }
  });

  it('passes messages from whatsapp to automation handler', async () => {
    const { startAutomation } = await import('../../src/runtime/automation');
    await startAutomation({ automation: { debounceMs: 0 } });
    
    const onMessageCallback = mocks.onMessage.mock.calls[0][0];
    
    const message = {
      id: '123',
      chatId: 'c1',
      timestamp: 1000,
      body: 'hello',
      fetchContext: async () => [],
      sendMessage: async () => {},
    };
    
    await expect(onMessageCallback(message)).resolves.toBeUndefined();
  });
});
