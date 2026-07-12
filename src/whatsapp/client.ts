import { createRequire } from 'node:module';

import qrcode from 'qrcode-terminal';
import type { Chat, Client as WhatsAppWebClient, Message } from 'whatsapp-web.js';

import { type AppConfig } from '../config/schema';
import { getWhatsAppSessionDir, validateWhatsAppAccountName } from '../config/store';
import { type RuntimeIncomingMessage } from '../runtime/automation';
import { type Logger } from '../runtime/logger';
import { oggToMp3 } from '../audio/convert';
import { transcribeCloud, transcribeLocal } from '../audio/transcriber';
import { getIgnoreReason } from './filters';
import { fetchChatContext, mediaTypeLabel } from './context';

const require = createRequire(import.meta.url);
const { Client, LocalAuth } = require('whatsapp-web.js') as typeof import('whatsapp-web.js');

const CHROME_VERSION = '149.0.7827.156';

function getPlatformUserAgent(): string {
  switch (process.platform) {
    case 'win32':
      return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
    case 'darwin':
      return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
    case 'linux':
      return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
    default:
      return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
  }
}

export type WhatsAppMessageHandler = (message: RuntimeIncomingMessage) => void | Promise<void>;

export class WhatsAppClientAdapter {
  private readonly client: WhatsAppWebClient;
  private messageHandler?: WhatsAppMessageHandler;
  private readonly onLifecycleQr: (qr: string) => void;
  private readonly onLifecycleReady: () => void;
  private readonly onLifecycleDisconnected: (reason: string) => void;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    sessionName?: string,
  ) {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionName ?? config.whatsapp.sessionName,
        dataPath: getWhatsAppSessionDir(),
      }),
      userAgent: getPlatformUserAgent(),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      webVersionCache: {
        type: 'none',
      },
    });

    this.onLifecycleQr = (qr) => {
      this.logger.info('Scan this QR code with WhatsApp linked devices');
      qrcode.generate(qr, { small: true });
    };
    this.onLifecycleReady = () => {
      this.logger.info('ReplyPilot is connected to WhatsApp');
    };
    this.onLifecycleDisconnected = (reason) => {
      if (reason !== 'LOGOUT') {
        this.logger.warn({ reason }, 'WhatsApp client disconnected');
      }
    };
    this.client.on('loading_screen', (_percent, message) => {
      this.logger.info(`${message}...`);
    });
  }

  private boundOnMessage: ((message: Message) => void) | undefined;

  onMessage(handler: WhatsAppMessageHandler): void {
    this.messageHandler = handler;
  }

  async start(): Promise<void> {
    this.registerLifecycleEvents();
    if (this.boundOnMessage) {
      this.client.removeListener('message', this.boundOnMessage);
    }
    this.boundOnMessage = (message) => {
      this.handleMessage(message).catch((error) => {
        this.logger.error(
          { error, messageId: message.id?._serialized },
          'WhatsApp message handler failed',
        );
      });
    };
    this.client.on('message', this.boundOnMessage);

    try {
      this.logger.info('Downloading browser and connecting to WhatsApp...');
      await this.client.initialize();
    } catch (error) {
      await this.client.destroy().catch(() => {});
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.unregisterLifecycleEvents();
    await this.client.destroy();
  }

  private registerLifecycleEvents(): void {
    this.client.on('qr', this.onLifecycleQr);
    this.client.on('ready', this.onLifecycleReady);
    this.client.on('disconnected', this.onLifecycleDisconnected);
  }

  private unregisterLifecycleEvents(): void {
    this.client.off('qr', this.onLifecycleQr);
    this.client.off('ready', this.onLifecycleReady);
    this.client.off('disconnected', this.onLifecycleDisconnected);
  }

  private async handleMessage(message: Message): Promise<void> {
    if (!this.messageHandler) {
      return;
    }

    let chat: Chat;

    try {
      chat = await message.getChat();
    } catch (error) {
      this.logger.error(
        { error, messageId: message.id?._serialized },
        'Failed to get chat for incoming message',
      );
      return;
    }

    const filterable = toFilterableMessage(message, chat);
    const skipMediaProcessing = getIgnoreReason(filterable, this.config) !== undefined;
    const runtimeMessage = skipMediaProcessing
      ? toLightweightRuntimeMessage(message, chat, this.logger)
      : await toRuntimeMessage(message, chat, this.config, this.logger);

    await this.messageHandler(runtimeMessage);
  }
}

function getChatId(message: Message, chat: Chat): string {
  const rawChatSerialized = chat.id?._serialized;
  return typeof rawChatSerialized === 'string' ? rawChatSerialized : (message.from ?? '');
}

