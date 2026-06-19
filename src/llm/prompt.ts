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
        'You are replying as the WhatsApp account owner.',
        'Match the owner tone, personality, language, and normal message length.',
        'Do not reveal that an AI generated the message.',
        'Do not invent facts that are not present in the chat context.',
        'Keep replies natural and appropriate for WhatsApp.',
        'Only use emojis when the message genuinely calls for them — never force one in.',
        'If you are uncertain, ask a short clarification instead of pretending.',
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

  text = text.replace(/^(assistant|reply|response|owner)\s*:\s*/i, '').trim();

  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }

  return text;
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
