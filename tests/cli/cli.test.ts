import { describe, expect, it, vi } from 'vitest';

import { buildCliProgram, type CliDependencies } from '../../src/cli';
import { ConfigValidationError, MissingConfigError } from '../../src/runtime/errors';
import { makeConfig } from '../fixtures/app-config';

describe('CLI commands', () => {
  it('runs setup and reports saved config', async () => {
    const { program, output, deps } = makeProgram();

    await program.parseAsync(['node', 'replypilot', 'setup']);

    expect(deps.runSetupWizard).toHaveBeenCalled();
    expect(output).toContain('ReplyPilot configuration saved.');
  });

  it('starts setup before start when config is missing', async () => {
    const { program, output, deps } = makeProgram({
      loadConfig: vi.fn(() => {
        throw new MissingConfigError();
      }),
    });

    await program.parseAsync(['node', 'replypilot', 'start']);

    expect(output[0]).toContain('No saved configuration found');
    expect(deps.runSetupWizard).toHaveBeenCalled();
    expect(deps.startAutomation).toHaveBeenCalled();
  });

  it('starts setup before start when saved config is invalid', async () => {
    const { program, output, deps } = makeProgram({
      loadConfig: vi.fn(() => {
        throw new ConfigValidationError('ReplyPilot configuration is invalid.');
      }),
    });

    await program.parseAsync(['node', 'replypilot', 'start']);

    expect(output[0]).toContain('Saved configuration is invalid');
    expect(deps.runSetupWizard).toHaveBeenCalled();
    expect(deps.startAutomation).toHaveBeenCalled();
  });

  it('prints active config name on start', async () => {
    const { program, output } = makeProgram({
      getActiveConfigName: vi.fn(() => 'my-config'),
    });

    await program.parseAsync(['node', 'replypilot', 'start']);

    expect(output).toContain('Using config: my-config');
  });

  it('shows redacted config', async () => {
    const { program, output } = makeProgram({
      loadConfig: vi.fn(() => makeConfig({ llm: { apiKey: 'secret' } })),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'show']);

    expect(output.join('\n')).toContain('[redacted]');
    expect(output.join('\n')).not.toContain('secret');
  });

  it('shows active config name on config show', async () => {
    const { program, output } = makeProgram({
      getActiveConfigName: vi.fn(() => 'my-config'),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'show']);

    expect(output.join('\n')).toContain('Active config: my-config');
  });

  it('reports invalid config on config show', async () => {
    const previousExitCode = process.exitCode;
    const { program, output } = makeProgram({
      loadConfig: vi.fn(() => {
        throw new ConfigValidationError('ReplyPilot configuration is invalid.');
      }),
    });

    try {
      await program.parseAsync(['node', 'replypilot', 'config', 'show']);

      expect(output.join('\n')).toContain('Saved configuration is invalid');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('reports missing config on config show', async () => {
    const previousExitCode = process.exitCode;
    const { program, output } = makeProgram({
      loadConfig: vi.fn(() => {
        throw new MissingConfigError();
      }),
    });

    try {
      await program.parseAsync(['node', 'replypilot', 'config', 'show']);

      expect(output.join('\n')).toContain('No saved configuration found');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('resets config after confirmation', async () => {
    const { program, deps } = makeProgram({
      confirm: vi.fn(async () => true),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'reset']);

    expect(deps.deleteConfig).toHaveBeenCalled();
  });

  it('shows active config name in reset confirmation', async () => {
    const { program, deps } = makeProgram({
      confirm: vi.fn(async () => true),
      getActiveConfigName: vi.fn(() => 'work'),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'reset']);

    expect(deps.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Delete active configuration "work"?' }),
    );
  });

  it('keeps config when reset is cancelled', async () => {
    const { program, output, deps } = makeProgram({
      confirm: vi.fn(async () => false),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'reset']);

    expect(deps.deleteConfig).not.toHaveBeenCalled();
    expect(output).toContain('Config reset cancelled.');
  });

  it('logs out after confirmation', async () => {
    const { program, deps } = makeProgram({
      confirm: vi.fn(async () => true),
    });

    await program.parseAsync(['node', 'replypilot', 'logout']);

    expect(deps.removeWhatsAppSessionData).toHaveBeenCalled();
  });

  it('prints doctor output', async () => {
    const { program, output } = makeProgram();

    await program.parseAsync(['node', 'replypilot', 'doctor']);

    expect(output.join('\n')).toContain('[pass] Node.js');
  });

  it('clears cache after confirmation', async () => {
    const { program, output, deps } = makeProgram({
      confirm: vi.fn(async () => true),
    });

    await program.parseAsync(['node', 'replypilot', 'cache']);

    expect(deps.removeWhatsAppCacheData).toHaveBeenCalled();
    expect(output).toContain('WhatsApp web client cache removed.');
  });

  it('keeps cache when clear is cancelled', async () => {
    const { program, output, deps } = makeProgram({
      confirm: vi.fn(async () => false),
    });

    await program.parseAsync(['node', 'replypilot', 'cache']);

    expect(deps.removeWhatsAppCacheData).not.toHaveBeenCalled();
    expect(output).toContain('Cache clear cancelled.');
  });

  it('reports error when no configs exist for switch', async () => {
    const { program, output } = makeProgram({
      listConfigNames: vi.fn(() => []),
    });

    await program.parseAsync(['node', 'replypilot', 'switch']);

    expect(output.join('\n')).toContain('No configurations found');
    expect(process.exitCode).toBe(1);
  });

  it('reports when only one config exists for switch', async () => {
    const { program, output } = makeProgram({
      listConfigNames: vi.fn(() => ['default']),
    });

    await program.parseAsync(['node', 'replypilot', 'switch']);

    expect(output.join('\n')).toContain('Only one configuration exists: "default".');
  });

  it('switches to selected config', async () => {
    const { program, output, deps } = makeProgram({
      listConfigNames: vi.fn(() => ['work', 'personal']),
      getActiveConfigName: vi.fn(() => 'work'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: vi.fn(async () => 'personal') as any,
    });

    await program.parseAsync(['node', 'replypilot', 'switch']);

    expect(deps.setActiveConfigName).toHaveBeenCalledWith('personal');
    expect(output).toContain('Switched to configuration: personal');
  });
});

function makeProgram(overrides: Partial<CliDependencies> = {}) {
  const output: string[] = [];
  const deps: CliDependencies = {
    runSetupWizard: vi.fn(async () => ({ config: makeConfig(), configName: 'default' })),
    startAutomation: vi.fn(async () => undefined),
    loadConfig: vi.fn(() => makeConfig()),
    deleteConfig: vi.fn(),
    listConfigNames: vi.fn(() => ['default']),
    getActiveConfigName: vi.fn(() => undefined),
    setActiveConfigName: vi.fn(),
    removeWhatsAppSessionData: vi.fn(),
    removeWhatsAppCacheData: vi.fn(),
    runDoctor: vi.fn(async () => ({
      ok: true,
      checks: [{ name: 'Node.js', status: 'pass' as const, message: 'Node is supported.' }],
    })),
    confirm: vi.fn(async () => true),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: vi.fn(async () => 'default') as any,
    output: (message) => output.push(message),
    error: (message) => output.push(message),
    ...overrides,
  };
  const program = buildCliProgram(deps);

  return { program, output, deps };
}
