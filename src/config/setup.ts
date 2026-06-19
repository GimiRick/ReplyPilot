import { confirm, input, number, password, select } from '@inquirer/prompts';

import {
  CONFIG_VERSION,
  PROVIDER_DEFAULTS,
  type AppConfig,
  type LlmProviderName,
  parseAppConfig,
} from './schema';
import { saveConfig, type ReplyPilotConfigStore } from './store';

export type SetupAnswers = {
  provider: LlmProviderName;
  baseUrl?: string;
  apiKey?: string;
  modelName: string;
  modelLabel?: string;
  messageCount?: number;
  ownerStylePrompt?: string;
  dryRun?: boolean;
  allowGroups?: boolean;
  allowBroadcasts?: boolean;
};

export type PromptAdapter = {
  select: typeof select;
  input: typeof input;
  password: typeof password;
  number: typeof number;
  confirm: typeof confirm;
};

export const defaultPromptAdapter: PromptAdapter = {
  select,
  input,
  password,
  number,
  confirm,
};

export function createConfigFromSetupAnswers(answers: SetupAnswers): AppConfig {
  const providerDefaults =
    answers.provider === 'custom' ? undefined : PROVIDER_DEFAULTS[answers.provider];
  const modelLabel = answers.modelLabel?.trim() || answers.modelName.trim();

  return parseAppConfig({
    version: CONFIG_VERSION,
    whatsapp: {
      sessionName: 'default',
      allowGroups: answers.allowGroups ?? false,
      allowBroadcasts: answers.allowBroadcasts ?? false,
    },
    llm: {
      provider: answers.provider,
      baseUrl: answers.baseUrl ?? providerDefaults?.baseUrl,
      apiKey: answers.apiKey ?? providerDefaults?.apiKey,
      modelName: answers.modelName,
      modelLabel: modelLabel || providerDefaults?.modelLabel,
      timeoutMs: 60_000,
      maxRetries: 1,
    },
    personality: {
      ownerStylePrompt:
        answers.ownerStylePrompt?.trim() ||
        'Reply naturally, concisely, and in my usual WhatsApp style.',
    },
    context: {
      messageCount: answers.messageCount ?? 30,
    },
    safety: {
      dryRun: answers.dryRun ?? false,
      ignoreSelf: true,
    },
    logging: {
      level: 'info',
    },
  });
}

export async function promptForConfig(
  prompts: PromptAdapter = defaultPromptAdapter,
): Promise<AppConfig> {
  const provider = await prompts.select<LlmProviderName>({
    message: 'Which LLM provider do you want to use?',
    choices: [
      { name: 'LM Studio', value: 'lmstudio' },
      { name: 'Ollama', value: 'ollama' },
      { name: 'Custom OpenAI-compatible endpoint', value: 'custom' },
    ],
  });

  const providerDefaults = provider === 'custom' ? undefined : PROVIDER_DEFAULTS[provider];

  const baseUrl = await prompts.input({
    message: 'LLM base URL',
    default: providerDefaults?.baseUrl,
    validate: (value) => (value.trim() ? true : 'Base URL is required'),
  });

  const apiKey =
    provider === 'custom'
      ? await prompts.password({
          message: 'API key',
          mask: '*',
          validate: (value) => (value.trim() ? true : 'API key is required'),
        })
      : await prompts.input({
          message: 'API key',
          default: providerDefaults?.apiKey,
          validate: (value) => (value.trim() ? true : 'API key is required'),
        });

  const modelName = await prompts.input({
    message: 'Model name',
    validate: (value) => (value.trim() ? true : 'Model name is required'),
  });

  const modelLabel = await prompts.input({
    message: 'Model label',
    default: providerDefaults?.modelLabel ?? modelName,
    validate: (value) => (value.trim() ? true : 'Model label is required'),
  });

  const messageCount = await prompts.number({
    message: 'Chat context message count',
    default: 30,
    validate: (value) => {
      if (value === undefined) {
        return true;
      }

      return value >= 1 && value <= 200 ? true : 'Choose a value from 1 to 200';
    },
  });

  const ownerStylePrompt = await prompts.input({
    message: 'Owner personality and style prompt',
    default: 'Reply naturally, concisely, and in my usual WhatsApp style.',
    validate: (value) => (value.trim() ? true : 'Owner style prompt is required'),
  });

  const dryRun = await prompts.confirm({
    message: 'Enable dry-run mode?',
    default: false,
  });

  const allowGroups = await prompts.confirm({
    message: 'Auto-reply in group chats?',
    default: false,
  });

  const allowBroadcasts = await prompts.confirm({
    message: 'Auto-reply to status or broadcast messages?',
    default: false,
  });

  return createConfigFromSetupAnswers({
    provider,
    baseUrl,
    apiKey,
    modelName,
    modelLabel,
    messageCount,
    ownerStylePrompt,
    dryRun,
    allowGroups,
    allowBroadcasts,
  });
}

export async function runSetupWizard(
  options: {
    prompts?: PromptAdapter;
    store?: ReplyPilotConfigStore;
  } = {},
): Promise<AppConfig> {
  const config = await promptForConfig(options.prompts ?? defaultPromptAdapter);
  saveConfig(config, options.store);
  return config;
}
