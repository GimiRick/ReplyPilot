import {
  DEFAULT_APP_CONFIG,
  mergeAppConfig,
  type AppConfig,
  type PartialAppConfig,
} from '../../src/config/schema';

export function makeConfig(overrides?: PartialAppConfig): AppConfig {
  return mergeAppConfig(DEFAULT_APP_CONFIG, overrides);
}
