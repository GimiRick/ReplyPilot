import fs from 'node:fs';
import path from 'node:path';

import Conf from 'conf';

import { type AppConfig, parseAppConfig } from './schema';
import { MissingConfigError } from '../runtime/errors';

const CONFIG_KEY = 'config';

type StoreShape = {
  config?: AppConfig;
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

export function hasConfig(store: ReplyPilotConfigStore = getConfigStore()): boolean {
  return store.has(CONFIG_KEY);
}

export function loadConfig(store: ReplyPilotConfigStore = getConfigStore()): AppConfig {
  const rawConfig = store.get(CONFIG_KEY);

  if (!rawConfig) {
    throw new MissingConfigError();
  }

  return parseAppConfig(rawConfig);
}

export function tryLoadConfig(
  store: ReplyPilotConfigStore = getConfigStore(),
): AppConfig | undefined {
  return hasConfig(store) ? loadConfig(store) : undefined;
}

export function saveConfig(
  config: AppConfig,
  store: ReplyPilotConfigStore = getConfigStore(),
): void {
  store.set(CONFIG_KEY, parseAppConfig(config));
}

export function deleteConfig(store: ReplyPilotConfigStore = getConfigStore()): void {
  store.delete(CONFIG_KEY);
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
