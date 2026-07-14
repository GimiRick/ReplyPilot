import { mergeAppConfig, type AppConfig, type PartialAppConfig } from '../config/schema';
import { getActiveWhatsAppAccount, loadConfig } from '../config/store';
import { OpenAiCompatibleProvider } from '../llm/openai-compatible';
import {
  type AudioData,
  type ChatContextMessage,
  type ImageData,
  type LlmProvider,
} from '../llm/provider';
import { DuplicateMessageGuard, getIgnoreReason, type IgnoreReason } from '../whatsapp/filters';
import { createLogger, type Logger } from './logger';
import { MessageQueue } from './queue';
import { HealthServer } from './health-server';
import { MetricsCollector } from './metrics';

type ChatBatch = {
  messages: RuntimeIncomingMessage[];
  timer: NodeJS.Timeout | undefined;
  resolvers: ((result: AutomationResult) => void)[];
  processed: boolean;
};

export type RuntimeIncomingMessage = {
  id: string;
  chatId: string;
  timestamp: number;
  body: string;
  fromMe?: boolean;
  isGroup?: boolean;
  isBroadcast?: boolean;
  archived?: boolean;
  hasMedia?: boolean;
  messageType?: string;
  imageData?: ImageData;
  audioData?: AudioData;
  quotedMessage?: { id?: string; body: string; fromMe?: boolean };
  chatName?: string;
  authorName?: string;
  fetchContext(limit: number): Promise<ChatContextMessage[]>;
  sendMessage(text: string): Promise<void>;
};
export type AutomationResult =
  | { status: 'ignored'; reason: IgnoreReason }
  | { status: 'sent'; reply: string }
  | { status: 'dry-run'; reply: string }
  | { status: 'failed'; error: unknown };

export type ReplyAutomationOptions = {
  config: AppConfig;
  llmProvider: LlmProvider;
  logger?: Logger;
  queue?: MessageQueue;
  duplicateGuard?: DuplicateMessageGuard;
  metrics?: MetricsCollector;
};

const MAX_ACTIVE_BATCHES = 5_000;

export class ReplyAutomation {
  private readonly config: AppConfig;
  private readonly llmProvider: LlmProvider;
  private readonly logger: Logger;
  private readonly queue: MessageQueue;
  private readonly duplicateGuard: DuplicateMessageGuard;
  private readonly metrics: MetricsCollector;
  private readonly activeBatches = new Map<string, ChatBatch>();
  private stopped = false;

