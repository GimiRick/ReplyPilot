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
});
