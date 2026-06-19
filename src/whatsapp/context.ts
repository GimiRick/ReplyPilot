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
