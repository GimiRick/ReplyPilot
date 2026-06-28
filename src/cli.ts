#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { version } from '../package.json';
import { confirm, select } from '@inquirer/prompts';
import { Command } from 'commander';

import { formatDoctorReport, runDoctor } from './doctor/doctor';
import { startAutomation } from './runtime/automation';
import { ConfigValidationError, MissingConfigError } from './runtime/errors';
import {
  deleteConfig,
  getActiveConfigName,
  listConfigNames,
  loadConfig,
  removeWhatsAppCacheData,
  removeWhatsAppSessionData,
  setActiveConfigName,
} from './config/store';
import { redactConfig } from './config/schema';
import { runSetupWizard } from './config/setup';

export type CliDependencies = {
  runSetupWizard: typeof runSetupWizard;
  startAutomation: typeof startAutomation;
  loadConfig: typeof loadConfig;
  deleteConfig: typeof deleteConfig;
  listConfigNames: typeof listConfigNames;
  getActiveConfigName: typeof getActiveConfigName;
  setActiveConfigName: typeof setActiveConfigName;
  removeWhatsAppSessionData: typeof removeWhatsAppSessionData;
  removeWhatsAppCacheData: typeof removeWhatsAppCacheData;
  runDoctor: typeof runDoctor;
  confirm: typeof confirm;
  select: SelectFn;
  output: (message: string) => void;
  error: (message: string) => void;
};

type SelectChoice = { name: string; value: string };
type SelectFn = (config: { message: string; choices: SelectChoice[] }) => Promise<string>;

export function buildCliProgram(overrides: Partial<CliDependencies> = {}): Command {
  const deps: CliDependencies = {
    runSetupWizard,
    startAutomation,
    loadConfig,
    deleteConfig,
    listConfigNames,
    getActiveConfigName,
    setActiveConfigName,
    removeWhatsAppSessionData,
    removeWhatsAppCacheData,
    runDoctor,
    confirm,
    select: select as SelectFn,
    output: (message) => console.log(message),
    error: (message) => console.error(message),
    ...overrides,
  };

  const program = new Command();

  program
    .name('replypilot')
    .description('Automate WhatsApp replies with local or custom OpenAI-compatible LLMs.')
    .version(version);

  program
    .command('version')
    .description('Display the installed ReplyPilot version.')
    .action(() => {
      deps.output(version);
    });

  program
    .command('setup')
    .description('Run the configuration wizard to create a new config.')
    .action(async () => {
      await deps.runSetupWizard();
      deps.output('ReplyPilot configuration saved.');
    });

  program
    .command('start')
    .description('Start WhatsApp login/session and message automation.')
    .action(async () => {
      try {
        deps.loadConfig();
      } catch (error) {
        if (error instanceof MissingConfigError) {
          deps.output('No saved configuration found. Starting setup first.');
          await deps.runSetupWizard();
        } else if (error instanceof ConfigValidationError) {
          deps.output('Saved configuration is invalid. Starting setup to replace it.');
          await deps.runSetupWizard();
        } else {
          throw error;
        }
      }

      const activeName = deps.getActiveConfigName();
      if (activeName) {
        deps.output(`Using config: ${activeName}`);
      }

      await deps.startAutomation();
    });

  program
    .command('doctor')
    .description('Check Node.js, saved config, provider reachability, and package health.')
    .action(async () => {
      const report = await deps.runDoctor();
      deps.output(formatDoctorReport(report));

      if (!report.ok) {
        process.exitCode = 1;
      }
    });

  const config = program.command('config').description('Manage ReplyPilot configuration.');

  config
    .command('show')
    .description('Print saved config with secrets redacted.')
    .action(() => {
      try {
        const activeName = deps.getActiveConfigName();
        if (activeName) {
          deps.output(`Active config: ${activeName}`);
        }
        deps.output(JSON.stringify(redactConfig(deps.loadConfig()), null, 2));
      } catch (error) {
        if (error instanceof MissingConfigError) {
          deps.error('No saved configuration found. Run replypilot setup to create one.');
          process.exitCode = 1;
          return;
        }

        if (error instanceof ConfigValidationError) {
          deps.error(
            'Saved configuration is invalid. Run replypilot setup to replace it or replypilot config reset to delete it.',
          );
          process.exitCode = 1;
          return;
        }

        throw error;
      }
    });

  config
    .command('reset')
    .description('Delete saved ReplyPilot config after confirmation.')
    .action(async () => {
      const activeName = deps.getActiveConfigName();

      const shouldReset = await deps.confirm({
        message: activeName
          ? `Delete active configuration "${activeName}"?`
          : 'Delete saved ReplyPilot configuration?',
        default: false,
      });

      if (!shouldReset) {
        deps.output('Config reset cancelled.');
        return;
      }

      try {
        deps.deleteConfig();
        deps.output('ReplyPilot configuration deleted.');
      } catch (error) {
        if (error instanceof MissingConfigError) {
          deps.error('No saved configuration found. Run replypilot setup to create one.');
          process.exitCode = 1;
          return;
        }
        throw error;
      }
    });

  program
    .command('switch')
    .description('Switch to a different configuration.')
    .action(async () => {
      const names = deps.listConfigNames();

      if (names.length === 0) {
        deps.error('No configurations found. Run replypilot setup to create one.');
        process.exitCode = 1;
        return;
      }

      if (names.length === 1) {
        deps.output(`Only one configuration exists: "${names[0]}".`);
        return;
      }

      const activeName = deps.getActiveConfigName();
      const chosen = await deps.select({
        message: 'Select a configuration to switch to:',
        choices: names.map((name) => ({
          name: name === activeName ? `${name} (active)` : name,
          value: name,
        })),
      });

      deps.setActiveConfigName(chosen);
      deps.output(`Switched to configuration: ${chosen}`);
    });

  program
    .command('logout')
    .description('Remove WhatsApp auth/session data after confirmation.')
    .action(async () => {
      const shouldLogout = await deps.confirm({
        message: 'Remove saved WhatsApp session data?',
        default: false,
      });

      if (!shouldLogout) {
        deps.output('Logout cancelled.');
        return;
      }

      deps.removeWhatsAppSessionData();
      deps.output('WhatsApp session data removed.');
    });

  program
    .command('cache')
    .description('Remove the WhatsApp web client cache (.wwebjs_cache) from the current directory.')
    .action(async () => {
      const shouldClear = await deps.confirm({
        message: 'Remove WhatsApp web client cache (.wwebjs_cache)?',
        default: false,
      });

      if (!shouldClear) {
        deps.output('Cache clear cancelled.');
        return;
      }

      deps.removeWhatsAppCacheData();
      deps.output('WhatsApp web client cache removed.');
    });

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  const program = buildCliProgram();
  await program.parseAsync(argv);
}

let isMain = false;
try {
  isMain = Boolean(
    process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url),
  );
} catch {
  // Fallback to false if process.argv[1] cannot be resolved (e.g., in REPL or eval)
}

if (isMain) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
