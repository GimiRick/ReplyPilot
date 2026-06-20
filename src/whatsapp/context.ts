import { type ChatContextMessage } from '../llm/provider';

export type WhatsAppRawMessage = {
  id?: string | { _serialized?: string };
  fromMe?: boolean;
  body?: string;
  hasMedia?: boolean;
  timestamp?: number;
  type?: string;
  author?: string;
};

export type WhatsAppRawChat = {
  fetchMessages?(options: { limit: number }): Promise<WhatsAppRawMessage[]>;
};

export async function fetchChatContext(
  chat: WhatsAppRawChat,
  limit: number,
): Promise<ChatContextMessage[]> {
  if (typeof chat.fetchMessages !== 'function') {
    return [];
  }

  const messages = await chat.fetchMessages({ limit });
  return normalizeChatMessages(messages).slice(-limit);
}

export function normalizeChatMessages(messages: WhatsAppRawMessage[]): ChatContextMessage[] {
  let lastTimestamp = 0;
  const messagesWithTime = messages.map((msg) => {
    let timestamp = msg.timestamp;
    if (timestamp !== undefined) {
      lastTimestamp = timestamp;
    } else {
      timestamp = lastTimestamp;
    }
    return { ...msg, timestamp };
  });

  return messagesWithTime
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      if (a.message.timestamp !== b.message.timestamp) {
        return (a.message.timestamp ?? 0) - (b.message.timestamp ?? 0);
      }
      return a.index - b.index;
    })
    .map(({ message }) => normalizeChatMessage(message))
    .filter((message): message is ChatContextMessage => Boolean(message));
}

export function normalizeChatMessage(message: WhatsAppRawMessage): ChatContextMessage | undefined {
  const body = normalizeMessageBody(message);

  if (!body) {
    return undefined;
  }

  let authorName = message.author;
  if (authorName) {
    authorName = authorName.replace(/@(c\.us|g\.us)$/, '');
  }

  return {
    id: normalizeMessageId(message.id),
    direction: message.fromMe ? 'owner' : 'contact',
    body,
    timestamp: message.timestamp,
    authorName,
  };
}

function normalizeMessageBody(message: WhatsAppRawMessage): string | undefined {
  const text = typeof message.body === 'string' ? message.body.trim() : undefined;

  if (text) {
    return text;
  }

  if (message.hasMedia) {
    return mediaTypeLabel(message.type);
  }

  return undefined;
}

export function mediaTypeLabel(type?: string): string {
  switch (type) {
    case 'image':
      return '[image]';
    case 'video':
      return '[video]';
    case 'audio':
      return '[audio]';
    case 'document':
      return '[document]';
    case 'sticker':
      return '[sticker]';
    case 'ptt':
      return '[voice note]';
    case 'location':
      return '[location]';
    case 'vcard':
      return '[contact card]';
    default:
      return '[media message]';
  }
}

function normalizeMessageId(id: WhatsAppRawMessage['id']): string | undefined {
  if (!id) {
    return undefined;
  }

  return typeof id === 'string' ? id : id._serialized;
}
