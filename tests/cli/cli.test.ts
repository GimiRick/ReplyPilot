import { describe, expect, it, vi } from 'vitest';

import { buildCliProgram, type CliDependencies } from '../../src/cli';
import { MissingConfigError } from '../../src/runtime/errors';
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

  it('shows redacted config', async () => {
    const { program, output } = makeProgram({
      loadConfig: vi.fn(() => makeConfig({ llm: { apiKey: 'secret' } })),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'show']);

    expect(output.join('\n')).toContain('[redacted]');
    expect(output.join('\n')).not.toContain('secret');
  });

  it('resets config after confirmation', async () => {
    const { program, deps } = makeProgram({
      confirm: vi.fn(async () => true),
    });

    await program.parseAsync(['node', 'replypilot', 'config', 'reset']);

    expect(deps.deleteConfig).toHaveBeenCalled();
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
});

function makeProgram(overrides: Partial<CliDependencies> = {}) {
  const output: string[] = [];
  const deps: CliDependencies = {
    runSetupWizard: vi.fn(async () => makeConfig()),
    startAutomation: vi.fn(async () => undefined),
    loadConfig: vi.fn(() => makeConfig()),
    deleteConfig: vi.fn(),
    removeWhatsAppSessionData: vi.fn(),
    runDoctor: vi.fn(async () => ({
      ok: true,
      checks: [{ name: 'Node.js', status: 'pass' as const, message: 'Node is supported.' }],
    })),
    confirm: vi.fn(async () => true),
    output: (message) => output.push(message),
    error: (message) => output.push(message),
    ...overrides,
  };
  const program = buildCliProgram(deps);

  return { program, output, deps };
}
