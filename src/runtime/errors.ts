export class ReplyPilotError extends Error {
  readonly code: string;

  constructor(message: string, code = 'REPLYPILOT_ERROR', cause?: unknown) {
    super(message, { cause });
    this.name = new.target.name;
    this.code = code;
  }
}

export class MissingConfigError extends ReplyPilotError {
  constructor() {
    super('ReplyPilot has not been configured yet.', 'MISSING_CONFIG');
  }
}

export class ConfigValidationError extends ReplyPilotError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONFIG_VALIDATION_ERROR', cause);
  }
}

export class ProviderResponseError extends ReplyPilotError {
  constructor(message: string, cause?: unknown) {
    super(message, 'PROVIDER_RESPONSE_ERROR', cause);
  }
}

export class ProviderTimeoutError extends ReplyPilotError {
  constructor(timeoutMs: number) {
    super(`The LLM provider did not respond within ${timeoutMs}ms.`, 'PROVIDER_TIMEOUT');
  }
}

export class DuplicateConfigError extends ReplyPilotError {
  constructor(name: string) {
    super(`A configuration named "${name}" already exists.`, 'DUPLICATE_CONFIG');
  }
}

export class ConfigNotFoundError extends ReplyPilotError {
  constructor(name: string) {
    super(`Configuration "${name}" not found.`, 'CONFIG_NOT_FOUND');
  }
}