function getMessageId(message: Message): string {
  return typeof message.id?._serialized === 'string'
    ? message.id._serialized
    : `${message.from}:${message.timestamp}:${message.body}`;
}

function formatBody(
  text: string | undefined,
  hasMedia: boolean | undefined,
  type: string | undefined,
): string {
  const clean = typeof text === 'string' ? text.trim() : '';
  return clean && hasMedia
    ? `${clean} ${mediaTypeLabel(type)}`
    : clean || (hasMedia ? mediaTypeLabel(type) : '');
}

function toFilterableMessage(message: Message, chat: Chat) {
  const chatId = getChatId(message, chat);
  return {
    id: getMessageId(message),
    body: message.body,
    fromMe: message.fromMe,
    isGroup: Boolean(chat.isGroup),
    isBroadcast: isBroadcastMessage(message, chatId),
    hasMedia: message.hasMedia,
    messageType: message.type,
    chatId,
    archived: Boolean(chat.archived),
  };
}

function toLightweightRuntimeMessage(
  message: Message,
  chat: Chat,
  logger: Logger,
): RuntimeIncomingMessage {
  const chatId = getChatId(message, chat);

  return {
    id: getMessageId(message),
    chatId,
    timestamp: message.timestamp,
    body: formatBody(message.body, message.hasMedia, message.type),
    fromMe: message.fromMe,
    isGroup: Boolean(chat.isGroup),
    isBroadcast: isBroadcastMessage(message, chatId),
    archived: Boolean(chat.archived),
    hasMedia: message.hasMedia,
    messageType: message.type,
    chatName: chat.name,
    authorName: message.fromMe
      ? undefined
      : message.author
        ? message.author.replace(/@(c\.us|g\.us)$/, '')
        : chat.name,
    fetchContext: (limit) => fetchChatContext(chat, limit),
    sendMessage:
      chatId === 'status@broadcast'
        ? async () => {
            logger.debug({ chatId }, 'Status broadcast messages cannot be replied to');
          }
        : (text: string) => message.reply(text).then(() => undefined),
  };
}

async function toRuntimeMessage(
  message: Message,
  chat: Chat,
  config: AppConfig,
  logger: Logger,
): Promise<RuntimeIncomingMessage> {
  const chatId = getChatId(message, chat);

  let quotedMessage: RuntimeIncomingMessage['quotedMessage'] | undefined;

  if (message.hasQuotedMsg) {
    try {
      const quoted = await message.getQuotedMessage();
      const quotedBody = formatBody(quoted.body, quoted.hasMedia, quoted.type);
      if (quotedBody) {
        quotedMessage = {
          id: typeof quoted.id?._serialized === 'string' ? quoted.id._serialized : undefined,
          body: quotedBody,
          fromMe: quoted.fromMe,
        };
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch quoted message, continuing without it');
    }
  }

  let imageData: RuntimeIncomingMessage['imageData'] | undefined;
  if (
    config.llm.visionSupport &&
    message.hasMedia &&
    (message.type === 'image' || message.type === 'sticker')
  ) {
    const media = await downloadMediaWithRetry(message, logger, 'image/sticker');
    if (media) {
      imageData = { base64: media.data, mimeType: media.mimetype };
    }
  }

  let audioData: RuntimeIncomingMessage['audioData'] | undefined;
  let voiceBody: string | undefined;

  if (message.hasMedia && message.type === 'ptt' && config.voiceNote?.mode !== 'ignore') {
    const media = await downloadMediaWithRetry(message, logger, 'voice note');
    if (media) {
      try {
        const mp3Base64 = await oggToMp3(media.data);

        if (config.voiceNote?.mode === 'whisper_cloud') {
          voiceBody = await transcribeCloud(mp3Base64, config);
        } else if (config.voiceNote?.mode === 'whisper_local') {
          voiceBody = await transcribeLocal(mp3Base64, config);
        } else if (config.voiceNote?.mode === 'native_audio') {
          audioData = { base64: mp3Base64, format: 'mp3' };
        }
      } catch (error) {
        logger.warn({ error }, 'Voice note processing failed, falling back to text label');
      }
    }
  }

  return {
    id: getMessageId(message),
    chatId,
    timestamp: message.timestamp,
    body: voiceBody ?? formatBody(message.body, message.hasMedia, message.type),
    fromMe: message.fromMe,
    isGroup: Boolean(chat.isGroup),
    isBroadcast: isBroadcastMessage(message, chatId),
    archived: Boolean(chat.archived),
    hasMedia: message.hasMedia,
    messageType: message.type,
    imageData,
    audioData,
    quotedMessage,
    chatName: chat.name,
    authorName: message.fromMe
      ? undefined
      : message.author
        ? message.author.replace(/@(c\.us|g\.us)$/, '')
        : chat.name,
    fetchContext: (limit) => fetchChatContext(chat, limit),
    sendMessage:
      chatId === 'status@broadcast'
        ? async () => {
            logger.debug({ chatId }, 'Status broadcast messages cannot be replied to');
          }
        : (text: string) => message.reply(text).then(() => undefined),
  };
}

export async function downloadMediaWithRetry(
  message: Message,
  logger: Logger,
  label: string,
): Promise<{ data: string; mimetype: string } | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let timeoutId: NodeJS.Timeout | undefined;
    let downloadPromise: Promise<{ data: string; mimetype: string } | undefined | null> | undefined;
    try {
      downloadPromise = message.downloadMedia();
      const media = await Promise.race([
        downloadPromise,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('downloadMedia timed out')), 30_000);
        }),
      ]);
      if (media && media.data && media.mimetype) {
        return { data: media.data, mimetype: media.mimetype };
      }
    } catch (error) {
      logger.warn(
        { error, errMsg: error instanceof Error ? error.message : String(error), attempt },
        `${label} media download failed, retrying...`,
      );
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      downloadPromise?.catch(() => {});
    }
  }
  logger.warn(`${label} media download failed after 3 attempts, continuing without media data`);
  return undefined;
}

