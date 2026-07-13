import fs from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import Conf from 'conf';

import { type AppConfig, parseAppConfig, WHATSAPP_ACCOUNT_NAME_REGEX } from './schema';
import { MissingConfigError, ConfigNotFoundError } from '../runtime/errors';

const CONFIG_KEY = 'config';
const CONFIGS_KEY = 'configs';
const ACTIVE_CONFIG_KEY = 'activeConfig';

const CONFIG_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const DEFAULT_CONFIG_NAME = 'default';
const LOCAL_AUTH_SESSION_PREFIX = 'session-';

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

export function validateWhatsAppAccountName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('WhatsApp account name cannot be empty.');
  }
  if (!WHATSAPP_ACCOUNT_NAME_REGEX.test(trimmed)) {
    throw new Error(
      'WhatsApp account name may only contain letters, numbers, hyphens, and underscores.',
    );
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

function applyEnvOverrides(config: AppConfig): AppConfig {
  const envApiKey = process.env.OPENAI_API_KEY?.trim();
  const envBaseUrl = process.env.OPENAI_BASE_URL?.trim();
  if (!envApiKey && !envBaseUrl) return config;
  return {
    ...config,
    llm: {
      ...config.llm,
      ...(envApiKey ? { apiKey: envApiKey } : {}),
      ...(envBaseUrl ? { baseUrl: envBaseUrl } : {}),
    },
  };
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

  return applyEnvOverrides(parseAppConfig(configs[name]));
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
): boolean {
  ensureMigrated(store);
  const configs = store.get(CONFIGS_KEY) ?? {};
  const name = configName ?? getActiveConfigName(store);

  if (!name) {
    throw new MissingConfigError();
  }

  if (!configs[name]) {
    if (store.get(ACTIVE_CONFIG_KEY) === name) {
      store.delete(ACTIVE_CONFIG_KEY);
    }
    return false;
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

  return true;
}

function resolveConfigName(
  configName: string | undefined,
  store: ReplyPilotConfigStore,
  configs: Record<string, AppConfig>,
): string | undefined {
  if (configName) {
    return validateConfigName(configName);
  }
  const active = store.get(ACTIVE_CONFIG_KEY);
  if (active) return active;
  const firstKey = Object.keys(configs)[0];
  if (firstKey) {
    store.set(ACTIVE_CONFIG_KEY, firstKey);
    return firstKey;
  }
  return undefined;
}

export function getActiveWhatsAppAccount(
  store: ReplyPilotConfigStore = getConfigStore(),
): string | undefined {
  const accountName = store.get('activeWhatsAppAccount');
  if (!accountName) {
    return undefined;
  }

  try {
    const normalized = normalizeStoredWhatsAppAccount(accountName, store);
    if (normalized !== accountName) {
      store.set('activeWhatsAppAccount', normalized);
    }
    return normalized;
  } catch {
    store.delete('activeWhatsAppAccount');
    return undefined;
  }
}

export function setActiveWhatsAppAccount(
  name: string,
  store: ReplyPilotConfigStore = getConfigStore(),
): void {
  const trimmed = validateWhatsAppAccountName(name);
  store.set('activeWhatsAppAccount', trimmed);
}

export function listWhatsAppAccounts(store: ReplyPilotConfigStore = getConfigStore()): string[] {
  const dir = getWhatsAppSessionDir(store);
  try {
    const accounts = new Set<string>();

    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!dirent.isDirectory()) {
        continue;
      }

      const accountName = accountNameFromSessionDirName(dirent.name);
      if (accountName) {
        accounts.add(accountName);
      }
    }

    return [...accounts];
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

export async function removeWhatsAppSessionData(store: ReplyPilotConfigStore = getConfigStore()): Promise<void> {
  await rm(getWhatsAppSessionDir(store), { recursive: true, force: true });
}

export async function removeWhatsAppSessionAccount(
  accountName: string,
  store: ReplyPilotConfigStore = getConfigStore(),
): Promise<void> {
  const sessionRoot = getWhatsAppSessionDir(store);
  const trimmed = validateWhatsAppAccountName(accountName);
  await rm(path.join(sessionRoot, sessionDirNameForAccount(trimmed)), {
    recursive: true,
    force: true,
  });
  if (!trimmed.startsWith(LOCAL_AUTH_SESSION_PREFIX)) {
    await rm(path.join(sessionRoot, trimmed), { recursive: true, force: true });
  }
}

export function clearActiveWhatsAppAccount(store: ReplyPilotConfigStore = getConfigStore()): void {
  store.delete('activeWhatsAppAccount');
}

export function clearActiveConfigName(store: ReplyPilotConfigStore = getConfigStore()): void {
  store.delete(ACTIVE_CONFIG_KEY);
}

export function getWhatsAppCacheDir(): string {
  return path.join(process.cwd(), '.wwebjs_cache');
}

export async function removeWhatsAppCacheData(): Promise<void> {
  await rm(getWhatsAppCacheDir(), { recursive: true, force: true });
}

function sessionDirNameForAccount(accountName: string): string {
  return `${LOCAL_AUTH_SESSION_PREFIX}${accountName}`;
}

function accountNameFromSessionDirName(dirName: string): string | undefined {
  const accountName = dirName.startsWith(LOCAL_AUTH_SESSION_PREFIX)
    ? dirName.slice(LOCAL_AUTH_SESSION_PREFIX.length)
    : dirName;

  try {
    return validateWhatsAppAccountName(accountName);
  } catch {
    return undefined;
  }
}

function normalizeStoredWhatsAppAccount(
  accountName: string,
  store: ReplyPilotConfigStore,
): string {
  const trimmed = validateWhatsAppAccountName(accountName);

  if (!trimmed.startsWith(LOCAL_AUTH_SESSION_PREFIX)) {
    return trimmed;
  }

  const sessionRoot = getWhatsAppSessionDir(store);
  const expectedDirForStoredName = path.join(sessionRoot, sessionDirNameForAccount(trimmed));
  const rawStoredDir = path.join(sessionRoot, trimmed);

  if (fs.existsSync(rawStoredDir) && !fs.existsSync(expectedDirForStoredName)) {
    const unprefixed = trimmed.slice(LOCAL_AUTH_SESSION_PREFIX.length);
    return validateWhatsAppAccountName(unprefixed);
  }

  return trimmed;
}
