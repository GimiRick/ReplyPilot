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
      create: (
        request: unknown,
        options?: { signal?: AbortSignal },
      ) => Promise<ChatCompletionResult>;
    };
  };
};

export type OpenAiCompatibleProviderOptions = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  fallbackApiKeys?: string[];
  timeoutMs: number;
  maxRetries: number;
  client?: ChatCompletionClient;
  logger?: Pick<Logger, 'debug' | 'warn' | 'error'>;
};

export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly apiKeys: readonly string[];
  private readonly provider: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly logger?: Pick<Logger, 'debug' | 'warn' | 'error'>;
  private readonly injectedClient?: ChatCompletionClient;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.provider = options.provider;
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs;
    this.maxRetries = options.maxRetries;
    this.logger = options.logger;
    this.injectedClient = options.client;
    this.apiKeys = [options.apiKey, ...(options.fallbackApiKeys ?? [])];
  }

  private createClient(apiKey: string): ChatCompletionClient {
    if (this.injectedClient) {
      return this.injectedClient;
    }
    return new OpenAI({
      apiKey,
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      maxRetries: 0,
    }) as ChatCompletionClient;
  }

  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    const baseRequest = {
      model: input.model,
      temperature: 0.7,
      messages: buildReplyPrompt(input),
    };

    let lastError: unknown;

    for (let i = 0; i < this.apiKeys.length; i++) {
      const client = this.createClient(this.apiKeys[i]);

      try {
        const completion = await retryTransient(
          () => {
            const ctrl = new AbortController();
            return withTimeout(
              client.chat.completions.create(baseRequest, { signal: ctrl.signal }),
              this.timeoutMs,
              ctrl,
            );
          },
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
        lastError = error;

        if (i < this.apiKeys.length - 1) {
          this.logger?.warn(
            { keyIndex: i, totalKeys: this.apiKeys.length },
            'Key failed, trying next API key',
          );
          continue;
        }

        this.logger?.error({ error }, 'LLM reply generation failed');
        throw error;
      }
    }

    throw lastError;
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
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller?: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      reject(new ProviderTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  // Prevent unhandled rejections when timeout wins and `promise` rejects later.
  promise.catch(() => {});

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
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
    return status === 408 || status === 409 || status === 425 || status >= 500;
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
