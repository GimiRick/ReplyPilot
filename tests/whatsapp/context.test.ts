import { describe, expect, it, vi } from 'vitest';

import {
  fetchChatContext,
  normalizeChatMessage,
  normalizeChatMessages,
} from '../../src/whatsapp/context';

describe('WhatsApp chat context', () => {
  it('normalizes messages oldest to newest', () => {
    const messages = normalizeChatMessages([
      { id: '2', body: 'new', timestamp: 20, fromMe: true },
      { id: '1', body: 'old', timestamp: 10, fromMe: false },
    ]);

    expect(messages.map((message) => message.body)).toEqual(['old', 'new']);
    expect(messages.map((message) => message.direction)).toEqual(['contact', 'owner']);
  });

  it('includes a media placeholder when text is not available', () => {
    expect(normalizeChatMessage({ id: 'm1', hasMedia: true })?.body).toBe('[media message]');
  });

  it('normalizes object message IDs and missing IDs', () => {
    expect(normalizeChatMessage({ id: { _serialized: 'serialized' }, body: 'hi' })?.id).toBe(
      'serialized',
    );
    expect(normalizeChatMessage({ body: 'hi' })?.id).toBeUndefined();
  });

  it('preserves input order when timestamps are missing', () => {
    expect(
      normalizeChatMessages([
        { id: '1', body: 'first' },
        { id: '2', body: 'second' },
      ]).map((message) => message.body),
    ).toEqual(['first', 'second']);
  });

  it('drops empty non-media messages', () => {
    expect(normalizeChatMessage({ id: 'm1', body: '   ' })).toBeUndefined();
  });

  it('fetches messages with the configured limit', async () => {
    const fetchMessages = vi.fn(async () => [
      { id: '1', body: 'one', timestamp: 1 },
      { id: '2', body: 'two', timestamp: 2 },
      { id: '3', body: 'three', timestamp: 3 },
    ]);

    const context = await fetchChatContext({ fetchMessages }, 2);

    expect(fetchMessages).toHaveBeenCalledWith({ limit: 2 });
    expect(context.map((message) => message.body)).toEqual(['two', 'three']);
  });
});
