import OpenAI from 'openai';

import { ProviderResponseError, ProviderTimeoutError } from '../runtime/errors';
import { type Logger } from '../runtime/logger';
import { buildReplyPrompt, cleanGeneratedReply } from './prompt';
import { type GenerateReplyInput, type GenerateReplyResult, type LlmProvider } from './provider';

type ChatCompletionResult = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type ChatCompletionClient = {
  chat: {
    completions: {
      create: (request: unknown) => Promise<ChatCompletionResult>;
    };
  };
};

export type OpenAiCompatibleProviderOptions = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  client?: ChatCompletionClient;
  logger?: Pick<Logger, 'debug' | 'warn' | 'error'>;
};

export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly client: ChatCompletionClient;
  private readonly provider: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly logger?: Pick<Logger, 'debug' | 'warn' | 'error'>;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.provider = options.provider;
    this.timeoutMs = options.timeoutMs;
    this.maxRetries = options.maxRetries;
    this.logger = options.logger;
    this.client =
      options.client ??
      (new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseUrl,
        timeout: options.timeoutMs,
        maxRetries: 0,
      }) as ChatCompletionClient);
  }

  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    const request = {
      model: input.model,
      temperature: 0.7,
      messages: buildReplyPrompt(input),
    };

    try {
      const completion = await retryTransient(
        () => withTimeout(this.client.chat.completions.create(request), this.timeoutMs),
        this.maxRetries,
        this.logger,
      );
      const rawText = completion.choices?.[0]?.message?.content ?? '';
      const text = cleanGeneratedReply(rawText);

      if (!text) {
        throw new ProviderResponseError('The LLM provider returned an empty reply.');
      }

      return {
        text,
        provider: this.provider,
        model: input.model,
      };
    } catch (error) {
      this.logger?.error({ error }, 'LLM reply generation failed');
      throw error;
    }
  }
}

async function retryTransient<T>(
  action: () => Promise<T>,
  maxRetries: number,
  logger?: Pick<Logger, 'warn'>,
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= maxRetries || !isTransientProviderError(error)) {
        throw error;
      }

      attempt += 1;
      logger?.warn({ attempt, error }, 'Retrying transient LLM provider failure');
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderTimeoutError(timeoutMs)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isTransientProviderError(error: unknown): boolean {
  if (error instanceof ProviderTimeoutError) {
    return true;
  }

  const name = getErrorString(error, 'name');
  if (name === 'APITimeoutError') {
    return true;
  }

  const status = getErrorNumber(error, 'status') ?? getErrorNumber(error, 'statusCode');
  if (status !== undefined) {
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  }

  const code = getErrorString(error, 'code');
  return Boolean(code && ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED'].includes(code));
}

function getErrorNumber(error: unknown, key: string): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}

function getErrorString(error: unknown, key: string): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}
