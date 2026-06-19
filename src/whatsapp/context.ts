import { type ChatContextMessage } from '../llm/provider';

export type WhatsAppRawMessage = {
  id?: string | { _serialized?: string };
  fromMe?: boolean;
  body?: string;
  hasMedia?: boolean;
  timestamp?: number;
};

export type WhatsAppRawChat = {
  fetchMessages(options: { limit: number }): Promise<WhatsAppRawMessage[]>;
};

export async function fetchChatContext(
  chat: WhatsAppRawChat,
  limit: number,
): Promise<ChatContextMessage[]> {
  const messages = await chat.fetchMessages({ limit });
  return normalizeChatMessages(messages).slice(-limit);
}

export function normalizeChatMessages(messages: WhatsAppRawMessage[]): ChatContextMessage[] {
  return [...messages]
    .sort((a, b) => {
      if (a.timestamp === undefined || b.timestamp === undefined) {
        return 0;
      }

      return a.timestamp - b.timestamp;
    })
    .map(normalizeChatMessage)
    .filter((message): message is ChatContextMessage => Boolean(message));
}

export function normalizeChatMessage(message: WhatsAppRawMessage): ChatContextMessage | undefined {
  const body = normalizeMessageBody(message);

  if (!body) {
    return undefined;
  }

  return {
    id: normalizeMessageId(message.id),
    direction: message.fromMe ? 'owner' : 'contact',
    body,
    timestamp: message.timestamp,
  };
}

function normalizeMessageBody(message: WhatsAppRawMessage): string | undefined {
  const text = message.body?.trim();

  if (text) {
    return text;
  }

  return message.hasMedia ? '[media message]' : undefined;
}

function normalizeMessageId(id: WhatsAppRawMessage['id']): string | undefined {
  if (!id) {
    return undefined;
  }

  return typeof id === 'string' ? id : id._serialized;
}
