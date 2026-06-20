import { describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { oggToMp3 } from '../../src/audio/convert';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

function createMockFfmpeg() {
  const dataHandlers: Array<(chunk: Buffer) => void> = [];
  const endHandlers: Array<() => void> = [];
  const errorHandlers: Array<(err: Error) => void> = [];
  const closeHandlers: Array<(code: number | null, signal: string | null) => void> = [];

  const stdout = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'data') {
        dataHandlers.push(handler as (chunk: Buffer) => void);
      }
      if (event === 'end') {
        endHandlers.push(handler as () => void);
      }
    }),
  };

  const stdin = { write: vi.fn(), end: vi.fn() };

  const proc = {
    stdout,
    stdin,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'error') {
        errorHandlers.push(handler as (err: Error) => void);
      }
      if (event === 'close') {
        closeHandlers.push(handler as (code: number | null, signal: string | null) => void);
      }
    }),
    kill: vi.fn(),
  } as unknown as ChildProcess;

  vi.mocked(spawn).mockReturnValue(proc);

  return {
    emitData(chunk: Buffer) {
      for (const h of dataHandlers) {
        h(chunk);
      }
    },
    emitEnd() {
      for (const h of endHandlers) {
        h();
      }
    },
    emitError(err: Error) {
      for (const h of errorHandlers) {
        h(err);
      }
    },
    emitClose(code: number | null, signal: string | null) {
      for (const h of closeHandlers) {
        h(code, signal);
      }
    },
    proc,
  };
}

describe('oggToMp3', () => {
  it('converts OGG base64 to MP3 base64 on success', async () => {
    const inputBase64 = Buffer.from('fake-ogg-data').toString('base64');
    const outputBuffer = Buffer.from('fake-mp3-data');
    const ff = createMockFfmpeg();

    const promise = oggToMp3(inputBase64);

    ff.emitData(outputBuffer);
    ff.emitEnd();
    ff.emitClose(0, null);

    const result = await promise;

    expect(result).toBe(outputBuffer.toString('base64'));
    expect(spawn).toHaveBeenCalledWith('ffmpeg', [
      '-i', 'pipe:0',
      '-f', 'mp3',
      '-acodec', 'libmp3lame',
      '-b:a', '16k',
      '-ac', '1',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'ignore'] });
  });

  it('rejects when ffmpeg exits with non-zero code', async () => {
    const ff = createMockFfmpeg();

    const promise = oggToMp3('aW5wdXQ=');

    ff.emitEnd();
    ff.emitClose(1, null);

    await expect(promise).rejects.toThrow('ffmpeg exited with code 1');
  });

  it('rejects when ffmpeg is killed by a signal', async () => {
    const ff = createMockFfmpeg();

    const promise = oggToMp3('aW5wdXQ=');

    ff.emitEnd();
    ff.emitClose(null, 'SIGKILL');

    await expect(promise).rejects.toThrow('ffmpeg was killed by signal SIGKILL');
  });

  it('rejects when ffmpeg fails to spawn', async () => {
    const ff = createMockFfmpeg();

    const promise = oggToMp3('aW5wdXQ=');

    ff.emitError(new Error('ENOENT'));

    await expect(promise).rejects.toThrow('ffmpeg spawn failed: ENOENT');
  });

  it('rejects partial output when ffmpeg exits with non-zero after stdout end', async () => {
    const outputBuffer = Buffer.from('partial-data');
    const ff = createMockFfmpeg();

    const promise = oggToMp3('aW5wdXQ=');

    ff.emitData(outputBuffer);
    ff.emitEnd();
    ff.emitClose(1, null);

    await expect(promise).rejects.toThrow('ffmpeg exited with code 1');
  });

  it('times out after FFMPEG_TIMEOUT_MS', async () => {
    vi.useFakeTimers();

    const ff = createMockFfmpeg();
    const promise = oggToMp3('aW5wdXQ=');

    vi.runAllTimers();

    await expect(promise).rejects.toThrow('ffmpeg timed out');
    expect(ff.proc.kill).toHaveBeenCalledWith('SIGTERM');

    vi.useRealTimers();
  });
});