  constructor(options: ReplyAutomationOptions) {
    this.config = options.config;
    this.llmProvider = options.llmProvider;
    this.logger = options.logger ?? createLogger(options.config.logging.level);
    this.queue =
      options.queue ??
      new MessageQueue({
        globalConcurrency: 1,
        perChatConcurrency: 1,
        maxCallsPerMinute: options.config.automation.maxCallsPerMinute,
      });
    this.duplicateGuard = options.duplicateGuard ?? new DuplicateMessageGuard();
    this.metrics = options.metrics ?? new MetricsCollector();
  }

  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  handleIncomingMessage(message: RuntimeIncomingMessage): Promise<AutomationResult> {
    if (this.stopped) {
      this.metrics.recordMessageIgnored();
      return Promise.resolve({ status: 'ignored', reason: 'shutting_down' });
    }

    this.metrics.recordMessageReceived();

    const ignoreReason = getIgnoreReason(message, this.config);

    if (ignoreReason) {
      this.metrics.recordMessageIgnored();
      this.logger.debug(
        { messageId: message.id, reason: ignoreReason },
        'Ignoring WhatsApp message',
      );
      return Promise.resolve({ status: 'ignored', reason: ignoreReason });
    }

    if (!this.duplicateGuard.markIfNew(message.id)) {
      this.metrics.recordMessageIgnored();
      this.logger.debug({ messageId: message.id }, 'Ignoring duplicate WhatsApp message');
      return Promise.resolve({ status: 'ignored', reason: 'duplicate' });
    }

    if (this.activeBatches.size >= MAX_ACTIVE_BATCHES) {
      this.metrics.recordMessageIgnored();
      this.logger.warn(
        { chatId: message.chatId, activeBatches: this.activeBatches.size },
        'Ignoring message, too many active chat batches',
      );
      return Promise.resolve({ status: 'ignored', reason: 'too_many_chats' });
    }

    const chatId = message.chatId;
    let batch = this.activeBatches.get(chatId);

    return new Promise((resolve) => {
      if (batch) {
        if (batch.timer) {
          clearTimeout(batch.timer);
        }
        batch.messages.push(message);
        batch.resolvers.push(resolve);
      } else {
        batch = {
          messages: [message],
          timer: undefined,
          resolvers: [resolve],
          processed: false,
        };
        this.activeBatches.set(chatId, batch);
      }

      const capturedBatch = batch;
      capturedBatch.timer = setTimeout(() => {
        if (capturedBatch.processed) {
          return;
        }
        capturedBatch.processed = true;
        if (this.stopped) {
          this.activeBatches.delete(chatId);
          for (const r of capturedBatch.resolvers) {
            try {
              r({ status: 'ignored', reason: 'shutting_down' });
            } catch {
              /* logs downstream */
            }
          }
          return;
        }
        this.activeBatches.delete(chatId);

        this.queue
          .add(chatId, () =>
            processIncomingMessageBatch({
              messages: capturedBatch.messages,
              config: this.config,
              llmProvider: this.llmProvider,
              logger: this.logger,
              metrics: this.metrics,
            }).catch((error) => {
              this.metrics.recordMessageFailed();
              this.logger.error({ error, chatId }, 'Message processing failed');
              return { status: 'failed' as const, error };
            }),
          )
          .then((result) => {
            for (const r of capturedBatch.resolvers) {
              try {
                r(result);
              } catch {
                /* individual resolver errors handled downstream */
              }
            }
          })
          .catch((error) => {
            this.logger.error({ error, chatId }, 'Failed to resolve batch promises');
          });
      }, this.config.automation.debounceMs);
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    const batchPromises: Promise<void>[] = [];

    for (const [chatId, batch] of this.activeBatches.entries()) {
      if (batch.processed) {
        continue;
      }
      batch.processed = true;
      if (batch.timer) {
        clearTimeout(batch.timer);
      }
      this.activeBatches.delete(chatId);

      batchPromises.push(
        this.queue
          .add(chatId, () =>
            processIncomingMessageBatch({
              messages: batch.messages,
              config: this.config,
              llmProvider: this.llmProvider,
              logger: this.logger,
              metrics: this.metrics,
            }).catch((error) => {
              this.metrics.recordMessageFailed();
              this.logger.error({ error, chatId }, 'Message processing failed during shutdown');
              return { status: 'failed' as const, error };
            }),
          )
          .then((result) => {
            for (const r of batch.resolvers) {
              try {
                r(result);
              } catch {
                /* individual resolver errors handled downstream */
              }
            }
          })
          .catch((error) => {
            this.logger.error(
              { error, chatId },
              'Failed to resolve batch promises during shutdown',
            );
          }),
      );
    }

    await Promise.all(batchPromises);
    await this.queue.onIdle();
  }
}

export async function processIncomingMessageBatch(options: {
  messages: RuntimeIncomingMessage[];
  config: AppConfig;
  llmProvider: LlmProvider;
  logger?: Pick<Logger, 'info'>;
  metrics?: MetricsCollector;
}): Promise<AutomationResult> {
  const batchStart = performance.now();
  const { config, llmProvider, logger, metrics } = options;

  if (options.messages.length === 0) {
    return { status: 'ignored', reason: 'empty' };
  }

  const messages = [...options.messages].sort((a, b) => a.timestamp - b.timestamp);

  const lastMessage = messages[messages.length - 1];

  const allContext = await lastMessage.fetchContext(config.context.messageCount + messages.length);
  const batchedIds = new Set(messages.map((m) => m.id));
  const context = allContext
    .filter((c) => !c.id || !batchedIds.has(c.id))
    .slice(-config.context.messageCount);

  const combinedBody = messages
    .map((m) => m.body)
    .filter(Boolean)
    .join('\n');
  const quotedSource = [...messages].reverse().find((message) => message.quotedMessage);
  const quotedMessage = quotedSource?.quotedMessage
    ? {
        body: quotedSource.quotedMessage.body,
        direction:
          quotedSource.quotedMessage.fromMe === true ? ('owner' as const) : ('contact' as const),
      }
    : undefined;

  let incomingMessageAuthorName: string | undefined;
  if (lastMessage.fromMe) {
    incomingMessageAuthorName = 'the owner';
  } else if (lastMessage.authorName) {
    incomingMessageAuthorName = lastMessage.authorName;
  }

  const imageData = config.llm.visionSupport
    ? messages.find((m) => m.imageData)?.imageData
    : undefined;
  const audioData =
    config.voiceNote.mode === 'native_audio'
      ? messages.find((m) => m.audioData)?.audioData
      : undefined;

  let reply;
  try {
    const llmStart = performance.now();
    try {
      reply = await llmProvider.generateReply({
        model: config.llm.modelName,
        modelLabel: config.llm.modelLabel,
        ownerStylePrompt: config.personality.ownerStylePrompt,
        messages: context,
        incomingMessage: combinedBody,
        incomingMessageQuoted: quotedMessage,
        imageData,
        audioData,
        isGroup: lastMessage.isGroup,
        chatName: lastMessage.chatName,
        incomingMessageAuthorName,
      });
      metrics?.recordLlmCall(Math.round(performance.now() - llmStart));
    } catch (error) {
      metrics?.recordLlmError();
      throw error;
    }

    if (config.safety.dryRun) {
      metrics?.recordMessageProcessed();
      logger?.info(
        { chatId: lastMessage.chatId, reply: reply.text },
        'Dry-run generated WhatsApp reply',
      );
      return { status: 'dry-run', reply: reply.text };
    }

    await lastMessage.sendMessage(reply.text);
    metrics?.recordMessageProcessed();
    return { status: 'sent', reply: reply.text };
  } finally {
    metrics?.recordProcessingTime(Math.round(performance.now() - batchStart));
  }
}

export async function startAutomation(
  configOverrides?: PartialAppConfig,
  healthServerPort?: number,
): Promise<void> {
  const storedConfig = loadConfig();
  const config = mergeAppConfig(storedConfig, configOverrides);
  const logger = createLogger(config.logging.level);
  const llmProvider = new OpenAiCompatibleProvider({
    provider: config.llm.provider,
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    fallbackApiKeys: config.llm.fallbackApiKeys,
    timeoutMs: config.llm.timeoutMs,
    maxRetries: config.llm.maxRetries,
    logger,
  });
  const metrics = new MetricsCollector();
  const automation = new ReplyAutomation({ config, llmProvider, logger, metrics });
  const { WhatsAppClientAdapter } = await import('../whatsapp/client');
  const activeAccount = getActiveWhatsAppAccount();
  const whatsapp = new WhatsAppClientAdapter(config, logger, activeAccount);

  let healthServer: HealthServer | undefined;
  if (healthServerPort !== undefined) {
    healthServer = new HealthServer({
      port: healthServerPort,
      host: '127.0.0.1',
      metrics,
    });
    await healthServer.start();
    logger.info({ port: healthServerPort }, 'Health server started');
  }

  whatsapp.onMessage(async (message) => {
    await automation.handleIncomingMessage(message);
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('Shutting down ReplyPilot gracefully...');

    const forceExitTimer = setTimeout(() => {
      logger.warn(
        { timeoutMs: config.automation.shutdownTimeoutMs },
        'Shutdown timed out, forcing exit',
      );
      process.exit(1);
    }, config.automation.shutdownTimeoutMs);
    forceExitTimer.unref();

    try {
      await automation.stop();
      await whatsapp.stop();
      if (healthServer) {
        await healthServer.stop();
      }
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
    } finally {
      clearTimeout(forceExitTimer);
      process.off('SIGINT', shutdown);
      if (process.platform !== 'win32') {
        process.off('SIGTERM', shutdown);
      }
    }
  };

  process.on('SIGINT', shutdown);
  if (process.platform !== 'win32') {
    process.on('SIGTERM', shutdown);
  }

  try {
    await whatsapp.start();
  } catch (error) {
    process.off('SIGINT', shutdown);
    if (process.platform !== 'win32') {
      process.off('SIGTERM', shutdown);
    }
    await whatsapp.stop().catch(() => {});
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

    if (healthServer) {
      await healthServer.stop();
    }
  }
}

function isSessionError(message: string): boolean {
  return message.includes('EBUSY') || message.includes('first_party_sets');
}
