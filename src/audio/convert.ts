import { spawn } from 'node:child_process';

const FFMPEG_TIMEOUT_MS = 120_000;

export async function oggToMp3(oggBase64: string): Promise<string> {
  const oggBuffer = Buffer.from(oggBase64, 'base64');

  const mp3Buffer = await new Promise<Buffer>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-f', 'mp3',
      '-acodec', 'libmp3lame',
      '-b:a', '16k',
      '-ac', '1',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'ignore'] });

    const chunks: Buffer[] = [];
    let settled = false;

    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        fn();
      }
    };

    const timer = setTimeout(() => {
      ffmpeg.kill('SIGTERM');
      settle(() => reject(new Error('ffmpeg timed out')));
      setTimeout(() => {
        ffmpeg.kill('SIGKILL');
      }, 5000);
    }, FFMPEG_TIMEOUT_MS);

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    ffmpeg.stdout.on('end', () => {
      // stdout closed — wait for exit event to settle
    });

    ffmpeg.on('error', (err) => {
      settle(() => reject(new Error(`ffmpeg spawn failed: ${err.message}`)));
    });

    ffmpeg.on('close', (code, signal) => {
      settle(() => {
        if (code === null) {
          reject(new Error(`ffmpeg was killed by signal ${signal}`));
        } else if (code !== 0) {
          reject(new Error(`ffmpeg exited with code ${code}`));
        } else {
          resolve(Buffer.concat(chunks));
        }
      });
    });

    ffmpeg.stdin.write(oggBuffer);
    ffmpeg.stdin.end();
  });

  return mp3Buffer.toString('base64');
}
