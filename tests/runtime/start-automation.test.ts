import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeConfig } from '../fixtures/app-config';
import { HealthServer } from '../../src/runtime/health-server';

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  getActiveWhatsAppAccount: vi.fn<() => string | undefined>(() => undefined),
  onMessage: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  WhatsAppClientAdapter: vi.fn(),
}));

vi.mock('../../src/config/store', async () => ({
  ...(await vi.importActual<typeof import('../../src/config/store')>('../../src/config/store')),
  loadConfig: mocks.loadConfig,
  getActiveWhatsAppAccount: mocks.getActiveWhatsAppAccount,
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
    vi.spyOn(globalThis, 'setInterval').mockReturnValue(123 as unknown as NodeJS.Timeout);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});
    mocks.loadConfig.mockReturnValue(makeConfig());
    mocks.WhatsAppClientAdapter.mockImplementation(function WhatsAppClientAdapterMock() {
      return {
        onMessage: mocks.onMessage,
        start: mocks.start,
        stop: mocks.stop,
      };
    });
    mocks.start.mockResolvedValue(undefined);
    mocks.stop.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wires config, WhatsApp client, and message handler', async () => {
    const { startAutomation } = await import('../../src/runtime/automation');

    await startAutomation({ safety: { dryRun: true } });

    expect(mocks.loadConfig).toHaveBeenCalled();
    expect(mocks.getActiveWhatsAppAccount).toHaveBeenCalled();
    expect(mocks.WhatsAppClientAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ safety: expect.objectContaining({ dryRun: true }) }),
      expect.anything(),
      undefined,
    );
    expect(mocks.onMessage).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.start).toHaveBeenCalled();
  });

  it('passes active WhatsApp account to WhatsApp client', async () => {
    mocks.getActiveWhatsAppAccount.mockReturnValue('work-phone');
    const { startAutomation } = await import('../../src/runtime/automation');

    await startAutomation({ safety: { dryRun: true } });

    expect(mocks.getActiveWhatsAppAccount).toHaveBeenCalledTimes(1);
    expect(mocks.WhatsAppClientAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ safety: expect.objectContaining({ dryRun: true }) }),
      expect.anything(),
      'work-phone',
    );
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

      const sigintCall = processOn.mock.calls.find((c) => c[0] === 'SIGINT');
      expect(sigintCall).toBeDefined();

      const shutdown = sigintCall![1] as () => Promise<void>;
      await shutdown();

      expect(stopMock).toHaveBeenCalled();
    } finally {
      processOn.mockRestore();
    }
  });

  it('handles errors during graceful shutdown', async () => {
    const processOn = vi.spyOn(process, 'on').mockImplementation(() => process);

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

      const sigintCall = processOn.mock.calls.find((c) => c[0] === 'SIGINT');
      const shutdown = sigintCall![1] as () => Promise<void>;
      await shutdown();

      expect(stopMock).toHaveBeenCalled();
    } finally {
      processOn.mockRestore();
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

  it('triggers force exit on shutdown timeout', async () => {
    vi.useFakeTimers();
    try {
      const processOn = vi.spyOn(process, 'on').mockImplementation(() => process);
      const processExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const { startAutomation } = await import('../../src/runtime/automation');
      vi.spyOn(console, 'error').mockImplementation(() => {});

      mocks.WhatsAppClientAdapter.mockImplementation(function WhatsAppClientAdapterMock() {
        return {
          onMessage: mocks.onMessage,
          start: vi.fn().mockResolvedValue(undefined),
          stop: vi.fn(async () => {
            // Simulate slow shutdown that exceeds timeout
            await new Promise((resolve) => setTimeout(resolve, 20000));
          }),
        };
      });

      await startAutomation({ automation: { shutdownTimeoutMs: 1000 } });

      const sigintCall = processOn.mock.calls.find((c) => c[0] === 'SIGINT');
      const shutdown = sigintCall![1] as () => Promise<void>;
      shutdown();

      await vi.advanceTimersByTimeAsync(2000);
      await vi.runAllTimersAsync();

      expect(processExit).toHaveBeenCalledWith(1);
      processOn.mockRestore();
      processExit.mockRestore();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('stops health server on graceful shutdown', async () => {
    const processOn = vi.spyOn(process, 'on').mockImplementation(() => process);
    const healthStopSpy = vi.spyOn(HealthServer.prototype, 'stop');

    const { startAutomation } = await import('../../src/runtime/automation');

    try {
      await startAutomation({}, 0);

      const sigintCall = processOn.mock.calls.find((c) => c[0] === 'SIGINT');
      const shutdown = sigintCall![1] as () => Promise<void>;
      await shutdown();

      expect(healthStopSpy).toHaveBeenCalled();
    } finally {
      healthStopSpy.mockRestore();
      processOn.mockRestore();
    }
  });

  it('displays status bar metrics during automation', async () => {
    vi.useFakeTimers();
    try {
      const { startAutomation } = await import('../../src/runtime/automation');
      const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      mocks.WhatsAppClientAdapter.mockImplementation(function WhatsAppClientAdapterMock() {
        return {
          onMessage: mocks.onMessage,
          start: vi.fn().mockResolvedValue(undefined),
          stop: vi.fn().mockResolvedValue(undefined),
        };
      });

      await startAutomation({ automation: { debounceMs: 0 } });

      await vi.advanceTimersByTimeAsync(1500);

      expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('LLM calls'));
      stderrWrite.mockRestore();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('stops health server on WhatsApp connection failure', async () => {
    const previousExitCode = process.exitCode;
    const error = new Error('Failed to launch browser process');
    mocks.start.mockRejectedValue(error);

    const stopSpy = vi.spyOn(HealthServer.prototype, 'stop');
    const startSpy = vi.spyOn(HealthServer.prototype, 'start');
    const offSpy = vi.spyOn(process, 'off');

    try {
      const { startAutomation } = await import('../../src/runtime/automation');
      await startAutomation({}, 0);

      expect(startSpy).toHaveBeenCalled();
      expect(stopSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(offSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      if (process.platform !== 'win32') {
        expect(offSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      }
    } finally {
      process.exitCode = previousExitCode;
      stopSpy.mockRestore();
      startSpy.mockRestore();
      offSpy.mockRestore();
    }
  });
});
