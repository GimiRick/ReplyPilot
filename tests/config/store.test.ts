import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createConfigStore,
  deleteConfig,
  getConfigFilePath,
  getReplyPilotDataDir,
  getWhatsAppSessionDir,
  hasConfig,
  loadConfig,
  removeWhatsAppSessionData,
  saveConfig,
  tryLoadConfig,
} from '../../src/config/store';
import { MissingConfigError } from '../../src/runtime/errors';
import { makeConfig } from '../fixtures/app-config';

describe('config store', () => {
  it('saves, loads, and deletes config', () => {
    const store = createTempStore();

    expect(hasConfig(store)).toBe(false);
    expect(tryLoadConfig(store)).toBeUndefined();
    expect(() => loadConfig(store)).toThrow(MissingConfigError);

    saveConfig(makeConfig({ context: { messageCount: 12 } }), store);

    expect(hasConfig(store)).toBe(true);
    expect(loadConfig(store).context.messageCount).toBe(12);

    deleteConfig(store);

    expect(hasConfig(store)).toBe(false);
  });

  it('exposes config and WhatsApp session paths', () => {
    const store = createTempStore();
    const sessionDir = getWhatsAppSessionDir(store);

    expect(getConfigFilePath(store)).toContain('config.json');
    expect(getReplyPilotDataDir(store)).toBe(path.dirname(getConfigFilePath(store)));
    expect(sessionDir).toContain('whatsapp-sessions');
  });

  it('removes WhatsApp session data', () => {
    const store = createTempStore();
    const sessionDir = getWhatsAppSessionDir(store);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'session-file'), 'session');

    removeWhatsAppSessionData(store);

    expect(fs.existsSync(sessionDir)).toBe(false);
  });

  it('reuses the default config store instance', async () => {
    const { getConfigStore } = await import('../../src/config/store');

    expect(getConfigStore()).toBe(getConfigStore());
  });
});

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function createTempStore() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'replypilot-store-'));
  tempDirs.push(cwd);
  return createConfigStore({ cwd, projectName: 'replypilot-test' });
}
