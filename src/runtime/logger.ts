import pino, { type DestinationStream } from 'pino';

import { type LogLevel } from '../config/schema';

export type Logger = pino.Logger;

export function createLogger(level: LogLevel = 'info', destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      redact: {
        paths: [
          'llm.apiKey',
          '*.apiKey',
          'apiKey',
          'voiceNote.whisperApiKey',
          '*.whisperApiKey',
          'whisperApiKey',
        ],
        censor: '[redacted]',
      },
    },
    destination,
  );
}
