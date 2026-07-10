import { describe, expect, it, vi } from 'vitest';
import { execSync } from 'node:child_process';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => Buffer.from('')),
}));

import {
  checkProviderReachability,
  formatDoctorReport,
  isSupportedNodeVersion,
  runDoctor,
} from '../../src/doctor/doctor';
import { makeConfig } from '../fixtures/app-config';

describe('doctor checks', () => {
  it('checks supported Node versions', () => {
    expect(isSupportedNodeVersion('22.13.0')).toBe(true);
    expect(isSupportedNodeVersion('22.14.0')).toBe(true);
    expect(isSupportedNodeVersion('24.0.0')).toBe(true);
    expect(isSupportedNodeVersion('20.11.1')).toBe(false);
    expect(isSupportedNodeVersion('22.12.9')).toBe(false);
  });

  it('detects unsupported Node version', async () => {
    const report = await runDoctor({
      config: makeConfig(),
      providerReachabilityCheck: async () => true,
      nodeVersionCheck: () => false,
    });

    expect(report.checks).toContainEqual(
      expect.objectContaining({ name: 'Node.js', status: 'fail' }),
    );
  });

  it('warns when config is missing', async () => {
    const report = await runDoctor({ config: null });

    expect(report.checks.some((check) => check.name === 'Config')).toBe(true);
    expect(formatDoctorReport(report)).toContain('[warn] Config');
  });

  it('reports provider reachability', async () => {
    const report = await runDoctor({
      config: makeConfig(),
      providerReachabilityCheck: async () => true,
      nodeVersionCheck: () => true,
    });

    expect(report.ok).toBe(true);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        name: 'Provider',
        status: 'pass',
      }),
    );
  });

  it('normalizes base URL with trailing slash via ensureTrailingSlash', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('fetch error'));

    try {
      const result = await checkProviderReachability(
        makeConfig({ llm: { baseUrl: 'http://localhost:9999/api' } }),
      );

      expect(result).toBe(false);
      expect(spy.mock.calls[0][0].toString()).toBe(
        'http://localhost:9999/api/models',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('marks invalid config as failed', async () => {
    const report = await runDoctor({
      config: { ...makeConfig(), llm: { ...makeConfig().llm, modelName: '' } },
      providerReachabilityCheck: async () => false,
      nodeVersionCheck: () => true,
    });

    expect(report.ok).toBe(false);
    expect(formatDoctorReport(report)).toContain('[fail] Config');
    expect(formatDoctorReport(report)).toContain('[warn] Provider');
  });

  it('checks provider reachability through the models endpoint', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    try {
      await expect(checkProviderReachability(makeConfig())).resolves.toBe(true);

      expect(fetchMock).toHaveBeenCalledWith(
        new URL('http://localhost:1234/v1/models'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer lm-studio' },
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns false when provider reachability throws', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    try {
      await expect(checkProviderReachability(makeConfig())).resolves.toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles tryLoadConfig throwing an error', async () => {
    const storeModule = await import('../../src/config/store');
    const spy = vi.spyOn(storeModule, 'tryLoadConfig').mockImplementation(() => {
      throw new Error('corrupted');
    });

    try {
      const report = await runDoctor();

      expect(report.ok).toBe(false);
      expect(report.checks.some((c) => c.name === 'Config' && c.status === 'fail')).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('reports ffmpeg availability when voice notes are enabled', async () => {
    const report = await runDoctor({
      config: makeConfig({ voiceNote: { mode: 'whisper_cloud', whisperModel: 'whisper-1' } }),
      providerReachabilityCheck: async () => true,
      nodeVersionCheck: () => true,
    });

    expect(report.checks.some((c) => c.name === 'FFmpeg')).toBe(true);
  });

  it('reports ffmpeg for whisper_local mode', async () => {
    const report = await runDoctor({
      config: makeConfig({ voiceNote: { mode: 'whisper_local', whisperModel: 'whisper-1' } }),
      providerReachabilityCheck: async () => true,
      nodeVersionCheck: () => true,
    });

    expect(report.checks.some((c) => c.name === 'FFmpeg')).toBe(true);
  });

  it('reports ffmpeg for native_audio mode', async () => {
    const report = await runDoctor({
      config: makeConfig({ voiceNote: { mode: 'native_audio', whisperModel: 'whisper-1' } }),
      providerReachabilityCheck: async () => true,
      nodeVersionCheck: () => true,
    });

    expect(report.checks.some((c) => c.name === 'FFmpeg')).toBe(true);
  });

  it('does not check ffmpeg when voice note mode is ignore', async () => {
    const report = await runDoctor({
      config: makeConfig({ voiceNote: { mode: 'ignore', whisperModel: 'whisper-1' } }),
      providerReachabilityCheck: async () => true,
      nodeVersionCheck: () => true,
    });

    expect(report.checks.some((c) => c.name === 'FFmpeg')).toBe(false);
  });

  it('reports warning when ffmpeg is not installed', async () => {
    vi.mocked(execSync).mockImplementationOnce(() => {
      throw new Error('not found');
    });

    const report = await runDoctor({
      config: makeConfig({ voiceNote: { mode: 'whisper_cloud', whisperModel: 'whisper-1' } }),
      providerReachabilityCheck: async () => true,
      nodeVersionCheck: () => true,
    });

    const ffmpegCheck = report.checks.find((c) => c.name === 'FFmpeg');
    expect(ffmpegCheck?.status).toBe('warn');
    expect(ffmpegCheck?.message).toContain('ffmpeg not found');
  });

  it('uses default providerReachabilityCheck when omitted', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const storeModule = await import('../../src/config/store');
    const spyStore = vi.spyOn(storeModule, 'tryLoadConfig').mockReturnValue(makeConfig());

    try {
      const report = await runDoctor({ nodeVersionCheck: () => true });
      expect(report.checks.find((c) => c.name === 'Provider')?.status).toBe('pass');
    } finally {
      globalThis.fetch = originalFetch;
      spyStore.mockRestore();
    }
  });

  it('formats failure icons', () => {
    expect(
      formatDoctorReport({
        ok: false,
        checks: [{ name: 'Example', status: 'fail', message: 'Nope.' }],
      }),
    ).toBe('[fail] Example: Nope.');
  });
});
