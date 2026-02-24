import { BaseHttpLlmProvider, type HttpFetcher } from './base';
import type { LlmGenerateRequest, LlmGenerateResponse } from '../types';

export interface ClaudeProviderOptions {
  model?: string;
  endpoint?: string;
  fetcher?: HttpFetcher;
  anthropicVersion?: string;
}

export class ClaudeLlmProvider extends BaseHttpLlmProvider {
  private readonly anthropicVersion: string;

  constructor(options: ClaudeProviderOptions = {}) {
    super({
      id: 'claude',
      model: options.model ?? 'claude-3-5-sonnet-latest',
      endpoint: options.endpoint ?? 'https://api.anthropic.com/v1/messages',
      fetcher: options.fetcher,
    });
    this.anthropicVersion = options.anthropicVersion ?? '2023-06-01';
  }

  protected buildRequestBody(request: LlmGenerateRequest): unknown {
    return {
      model: this.model,
      max_tokens: request.maxOutputTokens ?? 1024,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.prompt }],
      metadata: request.metadata,
    };
  }

  protected buildHeaders(apiKey: string): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': this.anthropicVersion,
    };
  }

  protected parseResponse(raw: unknown): LlmGenerateResponse {
    const payload = raw as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (payload.content ?? [])
      .filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n');

    return {
      provider: 'claude',
      model: this.model,
      content: text,
      usage: {
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
      },
      raw,
    };
  }
}
