import { execSync } from 'node:child_process';

import { type AppConfig, parseAppConfig } from '../config/schema';
import { tryLoadConfig } from '../config/store';

export type DoctorCheckStatus = 'pass' | 'warn' | 'fail';

export type DoctorCheck = {
  name: string;
  status: DoctorCheckStatus;
  message: string;
};

export type DoctorReport = {
  ok: boolean;
  checks: DoctorCheck[];
};

export type DoctorOptions = {
  config?: AppConfig | null;
  providerReachabilityCheck?: (config: AppConfig) => Promise<boolean>;
  nodeVersionCheck?: (version: string) => boolean;
};

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const checkNode = options.nodeVersionCheck ?? isSupportedNodeVersion;
  const nodeOk = checkNode(process.versions.node);
  checks.push({
    name: 'Node.js',
    status: nodeOk ? 'pass' : 'fail',
    message: nodeOk
      ? `Node ${process.versions.node} is supported.`
      : `Node ${process.versions.node} is not supported. Use Node >=22.13.0.`,
  });

  let config: AppConfig | undefined | null;
  let configLoadFailed = false;

  try {
    config = options.config === undefined ? tryLoadConfig() : options.config;
  } catch {
    config = null;
    configLoadFailed = true;
  }

  if (!config) {
    checks.push({
      name: 'Config',
      status: configLoadFailed ? 'fail' : 'warn',
      message: configLoadFailed
        ? 'Saved config is invalid. Run replypilot setup to replace it.'
        : 'No saved config found. Run replypilot setup.',
    });

    if (configLoadFailed) {
      return { ok: false, checks };
    }

    return {
      ok: checks.every((check) => check.status !== 'fail'),
      checks,
    };
  }

  try {
    parseAppConfig(config);
    checks.push({
      name: 'Config',
      status: 'pass',
      message: 'Saved config is valid.',
    });
  } catch {
    checks.push({
      name: 'Config',
      status: 'fail',
      message: 'Saved config is invalid.',
    });
  }

  const providerReachable = await (options.providerReachabilityCheck ?? checkProviderReachability)(
    config,
  );
  checks.push({
    name: 'Provider',
    status: providerReachable ? 'pass' : 'warn',
    message: providerReachable
      ? `${config.llm.modelLabel} endpoint is reachable.`
      : `${config.llm.modelLabel} endpoint could not be reached.`,
  });

  checks.push({
    name: 'Package',
    status: 'pass',
    message: 'Package metadata and runtime modules are available.',
  });

  const voiceMode = config.voiceNote?.mode;
  if (voiceMode && voiceMode !== 'ignore') {
    const ffmpegOk = checkFfmpeg();
    checks.push({
      name: 'FFmpeg',
      status: ffmpegOk ? 'pass' : 'warn',
      message: ffmpegOk
        ? 'ffmpeg is available for audio conversion.'
        : 'ffmpeg not found. Voice note processing requires ffmpeg.',
    });
  }

  return {
    ok: checks.every((check) => check.status !== 'fail'),
    checks,
  };
}

export async function checkProviderReachability(config: AppConfig): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(new URL('models', ensureTrailingSlash(config.llm.baseUrl)), {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function formatDoctorReport(report: DoctorReport): string {
  return report.checks
    .map((check) => `${statusIcon(check.status)} ${check.name}: ${check.message}`)
    .join('\n');
}

export function isSupportedNodeVersion(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map((v) => parseInt(v, 10));

  if (major > 22) {
    return true;
  }

  if (major < 22) {
    return false;
  }

  if (minor > 13) {
    return true;
  }

  return minor === 13;
}

function checkFfmpeg(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function statusIcon(status: DoctorCheckStatus): string {
  if (status === 'pass') {
    return '[pass]';
  }

  if (status === 'warn') {
    return '[warn]';
  }

  return '[fail]';
}