function isBroadcastMessage(message: Message, chatId: string): boolean {
  return (
    message.from === 'status@broadcast' ||
    message.to === 'status@broadcast' ||
    chatId === 'status@broadcast' ||
    chatId.endsWith('@broadcast')
  );
}

type SessionMessages = {
  ready: string;
  timeout: string;
  disconnect: string;
};

async function initializeAndFinalizeSession(
  clientId: string,
  logger: Logger,
  messages: SessionMessages,
  loginDelayMs: number,
): Promise<void> {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId,
      dataPath: getWhatsAppSessionDir(),
    }),
    userAgent: getPlatformUserAgent(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
    webVersionCache: {
      type: 'none',
    },
  });

  await new Promise<void>((resolve, reject) => {
    let authenticated = false;
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      client.destroy().catch(() => {});
      reject(new Error(messages.timeout));
    }, 120_000);

    client.on('qr', (qr) => {
      logger.info('Scan this QR code with WhatsApp linked devices to log in.');
      qrcode.generate(qr, { small: true });
    });

    client.on('loading_screen', (_percent, message) => {
      logger.info(`${message}...`);
    });

    client.on('ready', () => {
      clearTimeout(timeout);
      authenticated = true;
      logger.info(messages.ready);
      setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
        client.destroy().catch(() => {});
      }, loginDelayMs);
    });

    client.on('auth_failure', (msg) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      client.destroy().catch(() => {});
      const authMsg = typeof msg === 'string' ? msg : JSON.stringify(msg);
      reject(new Error(`WhatsApp authentication failed: ${authMsg}`));
    });

    client.on('disconnected', (reason) => {
      if (authenticated || settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      client.destroy().catch(() => {});
      reject(new Error(messages.disconnect + reason));
    });

    logger.info('Downloading browser and connecting to WhatsApp...');
    client.initialize().catch((err: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      client.destroy().catch(() => {});
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

export async function calibrateWhatsApp(
  accountName: string | undefined,
  logger: Logger,
  loginDelayMs: number = 500,
): Promise<void> {
  const clientId = accountName ? validateWhatsAppAccountName(accountName) : 'default';
  logger.info('Calibrating ReplyPilot. This may take a few minutes on first run...');
  await initializeAndFinalizeSession(clientId, logger, {
    ready: 'WhatsApp session ready.',
    timeout: 'Calibration timed out after 120 seconds.',
    disconnect: 'WhatsApp disconnected during calibration: ',
  }, loginDelayMs);
}

export async function loginWhatsAppAccount(
  accountName: string,
  logger: Logger,
  loginDelayMs: number = 500,
): Promise<void> {
  const clientId = validateWhatsAppAccountName(accountName);
  await initializeAndFinalizeSession(clientId, logger, {
    ready: `WhatsApp account "${clientId}" authenticated and saved.`,
    timeout: 'Login timed out after 120 seconds.',
    disconnect: 'WhatsApp disconnected during login: ',
  }, loginDelayMs);
}
