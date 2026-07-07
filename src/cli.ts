#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { version } from '../package.json';
import { confirm, input, select } from '@inquirer/prompts';
import { Command } from 'commander';

import { formatDoctorReport, runDoctor } from './doctor/doctor';
import { startAutomation } from './runtime/automation';
import { ConfigValidationError, MissingConfigError } from './runtime/errors';
import {
  clearActiveWhatsAppAccount,
  deleteConfig,
  getActiveConfigName,
  getActiveWhatsAppAccount,
  listConfigNames,
  listWhatsAppAccounts,
  loadConfig,
  removeWhatsAppCacheData,
  removeWhatsAppSessionAccount,
  removeWhatsAppSessionData,
  setActiveConfigName,
  setActiveWhatsAppAccount,
  tryLoadConfig,
} from './config/store';
import { redactConfig } from './config/schema';
import { runSetupWizard } from './config/setup';
import { loginWhatsAppAccount } from './whatsapp/client';
import { createLogger } from './runtime/logger';

export type CliDependencies = {
  runSetupWizard: typeof runSetupWizard;
  startAutomation: typeof startAutomation;
  loadConfig: typeof loadConfig;
  tryLoadConfig: typeof tryLoadConfig;
  deleteConfig: typeof deleteConfig;
  listConfigNames: typeof listConfigNames;
  getActiveConfigName: typeof getActiveConfigName;
  setActiveConfigName: typeof setActiveConfigName;
  removeWhatsAppSessionData: typeof removeWhatsAppSessionData;
  removeWhatsAppSessionAccount: typeof removeWhatsAppSessionAccount;
  clearActiveWhatsAppAccount: typeof clearActiveWhatsAppAccount;
  removeWhatsAppCacheData: typeof removeWhatsAppCacheData;
  runDoctor: typeof runDoctor;
  loginWhatsAppAccount: typeof loginWhatsAppAccount;
  getActiveWhatsAppAccount: typeof getActiveWhatsAppAccount;
  setActiveWhatsAppAccount: typeof setActiveWhatsAppAccount;
  listWhatsAppAccounts: typeof listWhatsAppAccounts;
  confirm: typeof confirm;
  select: SelectFn;
  input: (config: {
    message: string;
    validate?: (value: string) => true | string;
  }) => Promise<string>;
  exec: (command: string) => { stdout: string; stderr: string };
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
    tryLoadConfig,
    deleteConfig,
    listConfigNames,
    getActiveConfigName,
    setActiveConfigName,
    removeWhatsAppSessionData,
    removeWhatsAppSessionAccount,
    clearActiveWhatsAppAccount,
    removeWhatsAppCacheData,
    runDoctor,
    loginWhatsAppAccount,
    getActiveWhatsAppAccount,
    setActiveWhatsAppAccount,
    listWhatsAppAccounts,
    confirm,
    select: select as SelectFn,
    input: input as (config: {
      message: string;
      validate?: (value: string) => true | string;
    }) => Promise<string>,
    exec: (command) => {
      const stdout = execSync(command, { encoding: 'utf8', timeout: 30_000 });
      return { stdout, stderr: '' };
    },
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
    .command('clear')
    .description('Clear all ReplyPilot data: npm cache, configs, WhatsApp accounts, and web cache.')
    .action(async () => {
      const shouldClear = await deps.confirm({
        message:
          'This will clear the npm cache, delete all configurations, remove all WhatsApp accounts, and clear the WhatsApp web cache. Continue?',
        default: false,
      });

      if (!shouldClear) {
        deps.output('Clear cancelled.');
        return;
      }

      try {
        deps.exec('npm cache clean --force');
        deps.output('npm cache cleared.');
      } catch {
        deps.output('npm cache could not be cleared (npm may not be available).');
      }

      const configNames = deps.listConfigNames();
      for (const name of configNames) {
        deps.deleteConfig(name);
      }
      deps.clearActiveWhatsAppAccount();
      deps.output('All configurations deleted.');

      deps.removeWhatsAppSessionData();
      deps.output('All WhatsApp accounts removed.');

      deps.removeWhatsAppCacheData();
      deps.output('WhatsApp web client cache cleared.');

      deps.output('ReplyPilot has been fully cleared.');
    });

  program
    .command('setup')
    .description('Run the configuration wizard to create a new config.')
    .action(async () => {
      try {
        await deps.runSetupWizard();
        deps.output('ReplyPilot configuration saved.');
      } catch (error) {
        deps.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
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

      const activeAccount = deps.getActiveWhatsAppAccount();
      if (activeAccount) {
        deps.output(`Using account: ${activeAccount}`);
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
      const configNames = deps.listConfigNames();

      if (configNames.length === 0) {
        deps.error('No saved configuration found. Run replypilot setup to create one.');
        process.exitCode = 1;
        return;
      }

      if (configNames.length === 1) {
        const name = configNames[0];
        const shouldReset = await deps.confirm({
          message: `Delete configuration "${name}"?`,
          default: false,
        });

        if (!shouldReset) {
          deps.output('Config reset cancelled.');
          return;
        }

        deps.deleteConfig(name);
        deps.output(`Configuration "${name}" deleted.`);
        return;
      }

      const action = await deps.select({
        message: 'Select a configuration to delete:',
        choices: [
          ...configNames.map((name) => ({ name, value: name })),
          { name: 'Reset all configurations', value: '__all__' },
        ],
      });

      if (action === '__all__') {
        const shouldReset = await deps.confirm({
          message: 'Delete all saved configurations?',
          default: false,
        });

        if (!shouldReset) {
          deps.output('Config reset cancelled.');
          return;
        }

        for (const name of configNames) {
          deps.deleteConfig(name);
        }
        deps.output('All configurations deleted.');
      } else {
        const shouldReset = await deps.confirm({
          message: `Delete configuration "${action}"?`,
          default: false,
        });

        if (!shouldReset) {
          deps.output('Config reset cancelled.');
          return;
        }

        deps.deleteConfig(action);
        deps.output(`Configuration "${action}" deleted.`);
      }
    });

  config
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
      const accounts = deps.listWhatsAppAccounts();

      if (accounts.length === 0) {
        deps.output('No WhatsApp accounts to logout.');
        return;
      }

      if (accounts.length === 1) {
        const accountName = accounts[0];
        const shouldLogout = await deps.confirm({
          message: `Logout WhatsApp account "${accountName}"?`,
          default: false,
        });

        if (!shouldLogout) {
          deps.output('Logout cancelled.');
          return;
        }

        deps.removeWhatsAppSessionAccount(accountName);
        if (deps.getActiveWhatsAppAccount() === accountName) {
          deps.clearActiveWhatsAppAccount();
        }
        deps.output(`WhatsApp account "${accountName}" logged out.`);
        return;
      }

      const action = await deps.select({
        message: 'Select a WhatsApp account to logout:',
        choices: [
          ...accounts.map((name) => ({ name, value: name })),
          { name: 'Logout all accounts', value: '__all__' },
        ],
      });

      if (action === '__all__') {
        const shouldLogout = await deps.confirm({
          message: 'Remove all saved WhatsApp session data?',
          default: false,
        });

        if (!shouldLogout) {
          deps.output('Logout cancelled.');
          return;
        }

        deps.removeWhatsAppSessionData();
        deps.clearActiveWhatsAppAccount();
        deps.output('All WhatsApp session data removed.');
      } else {
        const shouldLogout = await deps.confirm({
          message: `Logout WhatsApp account "${action}"?`,
          default: false,
        });

        if (!shouldLogout) {
          deps.output('Logout cancelled.');
          return;
        }

        deps.removeWhatsAppSessionAccount(action);
        if (deps.getActiveWhatsAppAccount() === action) {
          deps.clearActiveWhatsAppAccount();
        }
        deps.output(`WhatsApp account "${action}" logged out.`);
      }
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

  program
    .command('login')
    .description('Authenticate a WhatsApp account by scanning a QR code.')
    .action(async () => {
      const accountName = await deps.input({
        message: 'WhatsApp account name (letters, numbers, hyphens, underscores)',
        validate: (value) => {
          const trimmed = value.trim();
          if (!trimmed) return 'Account name is required.';
          if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
            return 'Account name may only contain letters, numbers, hyphens, and underscores.';
          }
          if (deps.listWhatsAppAccounts().includes(trimmed)) {
            return `An account named "${trimmed}" already exists.`;
          }
          return true;
        },
      });

      const trimmed = accountName.trim();

      try {
        const config = deps.tryLoadConfig();
        const loginDelayMs = config?.whatsapp?.loginDelayMs ?? 500;
        await deps.loginWhatsAppAccount(trimmed, createLogger('info'), loginDelayMs);
        deps.setActiveWhatsAppAccount(trimmed);
        deps.output(`Account "${trimmed}" is now active.`);
      } catch (error) {
        deps.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  const account = program.command('account').description('Manage WhatsApp accounts.');

  account
    .command('switch')
    .description('Switch to a different WhatsApp account.')
    .action(async () => {
      const accounts = deps.listWhatsAppAccounts();

      if (accounts.length === 0) {
        deps.error('No WhatsApp accounts found. Run replypilot login to add one.');
        process.exitCode = 1;
        return;
      }

      if (accounts.length === 1) {
        deps.output(`Only one WhatsApp account exists: "${accounts[0]}".`);
        return;
      }

      const activeAccount = deps.getActiveWhatsAppAccount();
      const chosen = await deps.select({
        message: 'Select a WhatsApp account:',
        choices: accounts.map((name) => ({
          name: name === activeAccount ? `${name} (active)` : name,
          value: name,
        })),
      });

      deps.setActiveWhatsAppAccount(chosen);
      deps.output(`Switched to WhatsApp account: ${chosen}`);
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
