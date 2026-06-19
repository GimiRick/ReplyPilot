import { mergeAppConfig, type AppConfig, type PartialAppConfig } from '../config/schema';
import { loadConfig } from '../config/store';
import { OpenAiCompatibleProvider } from '../llm/openai-compatible';
import { type ChatContextMessage, type LlmProvider } from '../llm/provider';
import { DuplicateMessageGuard, getIgnoreReason, type IgnoreReason } from '../whatsapp/filters';
import { createLogger, type Logger } from './logger';
import { MessageQueue } from './queue';

export type RuntimeIncomingMessage = {
  id: string;
  chatId: string;
  body: string;
  fromMe?: boolean;
  isGroup?: boolean;
  isBroadcast?: boolean;
  fetchContext(limit: number): Promise<ChatContextMessage[]>;
  sendMessage(text: string): Promise<void>;
};

export type AutomationResult =
  | { status: 'ignored'; reason: IgnoreReason }
  | { status: 'queued' }
  | { status: 'sent'; reply: string }
  | { status: 'dry-run'; reply: string }
  | { status: 'failed'; error: unknown };

export type ReplyAutomationOptions = {
  config: AppConfig;
  llmProvider: LlmProvider;
  logger?: Logger;
  queue?: MessageQueue;
  duplicateGuard?: DuplicateMessageGuard;
};

export class ReplyAutomation {
  private readonly config: AppConfig;
  private readonly llmProvider: LlmProvider;
  private readonly logger: Logger;
  private readonly queue: MessageQueue;
  private readonly duplicateGuard: DuplicateMessageGuard;

  constructor(options: ReplyAutomationOptions) {
    this.config = options.config;
    this.llmProvider = options.llmProvider;
    this.logger = options.logger ?? createLogger(options.config.logging.level);
    this.queue = options.queue ?? new MessageQueue({ globalConcurrency: 2, perChatConcurrency: 1 });
    this.duplicateGuard = options.duplicateGuard ?? new DuplicateMessageGuard();
  }

  handleIncomingMessage(message: RuntimeIncomingMessage): Promise<AutomationResult> {
    const ignoreReason = getIgnoreReason(message, this.config);

    if (ignoreReason) {
      this.logger.debug(
        { messageId: message.id, reason: ignoreReason },
        'Ignoring WhatsApp message',
      );
      return Promise.resolve({ status: 'ignored', reason: ignoreReason });
    }

    if (!this.duplicateGuard.markIfNew(message.id)) {
      this.logger.debug({ messageId: message.id }, 'Ignoring duplicate WhatsApp message');
      return Promise.resolve({ status: 'ignored', reason: 'duplicate' });
    }

    return this.queue.add(message.chatId, async () => {
      try {
        return await processIncomingMessage({
          message,
          config: this.config,
          llmProvider: this.llmProvider,
          logger: this.logger,
        });
      } catch (error) {
        this.logger.error({ error, messageId: message.id }, 'Message processing failed');
        return { status: 'failed', error };
      }
    });
  }
}

export async function processIncomingMessage(options: {
  message: RuntimeIncomingMessage;
  config: AppConfig;
  llmProvider: LlmProvider;
  logger?: Pick<Logger, 'info'>;
}): Promise<AutomationResult> {
  const { message, config, llmProvider, logger } = options;
  const context = await message.fetchContext(config.context.messageCount);
  const reply = await llmProvider.generateReply({
    model: config.llm.modelName,
    modelLabel: config.llm.modelLabel,
    ownerStylePrompt: config.personality.ownerStylePrompt,
    messages: context,
    incomingMessage: message.body,
  });

  if (config.safety.dryRun) {
    logger?.info({ chatId: message.chatId, reply: reply.text }, 'Dry-run generated WhatsApp reply');
    return { status: 'dry-run', reply: reply.text };
  }

  await message.sendMessage(reply.text);
  return { status: 'sent', reply: reply.text };
}

export async function startAutomation(configOverrides?: PartialAppConfig): Promise<void> {
  const storedConfig = loadConfig();
  const config = mergeAppConfig(storedConfig, configOverrides);
  const logger = createLogger(config.logging.level);
  const llmProvider = new OpenAiCompatibleProvider({
    provider: config.llm.provider,
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    timeoutMs: config.llm.timeoutMs,
    maxRetries: config.llm.maxRetries,
    logger,
  });
  const automation = new ReplyAutomation({ config, llmProvider, logger });
  const { WhatsAppClientAdapter } = await import('../whatsapp/client');
  const whatsapp = new WhatsAppClientAdapter(config, logger);

  whatsapp.onMessage(async (message) => {
    await automation.handleIncomingMessage(message);
  });

  const shutdown = async () => {
    logger.info('Shutting down ReplyPilot gracefully...');
    try {
      await whatsapp.stop();
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await whatsapp.start();
  } catch (error) {
    console.error('');
    console.error('ReplyPilot could not connect to WhatsApp.');
    console.error('');

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (isSessionError(errorMessage)) {
      console.error('  Your WhatsApp session has expired or is corrupted.');
      console.error('  To fix this, run:  replypilot logout');
      console.error('  Then try again with:  replypilot start');
    } else {
      console.error(`  Error: ${errorMessage}`);
      console.error('');
      console.error('  This could be a missing browser, network issue, or environment problem.');
      console.error('  If the problem persists, try:  replypilot logout');
    }

    console.error('');
    process.exitCode = 1;
  }
}

function isSessionError(message: string): boolean {
  return message.includes('EBUSY') || message.includes('first_party_sets');
}
