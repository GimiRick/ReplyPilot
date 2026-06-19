import { describe, expect, it } from 'vitest';

import { MessageQueue } from '../../src/runtime/queue';

describe('MessageQueue', () => {
  it('resolves onIdle after queued work finishes', async () => {
    const queue = new MessageQueue({ globalConcurrency: 1, perChatConcurrency: 1 });
    const events: string[] = [];

    const work = queue.add('chat', async () => {
      events.push('work');
      return 'done';
    });

    await queue.onIdle();

    expect(await work).toBe('done');
    expect(events).toEqual(['work']);
  });
});
