import { describe, expect, it, vi } from 'vitest';

import { buildCliProgram, type CliDependencies } from '../../src/cli';
import { ConfigValidationError, MissingConfigError } from '../../src/runtime/errors';
import { makeConfig } from '../fixtures/app-config';
import type { Logger } from '../../src/runtime/logger';

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

  it('resets a single config after confirmation', async () => {
    const { program, output, deps } = makeProgram({
      listConfigNames: vi.fn(() => ['default']),
      confirm: vi.fn(async () => true),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'reset']);

    expect(deps.deleteConfig).toHaveBeenCalledWith('default');
    expect(output).toContain('Configuration "default" deleted.');
  });

  it('shows config name in reset confirmation for single config', async () => {
    const { program, deps } = makeProgram({
      listConfigNames: vi.fn(() => ['work']),
      confirm: vi.fn(async () => true),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'reset']);

    expect(deps.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Delete configuration "work"?' }),
    );
  });

  it('keeps config when reset is cancelled', async () => {
    const { program, output, deps } = makeProgram({
      listConfigNames: vi.fn(() => ['default']),
      confirm: vi.fn(async () => false),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'reset']);

    expect(deps.deleteConfig).not.toHaveBeenCalled();
    expect(output).toContain('Config reset cancelled.');
  });

  it('reports when no configs exist for reset', async () => {
    const previousExitCode = process.exitCode;
    const { program, output } = makeProgram({
      listConfigNames: vi.fn(() => []),
    });

    try {
      await program.parseAsync(['node', 'replypilot', 'config', 'reset']);

      expect(output.join('\n')).toContain('No saved configuration found');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('resets a selected config from multiple', async () => {
    const { program, output, deps } = makeProgram({
      listConfigNames: vi.fn(() => ['work', 'personal']),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: vi.fn(async () => 'personal') as any,
      confirm: vi.fn(async () => true),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'reset']);

    expect(deps.deleteConfig).toHaveBeenCalledWith('personal');
    expect(output).toContain('Configuration "personal" deleted.');
  });

  it('resets all configurations', async () => {
    const { program, output, deps } = makeProgram({
      listConfigNames: vi.fn(() => ['work', 'personal']),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: vi.fn(async () => '__all__') as any,
      confirm: vi.fn(async () => true),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'reset']);

    expect(deps.deleteConfig).toHaveBeenCalledTimes(2);
    expect(deps.deleteConfig).toHaveBeenCalledWith('work');
    expect(deps.deleteConfig).toHaveBeenCalledWith('personal');
    expect(output).toContain('All configurations deleted.');
  });

  it('cancels multi-config reset', async () => {
    const { program, output, deps } = makeProgram({
      listConfigNames: vi.fn(() => ['work', 'personal']),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: vi.fn(async () => '__all__') as any,
      confirm: vi.fn(async () => false),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'reset']);

    expect(deps.deleteConfig).not.toHaveBeenCalled();
    expect(output).toContain('Config reset cancelled.');
  });

  it('logs out a single WhatsApp account after confirmation', async () => {
    const { program, output, deps } = makeProgram({
      listWhatsAppAccounts: vi.fn(() => ['default']),
      confirm: vi.fn(async () => true),
    });

    await program.parseAsync(['node', 'replypilot', 'logout']);

    expect(deps.removeWhatsAppSessionAccount).toHaveBeenCalledWith('default');
    expect(output).toContain('WhatsApp account "default" logged out.');
  });

  it('reports when no WhatsApp accounts exist for logout', async () => {
    const { program, output } = makeProgram({
      listWhatsAppAccounts: vi.fn(() => []),
    });

    await program.parseAsync(['node', 'replypilot', 'logout']);

    expect(output.join('\n')).toContain('No WhatsApp accounts to logout.');
  });

  it('cancels logout of a single account', async () => {
    const { program, output, deps } = makeProgram({
      listWhatsAppAccounts: vi.fn(() => ['default']),
      confirm: vi.fn(async () => false),
    });

    await program.parseAsync(['node', 'replypilot', 'logout']);

    expect(deps.removeWhatsAppSessionAccount).not.toHaveBeenCalled();
    expect(output).toContain('Logout cancelled.');
  });

  it('logs out a selected WhatsApp account from multiple', async () => {
    const { program, output, deps } = makeProgram({
      listWhatsAppAccounts: vi.fn(() => ['work', 'personal']),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: vi.fn(async () => 'work') as any,
      confirm: vi.fn(async () => true),
    });

    await program.parseAsync(['node', 'replypilot', 'logout']);

    expect(deps.removeWhatsAppSessionAccount).toHaveBeenCalledWith('work');
    expect(output).toContain('WhatsApp account "work" logged out.');
  });

  it('clears active account when logging out the active account', async () => {
    const { program, deps } = makeProgram({
      listWhatsAppAccounts: vi.fn(() => ['work', 'personal']),
      getActiveWhatsAppAccount: vi.fn(() => 'work'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: vi.fn(async () => 'work') as any,
      confirm: vi.fn(async () => true),
    });

    await program.parseAsync(['node', 'replypilot', 'logout']);

    expect(deps.clearActiveWhatsAppAccount).toHaveBeenCalled();
  });

  it('logs out all WhatsApp accounts', async () => {
    const { program, output, deps } = makeProgram({
      listWhatsAppAccounts: vi.fn(() => ['work', 'personal']),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: vi.fn(async () => '__all__') as any,
      confirm: vi.fn(async () => true),
    });

    await program.parseAsync(['node', 'replypilot', 'logout']);

    expect(deps.removeWhatsAppSessionData).toHaveBeenCalled();
    expect(deps.clearActiveWhatsAppAccount).toHaveBeenCalled();
    expect(output).toContain('All WhatsApp session data removed.');
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

  it('clears everything after confirmation', async () => {
    const { program, output, deps } = makeProgram({
      listConfigNames: vi.fn(() => ['work', 'personal']),
      confirm: vi.fn(async () => true),
      exec: vi.fn(() => ({ stdout: '', stderr: '' })),
    });

    await program.parseAsync(['node', 'replypilot', 'clear']);

    expect(deps.exec).toHaveBeenCalledWith('npm cache clean --force');
    expect(deps.deleteConfig).toHaveBeenCalledWith('work');
    expect(deps.deleteConfig).toHaveBeenCalledWith('personal');
    expect(deps.clearActiveWhatsAppAccount).toHaveBeenCalled();
    expect(deps.removeWhatsAppSessionData).toHaveBeenCalled();
    expect(deps.removeWhatsAppCacheData).toHaveBeenCalled();
    expect(output).toContain('npm cache cleared.');
    expect(output).toContain('All configurations deleted.');
    expect(output).toContain('All WhatsApp accounts removed.');
    expect(output).toContain('WhatsApp web client cache cleared.');
    expect(output).toContain('ReplyPilot has been fully cleared.');
  });

  it('cancels clear when not confirmed', async () => {
    const { program, output, deps } = makeProgram({
      confirm: vi.fn(async () => false),
    });

    await program.parseAsync(['node', 'replypilot', 'clear']);

    expect(deps.exec).not.toHaveBeenCalled();
    expect(deps.deleteConfig).not.toHaveBeenCalled();
    expect(deps.removeWhatsAppSessionData).not.toHaveBeenCalled();
    expect(deps.removeWhatsAppCacheData).not.toHaveBeenCalled();
    expect(output).toContain('Clear cancelled.');
  });

  it('handles npm cache failure gracefully', async () => {
    const { program, output, deps } = makeProgram({
      listConfigNames: vi.fn(() => []),
      confirm: vi.fn(async () => true),
      exec: vi.fn(() => {
        throw new Error('npm not found');
      }),
    });

    await program.parseAsync(['node', 'replypilot', 'clear']);

    expect(output.join('\n')).toContain('npm cache could not be cleared');
    expect(deps.deleteConfig).not.toHaveBeenCalled();
    expect(deps.removeWhatsAppSessionData).toHaveBeenCalled();
  });

  it('reports error when no configs exist for switch', async () => {
    const previousExitCode = process.exitCode;
    const { program, output } = makeProgram({
      listConfigNames: vi.fn(() => []),
    });

    try {
      await program.parseAsync(['node', 'replypilot', 'config', 'switch']);

      expect(output.join('\n')).toContain('No configurations found');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('reports when only one config exists for switch', async () => {
    const { program, output } = makeProgram({
      listConfigNames: vi.fn(() => ['default']),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'switch']);

    expect(output.join('\n')).toContain('Only one configuration exists: "default".');
  });

  it('switches to selected config', async () => {
    const { program, output, deps } = makeProgram({
      listConfigNames: vi.fn(() => ['work', 'personal']),
      getActiveConfigName: vi.fn(() => 'work'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: vi.fn(async () => 'personal') as any,
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'switch']);

    expect(deps.setActiveConfigName).toHaveBeenCalledWith('personal');
    expect(output).toContain('Switched to configuration: personal');
  });

  it('runs login and sets account active', async () => {
    const { program, output, deps } = makeProgram({
      listWhatsAppAccounts: vi.fn(() => []),
      input: vi.fn(async () => 'work-account') as unknown as CliDependencies['input'],
    });

    await program.parseAsync(['node', 'replypilot', 'login']);

    expect(deps.loginWhatsAppAccount).toHaveBeenCalledWith('work-account', expect.anything());
    expect(deps.setActiveWhatsAppAccount).toHaveBeenCalledWith('work-account');
    expect(output).toContain('Account "work-account" is now active.');
  });

  it('rejects duplicate WhatsApp account name', async () => {
    let validateResult: string | true | undefined;
    const { program, deps } = makeProgram({
      listWhatsAppAccounts: vi.fn(() => ['existing-account']),
      input: vi.fn(
        async (config: { message: string; validate?: (value: string) => true | string }) => {
          validateResult = config.validate?.('existing-account');
          return 'different-name';
        },
      ) as unknown as CliDependencies['input'],
    });

    await program.parseAsync(['node', 'replypilot', 'login']);

    expect(validateResult).toBe('An account named "existing-account" already exists.');
    expect(deps.loginWhatsAppAccount).toHaveBeenCalledWith('different-name', expect.anything());
  });

  it('reports error when no accounts exist for account switch', async () => {
    const previousExitCode = process.exitCode;
    const { program, output } = makeProgram({
      listWhatsAppAccounts: vi.fn(() => []),
    });

    try {
      await program.parseAsync(['node', 'replypilot', 'account', 'switch']);

      expect(output.join('\n')).toContain('No WhatsApp accounts found');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('reports when only one account exists for account switch', async () => {
    const { program, output } = makeProgram({
      listWhatsAppAccounts: vi.fn(() => ['default']),
    });

    await program.parseAsync(['node', 'replypilot', 'account', 'switch']);

    expect(output.join('\n')).toContain('Only one WhatsApp account exists: "default".');
  });

  it('switches to selected WhatsApp account', async () => {
    const { program, output, deps } = makeProgram({
      listWhatsAppAccounts: vi.fn(() => ['work', 'personal']),
      getActiveWhatsAppAccount: vi.fn(() => 'work'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: vi.fn(async () => 'personal') as any,
    });

    await program.parseAsync(['node', 'replypilot', 'account', 'switch']);

    expect(deps.setActiveWhatsAppAccount).toHaveBeenCalledWith('personal');
    expect(output).toContain('Switched to WhatsApp account: personal');
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
    removeWhatsAppSessionAccount: vi.fn(),
    clearActiveWhatsAppAccount: vi.fn(),
    removeWhatsAppCacheData: vi.fn(),
    runDoctor: vi.fn(async () => ({
      ok: true,
      checks: [{ name: 'Node.js', status: 'pass' as const, message: 'Node is supported.' }],
    })),
    loginWhatsAppAccount: vi.fn(async (_name: string, _logger: Logger) => {
      void _name;
      void _logger;
    }),
    getActiveWhatsAppAccount: vi.fn(() => undefined),
    setActiveWhatsAppAccount: vi.fn(),
    listWhatsAppAccounts: vi.fn(() => []),
    confirm: vi.fn(async () => true),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: vi.fn(async () => 'default') as any,
    input: vi.fn(async () => 'test-account') as unknown as CliDependencies['input'],
    exec: vi.fn(() => ({ stdout: '', stderr: '' })),
    output: (message) => output.push(message),
    error: (message) => output.push(message),
    ...overrides,
  };
  const program = buildCliProgram(deps);

  return { program, output, deps };
}
