import fs from 'node:fs';
import path from 'node:path';

import Conf from 'conf';

import { type AppConfig, parseAppConfig } from './schema';
import { MissingConfigError, ConfigNotFoundError } from '../runtime/errors';

const CONFIG_KEY = 'config';
const CONFIGS_KEY = 'configs';
const ACTIVE_CONFIG_KEY = 'activeConfig';

const CONFIG_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const DEFAULT_CONFIG_NAME = 'default';

type StoreShape = {
  config?: AppConfig;
  configs?: Record<string, AppConfig>;
  activeConfig?: string;
  activeWhatsAppAccount?: string;
};

export type ReplyPilotConfigStore = Conf<StoreShape>;

let defaultStore: ReplyPilotConfigStore | undefined;

export function createConfigStore(options: { cwd?: string; projectName?: string } = {}) {
  return new Conf<StoreShape>({
    projectName: options.projectName ?? 'replypilot',
    cwd: options.cwd,
  });
}

export function getConfigStore(): ReplyPilotConfigStore {
  defaultStore ??= createConfigStore();
  return defaultStore;
}

function ensureMigrated(store: ReplyPilotConfigStore): void {
  const oldConfig = store.get(CONFIG_KEY);
  if (oldConfig) {
    const configs = store.get(CONFIGS_KEY) ?? {};
    if (!configs[DEFAULT_CONFIG_NAME]) {
      store.set(CONFIGS_KEY, { ...configs, [DEFAULT_CONFIG_NAME]: oldConfig });
    }
    if (!store.get(ACTIVE_CONFIG_KEY)) {
      store.set(ACTIVE_CONFIG_KEY, DEFAULT_CONFIG_NAME);
    }
    store.delete(CONFIG_KEY);
  }
}

export function validateConfigName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Config name cannot be empty.');
  }
  if (!CONFIG_NAME_REGEX.test(trimmed)) {
    throw new Error('Config name may only contain letters, numbers, hyphens, and underscores.');
  }
  return trimmed;
}

export function listConfigNames(store: ReplyPilotConfigStore = getConfigStore()): string[] {
  ensureMigrated(store);
  const configs = store.get(CONFIGS_KEY) ?? {};
  return Object.keys(configs);
}

export function getActiveConfigName(
  store: ReplyPilotConfigStore = getConfigStore(),
): string | undefined {
  ensureMigrated(store);
  return store.get(ACTIVE_CONFIG_KEY);
}

export function setActiveConfigName(
  name: string,
  store: ReplyPilotConfigStore = getConfigStore(),
): void {
  const trimmed = validateConfigName(name);
  const configs = store.get(CONFIGS_KEY) ?? {};
  if (!configs[trimmed]) {
    throw new ConfigNotFoundError(trimmed);
  }
  store.set(ACTIVE_CONFIG_KEY, trimmed);
}

export function hasConfig(
  configName?: string,
  store: ReplyPilotConfigStore = getConfigStore(),
): boolean {
  ensureMigrated(store);
  const configs = store.get(CONFIGS_KEY) ?? {};
  const name = resolveConfigName(configName, store, configs);
  if (!name) return false;
  return name in configs;
}

export function loadConfig(
  configName?: string,
  store: ReplyPilotConfigStore = getConfigStore(),
): AppConfig {
  ensureMigrated(store);
  const configs = store.get(CONFIGS_KEY) ?? {};
  const name = resolveConfigName(configName, store, configs);

  if (!name || !configs[name]) {
    if (configName) {
      throw new ConfigNotFoundError(configName);
    }
    throw new MissingConfigError();
  }

  return parseAppConfig(configs[name]);
}

export function tryLoadConfig(
  configName?: string,
  store: ReplyPilotConfigStore = getConfigStore(),
): AppConfig | undefined {
  try {
    return loadConfig(configName, store);
  } catch (error) {
    if (error instanceof MissingConfigError || error instanceof ConfigNotFoundError) {
      return undefined;
    }
    throw error;
  }
}

export function saveConfig(
  config: AppConfig,
  configName?: string,
  store: ReplyPilotConfigStore = getConfigStore(),
): void {
  ensureMigrated(store);
  const configs = store.get(CONFIGS_KEY) ?? {};
  const name = configName ?? getActiveConfigName(store) ?? DEFAULT_CONFIG_NAME;
  const trimmed = validateConfigName(name);

  store.set(CONFIGS_KEY, { ...configs, [trimmed]: parseAppConfig(config) });
  store.set(ACTIVE_CONFIG_KEY, trimmed);
}

export function deleteConfig(
  configName?: string,
  store: ReplyPilotConfigStore = getConfigStore(),
): void {
  ensureMigrated(store);
  const configs = store.get(CONFIGS_KEY) ?? {};
  const name = configName ?? getActiveConfigName(store);

  if (!name) {
    throw new MissingConfigError();
  }

  if (!configs[name]) {
    return;
  }

  const updated = { ...configs };
  delete updated[name];
  store.set(CONFIGS_KEY, updated);

  if (store.get(ACTIVE_CONFIG_KEY) === name) {
    const remaining = Object.keys(updated);
    if (remaining.length > 0) {
      store.set(ACTIVE_CONFIG_KEY, remaining[0]);
    } else {
      store.delete(ACTIVE_CONFIG_KEY);
    }
  }
}

function resolveConfigName(
  configName: string | undefined,
  store: ReplyPilotConfigStore,
  configs: Record<string, AppConfig>,
): string | undefined {
  if (configName) {
    return validateConfigName(configName);
  }
  return store.get(ACTIVE_CONFIG_KEY) ?? (Object.keys(configs)[0] || undefined);
}

export function getActiveWhatsAppAccount(
  store: ReplyPilotConfigStore = getConfigStore(),
): string | undefined {
  return store.get('activeWhatsAppAccount');
}

export function setActiveWhatsAppAccount(
  name: string,
  store: ReplyPilotConfigStore = getConfigStore(),
): void {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('WhatsApp account name cannot be empty.');
  }
  store.set('activeWhatsAppAccount', trimmed);
}

export function listWhatsAppAccounts(store: ReplyPilotConfigStore = getConfigStore()): string[] {
  const dir = getWhatsAppSessionDir(store);
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  } catch {
    return [];
  }
}

export function getConfigFilePath(store: ReplyPilotConfigStore = getConfigStore()): string {
  return store.path;
}

export function getReplyPilotDataDir(store: ReplyPilotConfigStore = getConfigStore()): string {
  return path.dirname(store.path);
}

export function getWhatsAppSessionDir(store: ReplyPilotConfigStore = getConfigStore()): string {
  return path.join(getReplyPilotDataDir(store), 'whatsapp-sessions');
}

export function removeWhatsAppSessionData(store: ReplyPilotConfigStore = getConfigStore()): void {
  fs.rmSync(getWhatsAppSessionDir(store), { recursive: true, force: true });
}

export function removeWhatsAppSessionAccount(
  accountName: string,
  store: ReplyPilotConfigStore = getConfigStore(),
): void {
  const dir = path.join(getWhatsAppSessionDir(store), accountName);
  fs.rmSync(dir, { recursive: true, force: true });
}

export function clearActiveWhatsAppAccount(store: ReplyPilotConfigStore = getConfigStore()): void {
  store.delete('activeWhatsAppAccount');
}

export function getWhatsAppCacheDir(): string {
  return path.join(process.cwd(), '.wwebjs_cache');
}

export function removeWhatsAppCacheData(): void {
  fs.rmSync(getWhatsAppCacheDir(), { recursive: true, force: true });
}
