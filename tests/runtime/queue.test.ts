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

  it('reuses existing queue for the same chat', async () => {
    const queue = new MessageQueue({ globalConcurrency: 1, perChatConcurrency: 1 });
    const order: number[] = [];

    const work1 = queue.add('chat', async () => {
      order.push(1);
      return 'first';
    });

    const work2 = queue.add('chat', async () => {
      order.push(2);
      return 'second';
    });

    await queue.onIdle();

    expect(await work1).toBe('first');
    expect(await work2).toBe('second');
    expect(order).toEqual([1, 2]);
  });
});
