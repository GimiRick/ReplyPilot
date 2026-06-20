import { type ChatContextMessage, type GenerateReplyInput } from './provider';

export type UserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } };

export type PromptMessage = {
  role: 'system' | 'user';
  content: string | UserContentPart[];
};

function buildUserContent(input: GenerateReplyInput): string | UserContentPart[] {
  const contextBlock = formatChatContext(input.messages);

  const userParts: string[] = [
    `Model label: ${input.modelLabel}`,
  ];

  if (input.chatName) {
    userParts.push(`Chat: ${input.chatName}`);
  }

  userParts.push('Recent chat history, oldest to newest:');
  userParts.push(contextBlock);
  userParts.push('');

  if (input.incomingMessageQuoted) {
    const sender = input.incomingMessageQuoted.direction === 'owner' ? 'the owner' : 'the contact';
    userParts.push(
      `The incoming message is a reply to a message from ${sender}: "${normalizeInlineText(input.incomingMessageQuoted.body)}"`,
    );
    userParts.push('');
  }

  const msgLabel = input.isGroup ? 'Incoming group message' : 'Incoming message';
  userParts.push(`${msgLabel}: ${normalizeInlineText(input.incomingMessage)}`);
  userParts.push('');
  userParts.push('Write only the next WhatsApp reply from the owner. Do not prefix it with a label.');

  const textContent = userParts.join('\n');

  if (input.imageData || input.audioData) {
    const parts: UserContentPart[] = [
      { type: 'text', text: textContent },
    ];

    if (input.imageData) {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${input.imageData.mimeType};base64,${input.imageData.base64}` },
      });
    }

    if (input.audioData) {
      parts.push({
        type: 'input_audio',
        input_audio: { data: input.audioData.base64, format: input.audioData.format },
      });
    }

    return parts;
  }

  return textContent;
}

export function buildReplyPrompt(input: GenerateReplyInput): PromptMessage[] {
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
      content: buildUserContent(input),
    },
  ];
}

export function formatChatContext(messages: ChatContextMessage[]): string {
  if (messages.length === 0) {
    return 'No recent text messages are available.';
  }

  return messages
    .map((message) => {
      let label: string;
      if (message.direction === 'owner') {
        label = 'owner';
      } else if (message.authorName) {
        label = `contact (${message.authorName})`;
      } else {
        label = 'contact';
      }
      return `${label}: ${normalizeInlineText(message.body)}`;
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
