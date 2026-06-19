import PQueue from 'p-queue';

export type MessageQueueOptions = {
  globalConcurrency?: number;
  perChatConcurrency?: number;
};

export class MessageQueue {
  private readonly globalQueue: PQueue;
  private readonly chatQueues = new Map<string, PQueue>();
  private readonly perChatConcurrency: number;

  constructor(options: MessageQueueOptions = {}) {
    this.globalQueue = new PQueue({ concurrency: options.globalConcurrency ?? 2 });
    this.perChatConcurrency = options.perChatConcurrency ?? 1;
  }

  add<T>(chatId: string, task: () => Promise<T>): Promise<T> {
    const chatQueue = this.getChatQueue(chatId);
    return chatQueue.add(() => this.globalQueue.add(task)).finally(() => {
      if (chatQueue.size === 0 && chatQueue.pending === 0) {
        this.chatQueues.delete(chatId);
      }
    }) as Promise<T>;
  }

  onIdle(): Promise<void> {
    return Promise.all([
      this.globalQueue.onIdle(),
      ...Array.from(this.chatQueues.values(), (queue) => queue.onIdle()),
    ]).then(() => undefined);
  }

  private getChatQueue(chatId: string): PQueue {
    const existing = this.chatQueues.get(chatId);

    if (existing) {
      return existing;
    }

    const queue = new PQueue({ concurrency: this.perChatConcurrency });
    this.chatQueues.set(chatId, queue);
    return queue;
  }
}
