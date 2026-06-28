import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createConfigStore,
  deleteConfig,
  getActiveConfigName,
  getConfigFilePath,
  getReplyPilotDataDir,
  getWhatsAppSessionDir,
  hasConfig,
  listConfigNames,
  loadConfig,
  removeWhatsAppSessionData,
  saveConfig,
  setActiveConfigName,
  tryLoadConfig,
  validateConfigName,
} from '../../src/config/store';
import { ConfigNotFoundError, MissingConfigError } from '../../src/runtime/errors';
import { makeConfig } from '../fixtures/app-config';

describe('config store', () => {
  it('saves, loads, and deletes config', () => {
    const store = createTempStore();

    expect(hasConfig(undefined, store)).toBe(false);
    expect(tryLoadConfig(undefined, store)).toBeUndefined();
    expect(() => loadConfig(undefined, store)).toThrow(MissingConfigError);

    saveConfig(makeConfig({ context: { messageCount: 12 } }), undefined, store);

    expect(hasConfig(undefined, store)).toBe(true);
    expect(loadConfig(undefined, store).context.messageCount).toBe(12);

    deleteConfig(undefined, store);

    expect(hasConfig(undefined, store)).toBe(false);
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

  it('validates config names', () => {
    expect(validateConfigName('my-config')).toBe('my-config');
    expect(validateConfigName('  work  ')).toBe('work');
    expect(validateConfigName('default')).toBe('default');
    expect(() => validateConfigName('')).toThrow('Config name cannot be empty.');
    expect(() => validateConfigName('   ')).toThrow('Config name cannot be empty.');
    expect(() => validateConfigName('my config')).toThrow('may only contain');
    expect(() => validateConfigName('config/foo')).toThrow('may only contain');
    expect(() => validateConfigName('.hidden')).toThrow('may only contain');
  });

  it('saves and loads named configs', () => {
    const store = createTempStore();

    saveConfig(makeConfig({ context: { messageCount: 5 } }), 'work', store);
    saveConfig(makeConfig({ context: { messageCount: 10 } }), 'personal', store);

    expect(hasConfig('work', store)).toBe(true);
    expect(hasConfig('personal', store)).toBe(true);
    expect(hasConfig('missing', store)).toBe(false);

    expect(loadConfig('work', store).context.messageCount).toBe(5);
    expect(loadConfig('personal', store).context.messageCount).toBe(10);
  });

  it('lists config names', () => {
    const store = createTempStore();

    expect(listConfigNames(store)).toEqual([]);

    saveConfig(makeConfig({}), 'alpha', store);
    saveConfig(makeConfig({}), 'beta', store);

    expect(listConfigNames(store).sort()).toEqual(['alpha', 'beta']);
  });

  it('tracks and switches active config', () => {
    const store = createTempStore();

    saveConfig(makeConfig({}), 'one', store);
    expect(getActiveConfigName(store)).toBe('one');

    saveConfig(makeConfig({}), 'two', store);
    expect(getActiveConfigName(store)).toBe('two');

    setActiveConfigName('one', store);
    expect(getActiveConfigName(store)).toBe('one');

    expect(() => setActiveConfigName('missing', store)).toThrow(ConfigNotFoundError);
  });

  it('loads active config when no name given', () => {
    const store = createTempStore();

    saveConfig(makeConfig({ context: { messageCount: 99 } }), 'active-one', store);
    saveConfig(makeConfig({ context: { messageCount: 1 } }), 'other', store);

    setActiveConfigName('other', store);
    expect(loadConfig(undefined, store).context.messageCount).toBe(1);

    setActiveConfigName('active-one', store);
    expect(loadConfig(undefined, store).context.messageCount).toBe(99);
  });

  it('deletes named config without affecting others', () => {
    const store = createTempStore();

    saveConfig(makeConfig({}), 'a', store);
    saveConfig(makeConfig({}), 'b', store);

    deleteConfig('a', store);

    expect(hasConfig('a', store)).toBe(false);
    expect(hasConfig('b', store)).toBe(true);
  });

  it('falls back to another config when active is deleted', () => {
    const store = createTempStore();

    saveConfig(makeConfig({}), 'first', store);
    saveConfig(makeConfig({}), 'second', store);

    setActiveConfigName('first', store);
    deleteConfig('first', store);

    expect(getActiveConfigName(store)).toBe('second');
  });

  it('migrates old single config format on first access', () => {
    const store = createTempStore();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (store as any).set('config', makeConfig({ context: { messageCount: 42 } }));

    expect(hasConfig(undefined, store)).toBe(true);
    expect(loadConfig(undefined, store).context.messageCount).toBe(42);
    expect(getActiveConfigName(store)).toBe('default');
    expect(listConfigNames(store)).toEqual(['default']);
  });

  it('migrates old config only if default key does not exist', () => {
    const store = createTempStore();

    saveConfig(makeConfig({ context: { messageCount: 1 } }), 'default', store);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (store as any).set('config', makeConfig({ context: { messageCount: 99 } }));

    expect(loadConfig(undefined, store).context.messageCount).toBe(1);
  });

  it('overwrites config when saving with same name', () => {
    const store = createTempStore();

    saveConfig(makeConfig({}), 'work', store);
    saveConfig(makeConfig({}), 'work', store);

    expect(listConfigNames(store).filter((n) => n === 'work').length).toBe(1);
  });

  it('preserves very long personality prompts through save and load', () => {
    const store = createTempStore();
    const longPrompt = 'Be helpful, concise, and use a warm tone.'.repeat(500);
    expect(longPrompt.length).toBeGreaterThan(10000);

    saveConfig(makeConfig({ personality: { ownerStylePrompt: longPrompt } }), 'work', store);
    const loaded = loadConfig('work', store);

    expect(loaded.personality.ownerStylePrompt).toBe(longPrompt);
    expect(loaded.personality.ownerStylePrompt.length).toBe(longPrompt.length);
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
