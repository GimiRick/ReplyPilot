import { type AppConfig } from '../config/schema';

export type FilterableWhatsAppMessage = {
  id: string;
  body?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  isBroadcast?: boolean;
};

export type IgnoreReason = 'self' | 'empty' | 'group' | 'broadcast' | 'duplicate';

export function getIgnoreReason(
  message: FilterableWhatsAppMessage,
  config: AppConfig,
): IgnoreReason | undefined {
  if (config.safety.ignoreSelf && message.fromMe) {
    return 'self';
  }

  if (!message.body?.trim()) {
    return 'empty';
  }

  if (message.isGroup && !config.whatsapp.allowGroups) {
    return 'group';
  }

  if (message.isBroadcast && !config.whatsapp.allowBroadcasts) {
    return 'broadcast';
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
  private readonly seen = new Map<string, number>();

  constructor(private readonly maxEntries = 5_000) {}

  markIfNew(messageId: string): boolean {
    if (this.seen.has(messageId)) {
      return false;
    }

    this.seen.set(messageId, Date.now());
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
