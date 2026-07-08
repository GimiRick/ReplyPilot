import { afterEach, describe, expect, it, vi } from 'vitest';
import { transcribeCloud, transcribeLocal } from '../../src/audio/transcriber';
import { makeConfig } from '../fixtures/app-config';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('transcribeCloud', () => {
  it('sends audio to the correct URL and returns transcription text', async () => {
    const jsonResponse = { text: 'Hello world' };
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => jsonResponse,
    }));
    vi.stubGlobal('fetch', mockFetch);

    const config = makeConfig({
      voiceNote: {
        mode: 'whisper_cloud',
        whisperBaseUrl: 'https://api.openai.com/v1',
        whisperApiKey: 'sk-test',
        whisperModel: 'whisper-1',
      },
    });
    const result = await transcribeCloud('bXAzLWRhdGE=', config);

    expect(result).toBe('Hello world');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/transcriptions',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer sk-test' },
      }),
    );
  });

  it('falls back to llm baseUrl when whisperBaseUrl is not set', async () => {
    const jsonResponse = { text: 'transcribed' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => jsonResponse,
      })),
    );

    const config = makeConfig({
      llm: { baseUrl: 'https://custom-llm.example/v1' },
      voiceNote: { mode: 'whisper_cloud', whisperApiKey: 'sk-test' },
    });
    const result = await transcribeCloud('bXAzLWRhdGE=', config);

    expect(result).toBe('transcribed');
  });

  it('falls back to llm apiKey when whisperApiKey is not set', async () => {
    const jsonResponse = { text: 'transcribed' };
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => jsonResponse,
    }));
    vi.stubGlobal('fetch', mockFetch);

    const config = makeConfig({
      llm: { apiKey: 'sk-llm-key' },
      voiceNote: { mode: 'whisper_cloud' },
    });

    // delete so it must fall back
    delete config.voiceNote!.whisperApiKey;

    await transcribeCloud('bXAzLWRhdGE=', config);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-llm-key' },
      }),
    );
  });

  it('falls back to llm apiKey when whisperApiKey is blank', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'transcribed' }),
    }));
    vi.stubGlobal('fetch', mockFetch);

    const config = makeConfig({
      llm: { apiKey: 'sk-llm-key' },
      voiceNote: { mode: 'whisper_cloud', whisperApiKey: '   ' },
    });

    await transcribeCloud('bXAzLWRhdGE=', config);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-llm-key' },
      }),
    );
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })),
    );

    const config = makeConfig({
      voiceNote: { mode: 'whisper_cloud', whisperApiKey: 'sk-bad' },
    });

    await expect(transcribeCloud('bXAzLWRhdGE=', config)).rejects.toThrow(
      'Whisper cloud transcription failed: 401 Unauthorized',
    );
  });

  it('throws when response has no text field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({}),
      })),
    );

    const config = makeConfig({
      voiceNote: { mode: 'whisper_cloud', whisperApiKey: 'sk-test' },
    });

    await expect(transcribeCloud('bXAzLWRhdGE=', config)).rejects.toThrow(
      'Whisper cloud transcription returned an empty response',
    );
  });

  it('uses custom model when configured', async () => {
    const jsonResponse = { text: 'ok' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => jsonResponse,
      })),
    );

    const config = makeConfig({
      voiceNote: {
        mode: 'whisper_cloud',
        whisperApiKey: 'sk-test',
        whisperModel: 'gpt-4o-transcribe',
      },
    });

    const result = await transcribeCloud('bXAzLWRhdGE=', config);

    expect(result).toBe('ok');
  });

  it('rejects when fetch throws (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network failure');
      }),
    );

    const config = makeConfig({
      voiceNote: { mode: 'whisper_cloud', whisperApiKey: 'sk-test' },
    });

    await expect(transcribeCloud('bXAzLWRhdGE=', config)).rejects.toThrow('Network failure');
  });

  it('aborts on timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url, init) =>
          new Promise((_, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('AbortError')));
          }),
      ),
    );

    const config = makeConfig({
      voiceNote: { mode: 'whisper_cloud', whisperApiKey: 'sk-test' },
    });

    try {
      const promise = transcribeCloud('bXAzLWRhdGE=', config);
      vi.runAllTimers();

      await expect(promise).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('transcribeLocal', () => {
  it('sends audio to local whisper endpoint and returns transcription', async () => {
    const jsonResponse = { text: 'local transcription' };
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => jsonResponse,
    }));
    vi.stubGlobal('fetch', mockFetch);

    const config = makeConfig({
      voiceNote: {
        mode: 'whisper_local',
        localWhisperUrl: 'http://localhost:9000/inference',
      },
    });
    const result = await transcribeLocal('bXAzLWRhdGE=', config);

    expect(result).toBe('local transcription');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9000/inference',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falls back to default local URL when none is configured', async () => {
    const jsonResponse = { text: 'transcribed' };
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => jsonResponse,
    }));
    vi.stubGlobal('fetch', mockFetch);

    const config = makeConfig({
      voiceNote: { mode: 'whisper_local' },
    });
    const result = await transcribeLocal('bXAzLWRhdGE=', config);

    expect(result).toBe('transcribed');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/inference', expect.any(Object));
  });

  it('throws on non-ok response from local server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })),
    );

    const config = makeConfig({
      voiceNote: { mode: 'whisper_local' },
    });

    await expect(transcribeLocal('bXAzLWRhdGE=', config)).rejects.toThrow(
      'Whisper local transcription failed: 500 Internal Server Error',
    );
  });

  it('throws when local response has no text field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ error: 'no text' }),
      })),
    );

    const config = makeConfig({
      voiceNote: { mode: 'whisper_local' },
    });

    await expect(transcribeLocal('bXAzLWRhdGE=', config)).rejects.toThrow(
      'Whisper local transcription returned an empty response',
    );
  });

  it('does not send Authorization header for local requests', async () => {
    const fetchMock = vi.fn<
      (...args: unknown[]) => Promise<{ ok: boolean; json: () => Promise<{ text: string }> }>
    >(async () => ({
      ok: true,
      json: async () => ({ text: 'ok' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const config = makeConfig({
      voiceNote: { mode: 'whisper_local' },
    });

    await transcribeLocal('bXAzLWRhdGE=', config);

    const options = fetchMock.mock.calls[0]?.[1];
    expect(options).not.toHaveProperty('headers');
  });

  it('aborts on timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url, init) =>
          new Promise((_, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('AbortError')));
          }),
      ),
    );

    const config = makeConfig({
      voiceNote: { mode: 'whisper_local' },
    });

    try {
      const promise = transcribeLocal('bXAzLWRhdGE=', config);
      vi.runAllTimers();

      await expect(promise).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
