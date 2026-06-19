import { createRequire } from 'node:module';

import qrcode from 'qrcode-terminal';
import type { Chat, Client as WhatsAppWebClient, Message } from 'whatsapp-web.js';

import { type AppConfig } from '../config/schema';
import { getWhatsAppSessionDir } from '../config/store';
import { type RuntimeIncomingMessage } from '../runtime/automation';
import { type Logger } from '../runtime/logger';
import { fetchChatContext } from './context';

const require = createRequire(import.meta.url);
const { Client, LocalAuth } = require('whatsapp-web.js') as typeof import('whatsapp-web.js');

export type WhatsAppMessageHandler = (message: RuntimeIncomingMessage) => void | Promise<void>;

export class WhatsAppClientAdapter {
  private readonly client: WhatsAppWebClient;
  private messageHandler?: WhatsAppMessageHandler;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: config.whatsapp.sessionName,
        dataPath: getWhatsAppSessionDir(),
      }),
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
        this.logger.error({ error, messageId: message.id?._serialized }, 'WhatsApp message handler failed');
      });
    });

    await this.client.initialize();
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
      this.logger.warn({ reason }, 'WhatsApp client disconnected');
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
      this.logger.error({ error, messageId: message.id?._serialized }, 'Failed to get chat for incoming message');
      return;
    }

    await this.messageHandler(toRuntimeMessage(message, chat));
  }
}

function toRuntimeMessage(message: Message, chat: Chat): RuntimeIncomingMessage {
  const chatId = chat.id?._serialized ?? message.from;

  return {
    id: message.id?._serialized ?? `${message.from}:${message.timestamp}:${message.body}`,
    chatId,
    body: message.body ?? '',
    fromMe: message.fromMe,
    isGroup: Boolean(chat.isGroup),
    isBroadcast: isBroadcastMessage(message, chatId),
    fetchContext: (limit) => fetchChatContext(chat, limit),
    sendMessage: (text) => chat.sendMessage(text).then(() => undefined),
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
