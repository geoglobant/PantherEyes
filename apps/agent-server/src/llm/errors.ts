import type { LlmErrorCode, LlmProviderId } from './types';

export class LlmProviderError extends Error {
  constructor(
    message: string,
    public readonly options: {
      code: LlmErrorCode;
      provider: LlmProviderId;
      statusCode?: number;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'LlmProviderError';
    this.cause = options.cause;
  }

  declare cause: unknown;

  get code(): LlmErrorCode {
    return this.options.code;
  }

  get provider(): LlmProviderId {
    return this.options.provider;
  }

  get retryable(): boolean {
    if (typeof this.options.retryable === 'boolean') {
      return this.options.retryable;
    }
    return ['timeout', 'rate_limit', 'server_error', 'network_error'].includes(this.options.code);
  }
}

export class LlmRoutingExhaustedError extends Error {
  constructor(
    message: string,
    public readonly attempts: Array<{
      provider: LlmProviderId;
      code: LlmErrorCode;
      message: string;
      statusCode?: number;
    }>,
  ) {
    super(message);
    this.name = 'LlmRoutingExhaustedError';
  }
}

export function classifyHttpStatus(provider: LlmProviderId, statusCode: number, message: string): LlmProviderError {
  if (statusCode === 401 || statusCode === 403) {
    return new LlmProviderError(message, { provider, code: 'auth_error', statusCode, retryable: false });
  }
  if (statusCode === 408) {
    return new LlmProviderError(message, { provider, code: 'timeout', statusCode, retryable: true });
  }
  if (statusCode === 429) {
    return new LlmProviderError(message, { provider, code: 'rate_limit', statusCode, retryable: true });
  }
  if (statusCode >= 500) {
    return new LlmProviderError(message, { provider, code: 'server_error', statusCode, retryable: true });
  }
  if (statusCode >= 400) {
    return new LlmProviderError(message, { provider, code: 'bad_request', statusCode, retryable: false });
  }
  return new LlmProviderError(message, { provider, code: 'unknown', statusCode });
}
