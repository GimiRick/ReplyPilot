import { type AppConfig } from '../config/schema';

const TRANSCRIBE_TIMEOUT_MS = 120_000;

export async function transcribeCloud(mp3Base64: string, config: AppConfig): Promise<string> {
  const baseUrl = config.voiceNote?.whisperBaseUrl?.trim() || config.llm.baseUrl;
  const apiKey = config.voiceNote?.whisperApiKey?.trim() || config.llm.apiKey;
  const model = config.voiceNote?.whisperModel?.trim() || 'whisper-1';

  const url = `${baseUrl.replace(/\/+$/, '')}/audio/transcriptions`;
  const mp3Buffer = Buffer.from(mp3Base64, 'base64');

  const form = new FormData();
  form.append('file', new Blob([mp3Buffer], { type: 'audio/mpeg' }), 'voice.mp3');
  form.append('model', model);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Whisper cloud transcription failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { text?: string };
    if (typeof data.text !== 'string') {
      throw new Error('Whisper cloud transcription returned an empty response');
    }
    return data.text;
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeLocal(mp3Base64: string, config: AppConfig): Promise<string> {
  const url = config.voiceNote?.localWhisperUrl ?? 'http://localhost:8080/inference';
  const mp3Buffer = Buffer.from(mp3Base64, 'base64');

  const form = new FormData();
  form.append('file', new Blob([mp3Buffer], { type: 'audio/mpeg' }), 'voice.mp3');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Whisper local transcription failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { text?: string };
    if (typeof data.text !== 'string') {
      throw new Error('Whisper local transcription returned an empty response');
    }
    return data.text;
  } finally {
    clearTimeout(timer);
  }
}
