import { describe, expect, it } from 'vitest';

import {
  DuplicateMessageGuard,
  getIgnoreReason,
  shouldProcessMessage,
} from '../../src/whatsapp/filters';
import { makeConfig } from '../fixtures/app-config';

describe('WhatsApp message filters', () => {
  it('ignores self messages when ignoreSelf is enabled', () => {
    expect(getIgnoreReason({ id: '1', body: 'hello', fromMe: true }, makeConfig())).toBe('self');
  });

  it('ignores empty messages', () => {
    expect(getIgnoreReason({ id: '1', body: '   ' }, makeConfig())).toBe('empty');
  });

  it('ignores group messages by default', () => {
    expect(getIgnoreReason({ id: '1', body: 'hello', isGroup: true }, makeConfig())).toBe('group');
  });

  it('processes group messages only when enabled', () => {
    const config = makeConfig({ whatsapp: { allowGroups: true } });

    expect(shouldProcessMessage({ id: '1', body: 'hello', isGroup: true }, config)).toBe(true);
  });

  it('ignores broadcast messages by default', () => {
    expect(getIgnoreReason({ id: '1', body: 'hello', isBroadcast: true }, makeConfig())).toBe(
      'broadcast',
    );
  });

  it('processes broadcast messages only when enabled', () => {
    const config = makeConfig({ whatsapp: { allowBroadcasts: true } });

    expect(shouldProcessMessage({ id: '1', body: 'hello', isBroadcast: true }, config)).toBe(true);
  });

  it('ignores status@broadcast even when allowBroadcasts is enabled', () => {
    const config = makeConfig({ whatsapp: { allowBroadcasts: true } });

    expect(
      getIgnoreReason({ id: '1', body: 'hello', chatId: 'status@broadcast' }, config),
    ).toBe('status_broadcast');
    expect(
      shouldProcessMessage({ id: '1', body: 'hello', chatId: 'status@broadcast' }, config),
    ).toBe(false);
  });

  it('ignores status@broadcast even when all broadcasts are allowed', () => {
    const config = makeConfig({
      whatsapp: { allowBroadcasts: true, allowGroups: true },
    });

    expect(
      getIgnoreReason({ id: '1', body: 'hello', chatId: 'status@broadcast', isBroadcast: true, isGroup: false }, config),
    ).toBe('status_broadcast');
  });

  it('does not affect regular broadcast list messages when broadcasts are enabled', () => {
    const config = makeConfig({ whatsapp: { allowBroadcasts: true } });

    expect(
      shouldProcessMessage({ id: '1', body: 'hello', isBroadcast: true }, config),
    ).toBe(true);
  });

  it('processes direct contact messages', () => {
    expect(shouldProcessMessage({ id: '1', body: 'hello' }, makeConfig())).toBe(true);
  });

  it('processes media-only messages without text body', () => {
    expect(
      shouldProcessMessage({ id: '1', body: '', hasMedia: true }, makeConfig()),
    ).toBe(true);
  });

  it('ignores voice notes when voiceNote mode is ignore', () => {
    expect(
      getIgnoreReason({ id: '1', body: '', hasMedia: true, messageType: 'ptt' }, makeConfig()),
    ).toBe('voice_note_ignored');
  });

  it('passes voice notes when voiceNote mode is not ignore', () => {
    const config = makeConfig({ voiceNote: { mode: 'native_audio', whisperModel: 'whisper-1' } });

    expect(
      shouldProcessMessage({ id: '1', body: '', hasMedia: true, messageType: 'ptt' }, config),
    ).toBe(true);
  });

  it('guards duplicate message IDs', () => {
    const guard = new DuplicateMessageGuard();

    expect(guard.markIfNew('abc')).toBe(true);
    expect(guard.markIfNew('abc')).toBe(false);
  });

  it('can clear and prune duplicate IDs', () => {
    const guard = new DuplicateMessageGuard(2);

    expect(guard.markIfNew('one')).toBe(true);
    expect(guard.markIfNew('two')).toBe(true);
    expect(guard.markIfNew('three')).toBe(true);
    expect(guard.has('one')).toBe(false);
    expect(guard.has('three')).toBe(true);

    guard.clear();

    expect(guard.has('three')).toBe(false);
  });

  it('handles empty iterator safely during prune', () => {
    const guard = new DuplicateMessageGuard(0);
    const seenMap = (guard as unknown as { seen: Map<string, number> }).seen;
    const originalKeys = seenMap.keys;
    seenMap.keys = function() {
      return { next: () => ({ value: undefined, done: true }) } as unknown as MapIterator<string>;
    };
    
    try {
      guard.markIfNew('test');
      expect(guard.has('test')).toBe(true);
    } finally {
      seenMap.keys = originalKeys;
    }
  });
});
