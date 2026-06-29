import { createRequire } from 'node:module';

import qrcode from 'qrcode-terminal';
import type { Chat, Client as WhatsAppWebClient, Message } from 'whatsapp-web.js';

import { type AppConfig } from '../config/schema';
import { getWhatsAppSessionDir } from '../config/store';
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

    this.registerLifecycleEvents();
  }

  onMessage(handler: WhatsAppMessageHandler): void {
    this.messageHandler = handler;
  }

  async start(): Promise<void> {
    this.client.on('message', (message) => {
      this.handleMessage(message).catch((error) => {
        this.logger.error(
          { error, messageId: message.id?._serialized },
          'WhatsApp message handler failed',
        );
      });
    });

    try {
      await this.client.initialize();
    } catch (error) {
      await this.client.destroy().catch(() => {});
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  private registerLifecycleEvents(): void {
    this.client.on('qr', (qr) => {
      this.logger.info('Scan this QR code with WhatsApp linked devices');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      this.logger.info('ReplyPilot is connected to WhatsApp');
    });

    this.client.on('disconnected', (reason) => {
      if (reason !== 'LOGOUT') {
        this.logger.warn({ reason }, 'WhatsApp client disconnected');
      }
    });
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
  return clean && hasMedia ? `${clean} ${mediaTypeLabel(type)}` : (clean || (hasMedia ? mediaTypeLabel(type) : ''));
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
    hasMedia: message.hasMedia,
    messageType: message.type,
    chatName: chat.name,
    fetchContext: (limit) => fetchChatContext(chat, limit),
    sendMessage: chatId === 'status@broadcast'
      ? async () => { logger.debug({ chatId }, 'Status broadcast messages cannot be replied to'); }
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
  if (config.llm.visionSupport && message.hasMedia && (message.type === 'image' || message.type === 'sticker')) {
    try {
      const media = await message.downloadMedia();
      imageData = { base64: media.data, mimeType: media.mimetype };
    } catch (error) {
      logger.warn({ error }, 'Image/sticker media download failed, continuing without image data');
    }
  }

  let audioData: RuntimeIncomingMessage['audioData'] | undefined;
  let voiceBody: string | undefined;

  if (message.hasMedia && message.type === 'ptt' && config.voiceNote?.mode !== 'ignore') {
    try {
      const media = await message.downloadMedia();
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

  return {
    id: getMessageId(message),
    chatId,
    timestamp: message.timestamp,
    body: voiceBody ?? formatBody(message.body, message.hasMedia, message.type),
    fromMe: message.fromMe,
    isGroup: Boolean(chat.isGroup),
    isBroadcast: isBroadcastMessage(message, chatId),
    hasMedia: message.hasMedia,
    messageType: message.type,
    imageData,
    audioData,
    quotedMessage,
    chatName: chat.name,
    fetchContext: (limit) => fetchChatContext(chat, limit),
    sendMessage: chatId === 'status@broadcast'
      ? async () => { logger.debug({ chatId }, 'Status broadcast messages cannot be replied to'); }
      : (text: string) => message.reply(text).then(() => undefined),
  };
}

function isBroadcastMessage(message: Message, chatId: string): boolean {
  return (
    message.from === 'status@broadcast' ||
    message.to === 'status@broadcast' ||
    chatId === 'status@broadcast' ||
    chatId.endsWith('@broadcast')
  );
}

export async function loginWhatsAppAccount(
  accountName: string,
  logger: Logger,
): Promise<void> {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: accountName,
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
      reject(new Error('Login timed out after 120 seconds.'));
    }, 120_000);

    client.on('qr', (qr) => {
      logger.info('Scan this QR code with WhatsApp linked devices to log in.');
      qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
      clearTimeout(timeout);
      authenticated = true;
      logger.info(`WhatsApp account "${accountName}" authenticated and saved.`);
      setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
        client.destroy().catch(() => {});
      }, 2000);
    });

    client.on('auth_failure', (msg) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      client.destroy().catch(() => {});
      reject(new Error(`WhatsApp authentication failed: ${msg}`));
    });

    client.on('disconnected', (reason) => {
      if (authenticated || settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      client.destroy().catch(() => {});
      reject(new Error(`WhatsApp disconnected during login: ${reason}`));
    });

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
