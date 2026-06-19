import { describe, expect, it } from 'vitest';

import {
  buildReplyPrompt,
  cleanGeneratedReply,
  formatChatContext,
  trimContextMessages,
} from '../../src/llm/prompt';
import { type ChatContextMessage } from '../../src/llm/provider';

describe('prompt builder', () => {
  const messages: ChatContextMessage[] = [
    { direction: 'contact', body: 'Are you free today?' },
    { direction: 'owner', body: 'After 6 works.' },
  ];

  it('includes owner personality and incoming message', () => {
    const prompt = buildReplyPrompt({
      model: 'local-model',
      modelLabel: 'Local Llama',
      ownerStylePrompt: 'Use a friendly Hinglish tone.',
      messages,
      incomingMessage: 'Cool, 7 pm?',
    });

    expect(prompt[0].content).toContain('Use a friendly Hinglish tone.');
    expect(prompt[1].content).toContain('Incoming contact message: Cool, 7 pm?');
  });

  it('marks owner and contact direction', () => {
    expect(formatChatContext(messages)).toContain('contact: Are you free today?');
    expect(formatChatContext(messages)).toContain('owner: After 6 works.');
  });

  it('handles empty chat context', () => {
    expect(formatChatContext([])).toBe('No recent text messages are available.');
  });

  it('does not exceed configured context message count', () => {
    const trimmed = trimContextMessages(
      [
        { direction: 'contact', body: 'one' },
        { direction: 'owner', body: 'two' },
        { direction: 'contact', body: 'three' },
      ],
      2,
    );

    expect(trimmed.map((message) => message.body)).toEqual(['two', 'three']);
  });

  it('cleans obvious reply labels and wrapping quotes', () => {
    expect(cleanGeneratedReply('Reply: "Sure, sounds good."')).toBe('Sure, sounds good.');
  });
});
