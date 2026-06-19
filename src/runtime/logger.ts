import pino from 'pino';

import { type LogLevel } from '../config/schema';

export type Logger = pino.Logger;

export function createLogger(level: LogLevel = 'info'): Logger {
  return pino({
    level,
    redact: {
      paths: ['llm.apiKey', '*.apiKey', 'apiKey'],
      censor: '[redacted]',
    },
  });
}
