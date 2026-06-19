import { describe, expect, it } from 'vitest';

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

    await expect(checkProviderReachability(makeConfig())).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://localhost:1234/v1/models'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer lm-studio' },
      }),
    );
    globalThis.fetch = originalFetch;
  });

  it('returns false when provider reachability throws', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    await expect(checkProviderReachability(makeConfig())).resolves.toBe(false);

    globalThis.fetch = originalFetch;
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
