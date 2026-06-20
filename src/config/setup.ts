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
  visionSupport?: boolean;
  voiceNoteMode?: 'ignore' | 'whisper_cloud' | 'whisper_local' | 'native_audio';
  whisperBaseUrl?: string;
  whisperApiKey?: string;
  whisperModel?: string;
  localWhisperUrl?: string;
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
      modelLabel,
      visionSupport: answers.visionSupport ?? false,
      timeoutMs: 60_000,
      maxRetries: 1,
    },
    personality: {
      ownerStylePrompt:
        answers.ownerStylePrompt?.trim() ||
        'Reply naturally, concisely, and in my usual WhatsApp style.',
    },
    voiceNote: {
      mode: answers.voiceNoteMode ?? 'ignore',
      whisperBaseUrl: answers.whisperBaseUrl,
      whisperApiKey: answers.whisperApiKey,
      whisperModel: answers.whisperModel,
      localWhisperUrl: answers.localWhisperUrl,
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
    validate: (value) => {
      if (!value.trim()) {
        return 'Base URL is required';
      }
      try {
        new URL(value.trim());
        return true;
      } catch {
        return 'LLM base URL must be a valid URL';
      }
    },
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

  const visionSupport = await prompts.confirm({
    message: 'Does your LLM support vision (image understanding)?',
    default: false,
  });

  const messageCount = await prompts.number({
    message: 'Chat context message count',
    default: 30,
    validate: (value) => {
      if (value === undefined) {
        return true;
      }
      if (!Number.isInteger(value)) {
        return 'Value must be an integer';
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

  const interactVoiceNotes = await prompts.confirm({
    message: 'Do you want the LLM to interact with voice notes?',
    default: false,
  });

  let voiceNoteMode: SetupAnswers['voiceNoteMode'] = 'ignore';
  let whisperBaseUrl: string | undefined;
  let whisperApiKey: string | undefined;
  let whisperModel: string | undefined;
  let localWhisperUrl: string | undefined;

  if (interactVoiceNotes) {
    const mode = await prompts.select<'whisper_cloud' | 'whisper_local' | 'native_audio'>({
      message: 'How do you want to handle voice notes?',
      choices: [
        { name: 'Whisper Cloud (transcribe via cloud API)', value: 'whisper_cloud' },
        { name: 'Whisper Local (transcribe via local server)', value: 'whisper_local' },
        { name: 'Native Audio (send audio directly to LLM)', value: 'native_audio' },
      ],
    });

    voiceNoteMode = mode;

    if (mode === 'whisper_cloud') {
      whisperBaseUrl = await prompts.input({
        message: 'Whisper base URL (leave empty to use LLM base URL)',
        validate: (value) => {
          if (!value.trim()) {
            return true;
          }
          try {
            new URL(value.trim());
            return true;
          } catch {
            return 'Base URL must be a valid URL';
          }
        },
      });
      whisperApiKey = await prompts.password({
        message: 'Whisper API key (leave empty to use LLM API key)',
        mask: '*',
      });
      whisperModel = await prompts.select({
        message: 'Whisper model',
        choices: [
          { name: 'whisper-1 — OpenAI open-source Whisper V2', value: 'whisper-1' },
          { name: 'gpt-4o-mini-transcribe — GPT-4o mini transcription', value: 'gpt-4o-mini-transcribe' },
          { name: 'gpt-4o-transcribe — GPT-4o transcription (best accuracy)', value: 'gpt-4o-transcribe' },
          { name: 'Custom', value: '__custom__' },
        ],
      });
      if (whisperModel === '__custom__') {
        whisperModel = await prompts.input({
          message: 'Custom Whisper model name',
          validate: (value) => (value.trim() ? true : 'Model name is required'),
        });
      }
    } else if (mode === 'whisper_local') {
      localWhisperUrl = await prompts.input({
        message: 'Local Whisper URL',
        default: 'http://localhost:8080/inference',
        validate: (value) => {
          if (!value.trim()) {
            return 'URL is required';
          }
          try {
            new URL(value.trim());
            return true;
          } catch {
            return 'Local Whisper URL must be a valid URL';
          }
        },
      });
    }
  }

  return createConfigFromSetupAnswers({
    provider,
    baseUrl,
    apiKey,
    modelName,
    modelLabel,
    visionSupport,
    voiceNoteMode,
    whisperBaseUrl: whisperBaseUrl?.trim() || undefined,
    whisperApiKey: whisperApiKey?.trim() || undefined,
    whisperModel: whisperModel?.trim() || undefined,
    localWhisperUrl: localWhisperUrl?.trim() || undefined,
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
