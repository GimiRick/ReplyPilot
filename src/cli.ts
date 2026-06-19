#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { version } from '../package.json';
import { confirm } from '@inquirer/prompts';
import { Command } from 'commander';

import { formatDoctorReport, runDoctor } from './doctor/doctor';
import { startAutomation } from './runtime/automation';
import { ConfigValidationError, MissingConfigError } from './runtime/errors';
import { deleteConfig, loadConfig, removeWhatsAppSessionData } from './config/store';
import { redactConfig } from './config/schema';
import { runSetupWizard } from './config/setup';

export type CliDependencies = {
  runSetupWizard: typeof runSetupWizard;
  startAutomation: typeof startAutomation;
  loadConfig: typeof loadConfig;
  deleteConfig: typeof deleteConfig;
  removeWhatsAppSessionData: typeof removeWhatsAppSessionData;
  runDoctor: typeof runDoctor;
  confirm: typeof confirm;
  output: (message: string) => void;
  error: (message: string) => void;
};

export function buildCliProgram(overrides: Partial<CliDependencies> = {}): Command {
  const deps: CliDependencies = {
    runSetupWizard,
    startAutomation,
    loadConfig,
    deleteConfig,
    removeWhatsAppSessionData,
    runDoctor,
    confirm,
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
    .description('Run the first-time configuration wizard.')
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
      const shouldReset = await deps.confirm({
        message: 'Delete saved ReplyPilot configuration?',
        default: false,
      });

      if (!shouldReset) {
        deps.output('Config reset cancelled.');
        return;
      }

      deps.deleteConfig();
      deps.output('ReplyPilot configuration deleted.');
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

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  const program = buildCliProgram();
  await program.parseAsync(argv);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
