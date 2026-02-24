import { LlmProviderError, classifyHttpStatus } from '../errors';
import type { LlmGenerateRequest, LlmGenerateResponse, LlmProvider, LlmProviderGenerateContext, LlmProviderId } from '../types';

export interface HttpResponseLike {
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type HttpFetcher = (input: {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  timeoutMs?: number;
}) => Promise<HttpResponseLike>;

export interface ProviderBaseOptions {
  id: LlmProviderId;
  model: string;
  endpoint: string;
  fetcher?: HttpFetcher;
}

export abstract class BaseHttpLlmProvider implements LlmProvider {
  readonly id: LlmProviderId;
  readonly model: string;
  private readonly endpoint: string;
  private readonly fetcher?: HttpFetcher;

  protected constructor(options: ProviderBaseOptions) {
    this.id = options.id;
    this.model = options.model;
    this.endpoint = options.endpoint;
    this.fetcher = options.fetcher;
  }

  async generate(request: LlmGenerateRequest, context: LlmProviderGenerateContext): Promise<LlmGenerateResponse> {
    if (!context.resolvedKey.key) {
      throw new LlmProviderError('API key is missing for provider request.', {
        provider: this.id,
        code: 'key_not_found',
        retryable: false,
      });
    }

    if (!this.fetcher) {
      throw new LlmProviderError(
        `${this.id} provider stub is configured but no HTTP fetcher is attached yet.`,
        {
          provider: this.id,
          code: 'provider_not_implemented',
          retryable: false,
        },
      );
    }

    const payload = this.buildRequestBody(request);

    try {
      const response = await this.fetcher({
        url: this.endpoint,
        method: 'POST',
        headers: this.buildHeaders(context.resolvedKey.key),
        body: JSON.stringify(payload),
        timeoutMs: context.timeoutMs,
      });

      if (response.status < 200 || response.status >= 300) {
        const text = await response.text();
        throw classifyHttpStatus(this.id, response.status, `${this.id} request failed with HTTP ${response.status}: ${text}`);
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      if (error instanceof LlmProviderError) {
        throw error;
      }

      const err = error as Error;
      const isTimeout = /timeout|aborted|abort/i.test(err.message);
      throw new LlmProviderError(`${this.id} network request failed: ${err.message}`, {
        provider: this.id,
        code: isTimeout ? 'timeout' : 'network_error',
        retryable: true,
        cause: error,
      });
    }
  }

  protected abstract buildRequestBody(request: LlmGenerateRequest): unknown;
  protected abstract buildHeaders(apiKey: string): Record<string, string>;
  protected abstract parseResponse(raw: unknown): LlmGenerateResponse;
}
