import { type ChatContextMessage, type GenerateReplyInput } from './provider';

export type PromptMessage = {
  role: 'system' | 'user';
  content: string;
};

export function buildReplyPrompt(input: GenerateReplyInput): PromptMessage[] {
  const contextBlock = formatChatContext(input.messages);

  return [
    {
      role: 'system',
      content: [
        'You are an AI assistant that replies to WhatsApp messages for the account owner while they are busy.',
        "Reply in the owner's natural voice, short and casual, exactly how they would text.",
        'Only use emojis when the conversation genuinely calls for one, never force them in.',
        'Do not use dashes of any kind. Use plain text only.',
        'Never mention that you are an AI, that the owner is busy, or that this is automated.',
        'Only reply based on the conversation history, do not invent information.',
        'If something is unclear, ask a short question rather than guessing.',
        `Owner style: ${input.ownerStylePrompt.trim()}`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Model label: ${input.modelLabel}`,
        'Recent chat history, oldest to newest:',
        contextBlock,
        '',
        `Incoming contact message: ${normalizeInlineText(input.incomingMessage)}`,
        '',
        'Write only the next WhatsApp reply from the owner. Do not prefix it with a label.',
      ].join('\n'),
    },
  ];
}

export function formatChatContext(messages: ChatContextMessage[]): string {
  if (messages.length === 0) {
    return 'No recent text messages are available.';
  }

  return messages
    .map((message) => {
      const direction = message.direction === 'owner' ? 'owner' : 'contact';
      return `${direction}: ${normalizeInlineText(message.body)}`;
    })
    .join('\n');
}

export function trimContextMessages(
  messages: ChatContextMessage[],
  messageCount: number,
): ChatContextMessage[] {
  return messages.slice(-messageCount);
}

export function cleanGeneratedReply(rawText: string): string {
  let text = rawText.replace(/\r\n/g, '\n').trim();

  let prevText: string;
  do {
    prevText = text;
    text = text.replace(/^(assistant|reply|response|owner)\s*:\s*/i, '').trim();
    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      text = text.slice(1, -1).trim();
    }
  } while (text !== prevText);

  return text;
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
