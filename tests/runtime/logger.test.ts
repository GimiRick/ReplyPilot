import { describe, expect, it } from 'vitest';

import { createLogger } from '../../src/runtime/logger';

describe('logger', () => {
  it('creates a pino logger with the requested level', () => {
    const logger = createLogger('debug');

    expect(logger.level).toBe('debug');
  });
});
