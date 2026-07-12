import { type AppConfig } from '../config/schema';

export type FilterableWhatsAppMessage = {
  id: string;
  body?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  isBroadcast?: boolean;
  hasMedia?: boolean;
  messageType?: string;
  chatId?: string;
  archived?: boolean;
};

export type IgnoreReason =
  | 'self'
  | 'empty'
  | 'group'
  | 'broadcast'
  | 'duplicate'
  | 'voice_note_ignored'
  | 'status_broadcast'
  | 'archived'
  | 'shutting_down'
  | 'too_many_chats';

export function getIgnoreReason(
  message: FilterableWhatsAppMessage,
  config: AppConfig,
): IgnoreReason | undefined {
  if (config.safety.ignoreSelf && message.fromMe) {
    return 'self';
  }

  if (message.chatId === 'status@broadcast') {
    return 'status_broadcast';
  }

  if (message.archived && !config.whatsapp.allowArchived) {
    return 'archived';
  }

  if (message.isGroup && !config.whatsapp.allowGroups) {
    return 'group';
  }

  if (message.isBroadcast && !config.whatsapp.allowBroadcasts) {
    return 'broadcast';
  }

  if (message.hasMedia && message.messageType === 'ptt' && config.voiceNote?.mode === 'ignore') {
    return 'voice_note_ignored';
  }

  if (!message.body?.trim() && !message.hasMedia) {
    return 'empty';
  }

  return undefined;
}

export function shouldProcessMessage(
  message: FilterableWhatsAppMessage,
  config: AppConfig,
): boolean {
  return getIgnoreReason(message, config) === undefined;
}

export class DuplicateMessageGuard {
  private readonly seen = new Map<string, true>();

  constructor(private readonly maxEntries = 5_000) {}

  markIfNew(messageId: string): boolean {
    if (this.seen.has(messageId)) {
      return false;
    }

    this.seen.set(messageId, true);
    this.prune();
    return true;
  }

  has(messageId: string): boolean {
    return this.seen.has(messageId);
  }

  clear(): void {
    this.seen.clear();
  }

  private prune(): void {
    if (this.seen.size <= this.maxEntries) {
      return;
    }

    const oldestId = this.seen.keys().next().value;
    if (oldestId !== undefined) {
      this.seen.delete(oldestId);
    }
  }
}
