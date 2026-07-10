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
    expect(prompt[1].content).toContain('Incoming message: Cool, 7 pm?');
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
    expect(cleanGeneratedReply('"Reply: Sure, sounds good."')).toBe('Sure, sounds good.');
    expect(cleanGeneratedReply('owner: "assistant: Sure, sounds good."')).toBe(
      'Sure, sounds good.',
    );
  });

  it('includes quoted message context when replying to a previous message', () => {
    const prompt = buildReplyPrompt({
      model: 'local-model',
      modelLabel: 'Local Llama',
      ownerStylePrompt: 'Friendly tone.',
      messages: [{ direction: 'contact', body: 'Can we meet tomorrow?' }],
      incomingMessage: 'Sure, 10am works.',
      incomingMessageQuoted: { body: 'Can we meet tomorrow?', direction: 'owner' },
    });

    expect(prompt[1].content).toContain('is a reply to a message from the owner');
    expect(prompt[1].content).toContain('Can we meet tomorrow?');
    expect(prompt[1].content).toContain('Sure, 10am works.');
  });

  it('includes chat name in prompt when provided', () => {
    const prompt = buildReplyPrompt({
      model: 'local-model',
      modelLabel: 'Local Llama',
      ownerStylePrompt: 'Short replies.',
      messages: [],
      incomingMessage: 'Hello!',
      chatName: 'Family Group',
    });

    expect(prompt[1].content).toContain('Chat: Family Group');
  });

  it('includes sender name in incoming message label when provided', () => {
    const prompt = buildReplyPrompt({
      model: 'local-model',
      modelLabel: 'Local Llama',
      ownerStylePrompt: 'Short replies.',
      messages: [],
      incomingMessage: 'Are you free?',
      incomingMessageAuthorName: 'Alice',
    });

    expect(prompt[1].content).toContain('Incoming message from Alice: Are you free?');
  });

  it('labels group messages differently', () => {
    const prompt = buildReplyPrompt({
      model: 'local-model',
      modelLabel: 'Local Llama',
      ownerStylePrompt: 'Short replies.',
      messages: [],
      incomingMessage: 'Hello everyone!',
      isGroup: true,
    });

    expect(prompt[1].content).toContain('Incoming group message');
  });

  it('shows contact direction for quoted message from contact', () => {
    const prompt = buildReplyPrompt({
      model: 'local-model',
      modelLabel: 'Local Llama',
      ownerStylePrompt: 'Friendly tone.',
      messages: [],
      incomingMessage: 'Sure.',
      incomingMessageQuoted: { body: 'Are you free?', direction: 'contact' },
    });

    expect(prompt[1].content).toContain('is a reply to a message from the contact');
  });

  it('cleans single-quoted replies', () => {
    expect(cleanGeneratedReply("'Reply: See you.'")).toBe('See you.');
  });

  it('returns content array when image data is present', () => {
    const prompt = buildReplyPrompt({
      model: 'local-model',
      modelLabel: 'Local Llama',
      ownerStylePrompt: 'Friendly tone.',
      messages: [],
      incomingMessage: 'Check this photo',
      imageData: { base64: 'img-data', mimeType: 'image/jpeg' },
    });

    const content = prompt[1].content;
    expect(Array.isArray(content)).toBe(true);

    const parts = content as unknown as Array<Record<string, unknown>>;
    expect(parts.some((part) => part.type === 'image_url')).toBe(true);
    expect(parts.some((part) => part.type === 'text')).toBe(true);
  });

  it('includes both image and audio when both are present', () => {
    const prompt = buildReplyPrompt({
      model: 'local-model',
      modelLabel: 'Local Llama',
      ownerStylePrompt: 'Friendly tone.',
      messages: [],
      incomingMessage: 'Media message',
      imageData: { base64: 'img-data', mimeType: 'image/jpeg' },
      audioData: { base64: 'audio-data', format: 'mp3' },
    });

    const content = prompt[1].content;
    expect(Array.isArray(content)).toBe(true);

    const parts = content as unknown as Array<Record<string, unknown>>;
    expect(parts.some((part) => part.type === 'image_url')).toBe(true);
    expect(parts.some((part) => part.type === 'input_audio')).toBe(true);
    expect(parts.some((part) => part.type === 'text')).toBe(true);
  });

  it('includes audio data as input_audio content part', () => {
    const prompt = buildReplyPrompt({
      model: 'local-model',
      modelLabel: 'Local Llama',
      ownerStylePrompt: 'Friendly tone.',
      messages: [],
      incomingMessage: '[voice note]',
      audioData: { base64: 'fake-audio-data', format: 'mp3' },
    });

    const content = prompt[1].content;
    expect(Array.isArray(content)).toBe(true);

    const parts = content as unknown as Array<Record<string, unknown>>;
    const audioPart = parts.find((part) => part.type === 'input_audio');
    expect(audioPart).toBeDefined();
    expect((audioPart as { input_audio: { data: string; format: string } }).input_audio).toEqual({
      data: 'fake-audio-data',
      format: 'mp3',
    });
  });

  it('includes author name in context when provided', () => {
    const context = formatChatContext([
      { direction: 'owner', body: 'On my way' },
      { direction: 'contact', body: 'Hurry up!', authorName: 'Alice' },
    ]);

    expect(context).toContain('owner: On my way');
    expect(context).toContain('contact (Alice): Hurry up!');
  });
});
