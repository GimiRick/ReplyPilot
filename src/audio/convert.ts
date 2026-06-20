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

    const timer = setTimeout(() => {
      ffmpeg.kill('SIGTERM');
      reject(new Error('ffmpeg timed out'));
    }, FFMPEG_TIMEOUT_MS);

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    ffmpeg.stdout.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });

    ffmpeg.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });

    ffmpeg.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === null) {
        reject(new Error(`ffmpeg was killed by signal ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.stdin.write(oggBuffer);
    ffmpeg.stdin.end();
  });

  return mp3Buffer.toString('base64');
}
