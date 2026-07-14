import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  clearActiveConfigName,
  clearActiveWhatsAppAccount,
  createConfigStore,
  deleteConfig,
  getActiveConfigName,
  getActiveWhatsAppAccount,
  getConfigFilePath,
  getReplyPilotDataDir,
  getWhatsAppCacheDir,
  getWhatsAppSessionDir,
  hasConfig,
  listConfigNames,
  listWhatsAppAccounts,
  loadConfig,
  removeWhatsAppCacheData,
  removeWhatsAppSessionAccount,
  removeWhatsAppSessionData,
  saveConfig,
  setActiveConfigName,
  setActiveWhatsAppAccount,
  tryLoadConfig,
  validateConfigName,
  validateWhatsAppAccountName,
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

  it('removes WhatsApp session data', async () => {
    const store = createTempStore();
    const sessionDir = getWhatsAppSessionDir(store);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'session-file'), 'session');

    await removeWhatsAppSessionData(store);

    expect(fs.existsSync(sessionDir)).toBe(false);
  });

  it('removes a single WhatsApp account session', async () => {
    const store = createTempStore();
    const sessionDir = getWhatsAppSessionDir(store);
    fs.mkdirSync(path.join(sessionDir, 'session-work'), { recursive: true });
    fs.mkdirSync(path.join(sessionDir, 'session-personal'), { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'session-work', 'session.data'), 'dummy');
    fs.writeFileSync(path.join(sessionDir, 'session-personal', 'session.data'), 'dummy');

    await removeWhatsAppSessionAccount('work', store);

    expect(fs.existsSync(path.join(sessionDir, 'session-work'))).toBe(false);
    expect(fs.existsSync(path.join(sessionDir, 'session-personal'))).toBe(true);
  });

  it('removeWhatsAppSessionAccount does not throw for missing account', async () => {
    const store = createTempStore();
    await expect(removeWhatsAppSessionAccount('nonexistent', store)).resolves.toBeUndefined();
  });

  it('removes legacy unprefixed WhatsApp account session directories', async () => {
    const store = createTempStore();
    const sessionDir = getWhatsAppSessionDir(store);
    fs.mkdirSync(path.join(sessionDir, 'work'), { recursive: true });

    await removeWhatsAppSessionAccount('work', store);

    expect(fs.existsSync(path.join(sessionDir, 'work'))).toBe(false);
  });

  it('does not remove another account when account name starts with session prefix', async () => {
    const store = createTempStore();
    const sessionDir = getWhatsAppSessionDir(store);
    fs.mkdirSync(path.join(sessionDir, 'session-work'), { recursive: true });
    fs.mkdirSync(path.join(sessionDir, 'session-session-work'), { recursive: true });

    await removeWhatsAppSessionAccount('session-work', store);

    expect(fs.existsSync(path.join(sessionDir, 'session-session-work'))).toBe(false);
    expect(fs.existsSync(path.join(sessionDir, 'session-work'))).toBe(true);
  });

  it('returns the WhatsApp web cache directory path', () => {
    const cacheDir = getWhatsAppCacheDir();
    expect(cacheDir).toBe(path.join(process.cwd(), '.wwebjs_cache'));
  });

  it('removes the WhatsApp web cache directory', async () => {
    const cacheDir = getWhatsAppCacheDir();
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'test-cache-entry'), 'data');
    expect(fs.existsSync(cacheDir)).toBe(true);

    await removeWhatsAppCacheData();

    expect(fs.existsSync(cacheDir)).toBe(false);
  });

  it('clears the active WhatsApp account', () => {
    const store = createTempStore();

    setActiveWhatsAppAccount('work-phone', store);
    expect(getActiveWhatsAppAccount(store)).toBe('work-phone');

    clearActiveWhatsAppAccount(store);
    expect(getActiveWhatsAppAccount(store)).toBeUndefined();
  });

  it('handles invalid stored WhatsApp account name gracefully', () => {
    const store = createTempStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (store as any).set('activeWhatsAppAccount', 'invalid name with spaces');

    const result = getActiveWhatsAppAccount(store);

    expect(result).toBeUndefined();
  });

  it('clearActiveWhatsAppAccount is safe when no account is set', () => {
    const store = createTempStore();
    expect(getActiveWhatsAppAccount(store)).toBeUndefined();
    expect(() => clearActiveWhatsAppAccount(store)).not.toThrow();
    expect(getActiveWhatsAppAccount(store)).toBeUndefined();
  });

  it('clearActiveConfigName clears the active config name', () => {
    const store = createTempStore();
    saveConfig(makeConfig(), 'my-config', store);
    setActiveConfigName('my-config', store);
    expect(getActiveConfigName(store)).toBe('my-config');

    clearActiveConfigName(store);
    expect(getActiveConfigName(store)).toBeUndefined();
  });

  it('clearActiveConfigName is safe when no config is set', () => {
    const store = createTempStore();
    expect(getActiveConfigName(store)).toBeUndefined();
    expect(() => clearActiveConfigName(store)).not.toThrow();
    expect(getActiveConfigName(store)).toBeUndefined();
  });

  it('tracks active WhatsApp account', () => {
    const store = createTempStore();

    expect(getActiveWhatsAppAccount(store)).toBeUndefined();

    setActiveWhatsAppAccount('work-phone', store);
    expect(getActiveWhatsAppAccount(store)).toBe('work-phone');

    setActiveWhatsAppAccount('personal', store);
    expect(getActiveWhatsAppAccount(store)).toBe('personal');
  });

  it('rejects empty WhatsApp account name', () => {
    const store = createTempStore();

    expect(() => setActiveWhatsAppAccount('', store)).toThrow('empty');
    expect(() => setActiveWhatsAppAccount('   ', store)).toThrow('empty');
  });

  it('rejects unsafe WhatsApp account names', async () => {
    const store = createTempStore();

    expect(() => setActiveWhatsAppAccount('../outside', store)).toThrow('may only contain');
    expect(() => setActiveWhatsAppAccount('my account', store)).toThrow('may only contain');
    await expect(removeWhatsAppSessionAccount('../outside', store)).rejects.toThrow(
      'may only contain',
    );
  });

  it('lists WhatsApp accounts from session directory', () => {
    const store = createTempStore();
    const sessionDir = getWhatsAppSessionDir(store);

    expect(listWhatsAppAccounts(store)).toEqual([]);

    fs.mkdirSync(sessionDir, { recursive: true });
    expect(listWhatsAppAccounts(store)).toEqual([]);

    fs.mkdirSync(path.join(sessionDir, 'session-work-phone'));
    fs.mkdirSync(path.join(sessionDir, 'session-personal'));
    fs.mkdirSync(path.join(sessionDir, 'session-invalid name'));
    fs.writeFileSync(path.join(sessionDir, 'config.json'), 'ignored');

    const accounts = listWhatsAppAccounts(store).sort();
    expect(accounts).toEqual(['personal', 'work-phone']);
  });

  it('proves end-to-end: filesystem listing -> store -> clientId fallback', () => {
    const store = createTempStore();
    const sessionDir = getWhatsAppSessionDir(store);

    fs.mkdirSync(path.join(sessionDir, 'session-main-phone'), { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'session-main-phone', 'session.data'), 'dummy');

    const accounts = listWhatsAppAccounts(store);
    expect(accounts).toContain('main-phone');

    setActiveWhatsAppAccount('main-phone', store);
    expect(getActiveWhatsAppAccount(store)).toBe('main-phone');

    const activeAccount = getActiveWhatsAppAccount(store);
    const configSessionName = 'some-config-session';
    const clientId = activeAccount ?? configSessionName;
    expect(clientId).toBe('main-phone');

    const sessionPath = path.join(sessionDir, `session-${clientId}`);
    expect(fs.existsSync(sessionPath)).toBe(true);
    expect(fs.existsSync(path.join(sessionPath, 'session.data'))).toBe(true);
  });

  it('normalizes a previously stored prefixed active WhatsApp account', () => {
    const store = createTempStore();
    const sessionDir = getWhatsAppSessionDir(store);

    fs.mkdirSync(path.join(sessionDir, 'session-main-phone'), { recursive: true });
    setActiveWhatsAppAccount('session-main-phone', store);

    expect(getActiveWhatsAppAccount(store)).toBe('main-phone');
  });

  it('proves end-to-end: filesystem listing -> undefined account -> config fallback -> default', () => {
    const store = createTempStore();
    const sessionDir = getWhatsAppSessionDir(store);

    fs.mkdirSync(path.join(sessionDir, 'session-fallback-phone'), { recursive: true });

    expect(getActiveWhatsAppAccount(store)).toBeUndefined();
    const configSessionName = 'fallback-phone';
    const clientId = getActiveWhatsAppAccount(store) ?? configSessionName;
    expect(clientId).toBe('fallback-phone');

    const sessionPath = path.join(sessionDir, `session-${clientId}`);
    expect(fs.existsSync(sessionPath)).toBe(true);
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

  it('validates WhatsApp account names', () => {
    expect(validateWhatsAppAccountName('my-account')).toBe('my-account');
    expect(validateWhatsAppAccountName('  work  ')).toBe('work');
    expect(() => validateWhatsAppAccountName('')).toThrow('empty');
    expect(() => validateWhatsAppAccountName('account/name')).toThrow('may only contain');
    expect(() => validateWhatsAppAccountName('.hidden')).toThrow('may only contain');
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

  it('returns false when deleting a non-existent config', () => {
    const store = createTempStore();

    saveConfig(makeConfig({}), 'existing', store);

    expect(deleteConfig('nonexistent', store)).toBe(false);
    expect(getActiveConfigName(store)).toBe('existing');
  });

  it('clears stale active config pointer when config is externally removed', () => {
    const store = createTempStore();

    saveConfig(makeConfig({}), 'stale-config', store);
    setActiveConfigName('stale-config', store);
    expect(getActiveConfigName(store)).toBe('stale-config');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (store as any).set('configs', {});

    const result = deleteConfig('stale-config', store);

    expect(result).toBe(false);
    expect(getActiveConfigName(store)).toBeUndefined();
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

  it('applies OPENAI_API_KEY and OPENAI_BASE_URL environment variables', () => {
    const store = createTempStore();
    const configKey = 'with-default-keys';
    const defaultApiKey = 'default-key';
    const defaultBaseUrl = 'https://default.example/v1';

    saveConfig(
      makeConfig({ llm: { apiKey: defaultApiKey, baseUrl: defaultBaseUrl } }),
      configKey,
      store,
    );

    process.env.OPENAI_API_KEY = 'env-override-key';
    process.env.OPENAI_BASE_URL = 'https://env-override.example/v1';

    try {
      const loaded = loadConfig(configKey, store);

      expect(loaded.llm.apiKey).toBe('env-override-key');
      expect(loaded.llm.baseUrl).toBe('https://env-override.example/v1');
    } finally {
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_BASE_URL;
    }
  });

  it('applies only OPENAI_API_KEY env var when BASE_URL is not set', () => {
    const store = createTempStore();
    const defaultApiKey = 'default-key';
    const defaultBaseUrl = 'https://default.example/v1';

    saveConfig(
      makeConfig({ llm: { apiKey: defaultApiKey, baseUrl: defaultBaseUrl } }),
      'key-only',
      store,
    );

    process.env.OPENAI_API_KEY = 'api-key-override';
    delete process.env.OPENAI_BASE_URL;

    try {
      const loaded = loadConfig('key-only', store);

      expect(loaded.llm.apiKey).toBe('api-key-override');
      expect(loaded.llm.baseUrl).toBe(defaultBaseUrl);
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it('skips env var overrides when neither variable is set', () => {
    const store = createTempStore();
    const defaultApiKey = 'default-key';
    const defaultBaseUrl = 'https://default.example/v1';

    saveConfig(
      makeConfig({ llm: { apiKey: defaultApiKey, baseUrl: defaultBaseUrl } }),
      'no-env',
      store,
    );

    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;

    const loaded = loadConfig('no-env', store);

    expect(loaded.llm.apiKey).toBe(defaultApiKey);
    expect(loaded.llm.baseUrl).toBe(defaultBaseUrl);
  });

  it('trims whitespace from env var overrides', () => {
    const store = createTempStore();
    saveConfig(
      makeConfig({ llm: { apiKey: 'key', baseUrl: 'https://example.com/v1' } }),
      'trim',
      store,
    );

    process.env.OPENAI_API_KEY = '  trimmed-key  ';
    process.env.OPENAI_BASE_URL = '  https://trimmed.example/v1  ';

    try {
      const loaded = loadConfig('trim', store);

      expect(loaded.llm.apiKey).toBe('trimmed-key');
      expect(loaded.llm.baseUrl).toBe('https://trimmed.example/v1');
    } finally {
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_BASE_URL;
    }
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
