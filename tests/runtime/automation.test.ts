import { describe, expect, it, vi } from 'vitest';

import {
  ReplyAutomation,
  processIncomingMessageBatch,
  type AutomationResult,
  type RuntimeIncomingMessage,
} from '../../src/runtime/automation';
import { type GenerateReplyInput, type LlmProvider } from '../../src/llm/provider';
import { MessageQueue } from '../../src/runtime/queue';
import { makeConfig } from '../fixtures/app-config';

describe('runtime message processing', () => {
  it('sends cleaned LLM output to WhatsApp', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const provider = makeProvider('Sure, see you.');

    const result = await processIncomingMessageBatch({
      messages: [makeMessage({ sendMessage })],
      config: makeConfig(),
      llmProvider: provider,
    });

    expect(result).toEqual({ status: 'sent', reply: 'Sure, see you.' });
    expect(sendMessage).toHaveBeenCalledWith('Sure, see you.');
  });

  it('returns ignored when batch is empty', async () => {
    const result = await processIncomingMessageBatch({
      messages: [],
      config: makeConfig(),
      llmProvider: makeProvider(''),
    });
    expect(result).toEqual({ status: 'ignored', reason: 'empty' });
  });

  it('dry-run logs generated reply and does not send', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const logger = { info: vi.fn() };

    const result = await processIncomingMessageBatch({
      messages: [makeMessage({ sendMessage })],
      config: makeConfig({ safety: { dryRun: true } }),
      llmProvider: makeProvider('Dry reply'),
      logger,
    });

    expect(result).toEqual({ status: 'dry-run', reply: 'Dry reply' });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });

  it('does not call WhatsApp when the provider fails', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const automation = new ReplyAutomation({
      config: makeConfig({ automation: { debounceMs: 0 } }),
      llmProvider: {
        generateReply: vi.fn(async () => {
          throw new Error('provider down');
        }),
      },
      logger: makeLogger(),
      queue: new MessageQueue(),
    });

    const result = await automation.handleIncomingMessage(makeMessage({ sendMessage }));

    expect(result.status).toBe('failed');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('ignores self messages before queueing', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const automation = new ReplyAutomation({
      config: makeConfig({ automation: { debounceMs: 0 } }),
      llmProvider: makeProvider('Reply'),
      logger: makeLogger(),
    });

    const result = await automation.handleIncomingMessage(
      makeMessage({ fromMe: true, sendMessage }),
    );

    expect(result).toEqual({ status: 'ignored', reason: 'self' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('ignores duplicate messages before queueing', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const automation = new ReplyAutomation({
      config: makeConfig({ automation: { debounceMs: 0 } }),
      llmProvider: makeProvider('Reply'),
      logger: makeLogger(),
    });

    await automation.handleIncomingMessage(makeMessage({ id: 'same', sendMessage }));
    const duplicate = await automation.handleIncomingMessage(
      makeMessage({ id: 'same', sendMessage }),
    );

    expect(duplicate).toEqual({ status: 'ignored', reason: 'duplicate' });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('batches same-chat messages sent within debounce window', async () => {
    const events: string[] = [];
    const provider: LlmProvider = {
      generateReply: vi.fn(async (input) => {
        events.push(`start:${input.incomingMessage}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`finish:${input.incomingMessage}`);
        return { text: input.incomingMessage, provider: 'test', model: input.model };
      }),
    };
    const automation = new ReplyAutomation({
      config: makeConfig({ automation: { debounceMs: 0 } }),
      llmProvider: provider,
      logger: makeLogger(),
      queue: new MessageQueue({ globalConcurrency: 2, perChatConcurrency: 1 }),
    });

    await Promise.all([
      automation.handleIncomingMessage(makeMessage({ id: '1', body: 'one', chatId: 'chat-a' })),
      automation.handleIncomingMessage(makeMessage({ id: '2', body: 'two', chatId: 'chat-a' })),
    ]);

    expect(events).toEqual(['start:one\ntwo', 'finish:one\ntwo']);
  });

  it('chronologically reorders out-of-order messages in a batch', async () => {
    const events: string[] = [];
    const provider: LlmProvider = {
      generateReply: vi.fn(async (input) => {
        events.push(`start:${input.incomingMessage}`);
        return { text: input.incomingMessage, provider: 'test', model: input.model };
      }),
    };
    const automation = new ReplyAutomation({
      config: makeConfig({ automation: { debounceMs: 0 } }),
      llmProvider: provider,
      logger: makeLogger(),
      queue: new MessageQueue({ globalConcurrency: 2, perChatConcurrency: 1 }),
    });

    // Simulate arriving out-of-order due to async parsing:
    // Message 'two' (timestamp 200) arrives to `handleIncomingMessage` FIRST.
    // Message 'one' (timestamp 100) arrives to `handleIncomingMessage` SECOND.
    await Promise.all([
      automation.handleIncomingMessage(
        makeMessage({ id: '2', timestamp: 200, body: 'two', chatId: 'chat-a' }),
      ),
      automation.handleIncomingMessage(
        makeMessage({ id: '1', timestamp: 100, body: 'one', chatId: 'chat-a' }),
      ),
    ]);

    // The batcher should sort by timestamp, resulting in "one\ntwo"
    expect(events).toEqual(['start:one\ntwo']);
  });

  it('uses the latest quoted message in a debounced batch', async () => {
    const generateReply = vi.fn(async (input: GenerateReplyInput) => ({
      text: 'Reply with quote',
      provider: 'test',
      model: input.model,
    }));
    const provider: LlmProvider = { generateReply };

    const result = await processIncomingMessageBatch({
      messages: [
        makeMessage({
          id: '1',
          timestamp: 100,
          body: 'first',
          quotedMessage: { body: 'older quote', fromMe: false },
        }),
        makeMessage({
          id: '2',
          timestamp: 200,
          body: 'second',
          quotedMessage: { body: 'latest quote', fromMe: true },
        }),
      ],
      config: makeConfig(),
      llmProvider: provider,
    });

    expect(result.status).toBe('sent');
    expect(generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        incomingMessageQuoted: { body: 'latest quote', direction: 'owner' },
      }),
    );
  });

  it('passes audioData to LLM when voiceNote mode is native_audio', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const generateReply = vi.fn(async (input: GenerateReplyInput) => ({
      text: 'I heard your voice note',
      provider: 'test',
      model: input.model,
    }));
    const provider: LlmProvider = { generateReply };

    const result = await processIncomingMessageBatch({
      messages: [makeMessage({ sendMessage, audioData: { base64: 'abc', format: 'mp3' } })],
      config: makeConfig({ voiceNote: { mode: 'native_audio', whisperModel: 'whisper-1' } }),
      llmProvider: provider,
    });

    expect(result.status).toBe('sent');
    expect(generateReply).toHaveBeenCalledWith(
      expect.objectContaining({ audioData: { base64: 'abc', format: 'mp3' } }),
    );
  });

  it('strips audioData when voiceNote mode is not native_audio', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const generateReply = vi.fn(async (input: GenerateReplyInput) => ({
      text: 'ok',
      provider: 'test',
      model: input.model,
    }));
    const provider: LlmProvider = { generateReply };

    const result = await processIncomingMessageBatch({
      messages: [makeMessage({ sendMessage, audioData: { base64: 'abc', format: 'mp3' } })],
      config: makeConfig({ voiceNote: { mode: 'whisper_cloud', whisperModel: 'whisper-1' } }),
      llmProvider: provider,
    });

    expect(result.status).toBe('sent');
    expect(generateReply).toHaveBeenCalledWith(
      expect.not.objectContaining({ audioData: expect.anything() }),
    );
  });

  it('tracks metrics through ReplyAutomation handleIncomingMessage', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const automation = new ReplyAutomation({
      config: makeConfig({ automation: { debounceMs: 0 } }),
      llmProvider: makeProvider('Metrics tracked'),
      logger: makeLogger(),
    });

    const result = await automation.handleIncomingMessage(makeMessage({ id: 'm1', sendMessage }));

    const snap = automation.getMetrics().snapshot();
    expect(snap.messagesReceived).toBe(1);
    expect(snap.messagesProcessed).toBe(1);
    expect(result).toMatchObject({ status: 'sent' });
  });

  it('tracks ignored messages in metrics', async () => {
    const automation = new ReplyAutomation({
      config: makeConfig({ automation: { debounceMs: 0 } }),
      llmProvider: makeProvider('ignored'),
      logger: makeLogger(),
    });

    await automation.handleIncomingMessage(makeMessage({ id: 'm2', fromMe: true }));

    const snap = automation.getMetrics().snapshot();
    expect(snap.messagesReceived).toBe(1);
    expect(snap.messagesIgnored).toBe(1);
  });

  it('allows different chats to run concurrently up to the global limit', async () => {
    let active = 0;
    let maxActive = 0;
    const provider: LlmProvider = {
      generateReply: vi.fn(async (input) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { text: input.incomingMessage, provider: 'test', model: input.model };
      }),
    };
    const automation = new ReplyAutomation({
      config: makeConfig({ automation: { debounceMs: 0 } }),
      llmProvider: provider,
      logger: makeLogger(),
      queue: new MessageQueue({ globalConcurrency: 2, perChatConcurrency: 1 }),
    });

    await Promise.all([
      automation.handleIncomingMessage(makeMessage({ id: '1', body: 'one', chatId: 'chat-a' })),
      automation.handleIncomingMessage(makeMessage({ id: '2', body: 'two', chatId: 'chat-b' })),
      automation.handleIncomingMessage(makeMessage({ id: '3', body: 'three', chatId: 'chat-c' })),
    ]);

    expect(maxActive).toBe(2);
  });

  it('limits concurrent processing to 1 by default when no custom queue', async () => {
    let active = 0;
    let maxActive = 0;
    const provider: LlmProvider = {
      generateReply: vi.fn(async (input) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { text: input.incomingMessage, provider: 'test', model: input.model };
      }),
    };
    const automation = new ReplyAutomation({
      config: makeConfig({ automation: { debounceMs: 0 } }),
      llmProvider: provider,
      logger: makeLogger(),
    });

    await Promise.all([
      automation.handleIncomingMessage(makeMessage({ id: '1', body: 'one', chatId: 'chat-a' })),
      automation.handleIncomingMessage(makeMessage({ id: '2', body: 'two', chatId: 'chat-b' })),
      automation.handleIncomingMessage(makeMessage({ id: '3', body: 'three', chatId: 'chat-c' })),
    ]);

    expect(maxActive).toBe(1);
  });

  it('ignores messages when active batch limit is reached', { timeout: 30_000 }, async () => {
    const automation = new ReplyAutomation({
      config: makeConfig({ automation: { debounceMs: 0 } }),
      llmProvider: makeProvider('ignored'),
      logger: makeLogger(),
    });

    const promises: Promise<AutomationResult>[] = [];
    for (let i = 0; i < 5_001; i++) {
      promises.push(
        automation.handleIncomingMessage(makeMessage({ id: `m${i}`, chatId: `chat-${i}` })),
      );
    }

    const results = await Promise.all(promises);

    const tooManyChats = results.filter(
      (r): r is Extract<AutomationResult, { status: 'ignored' }> => r.status === 'ignored',
    );
    expect(tooManyChats.length).toBe(1);
    expect(tooManyChats[0].reason).toBe('too_many_chats');

    await automation.stop();
  });

  it('flushes pending debounced messages when stopped before timer fires', async () => {
    vi.useFakeTimers();
    try {
      const sendMessage = vi.fn(async () => undefined);
      const automation = new ReplyAutomation({
        config: makeConfig({ automation: { debounceMs: 5000 } }),
        llmProvider: makeProvider('Flushed reply'),
        logger: makeLogger(),
      });

      const pending = automation.handleIncomingMessage(
        makeMessage({ id: 'pending-1', sendMessage }),
      );
      const stopPromise = automation.stop();

      await expect(pending).resolves.toEqual({ status: 'sent', reply: 'Flushed reply' });
      await stopPromise;
      expect(sendMessage).toHaveBeenCalledWith('Flushed reply');
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves pending debounced messages as shutting_down when timer fires after stopped', async () => {
    vi.useFakeTimers();
    try {
      const automation = new ReplyAutomation({
        config: makeConfig({ automation: { debounceMs: 5000 } }),
        llmProvider: makeProvider('Reply'),
        logger: makeLogger(),
      });

      const pending = automation.handleIncomingMessage(makeMessage({ id: 'pending-1' }));
      Object.assign(automation, { stopped: true });

      await vi.advanceTimersByTimeAsync(5000);

      await expect(pending).resolves.toEqual({ status: 'ignored', reason: 'shutting_down' });
    } finally {
      vi.useRealTimers();
    }
  });
});

function makeProvider(text: string): LlmProvider {
  return {
    generateReply: vi.fn(async (input) => ({
      text,
      provider: 'test',
      model: input.model,
    })),
  };
}

function makeMessage(overrides: Partial<RuntimeIncomingMessage> = {}): RuntimeIncomingMessage {
  return {
    id: 'message-1',
    chatId: 'chat-1',
    timestamp: Date.now() / 1000,
    body: 'Hello?',
    fetchContext: vi.fn(async () => [{ direction: 'contact' as const, body: 'Hello?' }]),
    sendMessage: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as never;
}
