import { BaseHttpLlmProvider, type HttpFetcher } from './base';
import type { LlmGenerateRequest, LlmGenerateResponse } from '../types';

export interface OpenAiProviderOptions {
  model?: string;
  endpoint?: string;
  fetcher?: HttpFetcher;
}

export class OpenAiLlmProvider extends BaseHttpLlmProvider {
  constructor(options: OpenAiProviderOptions = {}) {
    super({
      id: 'openai',
      model: options.model ?? 'gpt-4.1-mini',
      endpoint: options.endpoint ?? 'https://api.openai.com/v1/responses',
      fetcher: options.fetcher,
    });
  }

  protected buildRequestBody(request: LlmGenerateRequest): unknown {
    const input = request.systemPrompt
      ? [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.prompt },
        ]
      : request.prompt;

    return {
      model: this.model,
      input,
      temperature: request.temperature,
      max_output_tokens: request.maxOutputTokens,
      metadata: request.metadata,
    };
  }

  protected buildHeaders(apiKey: string): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    };
  }

  protected parseResponse(raw: unknown): LlmGenerateResponse {
    const payload = raw as { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    return {
      provider: 'openai',
      model: this.model,
      content: payload.output_text ?? '',
      usage: {
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
      },
      raw,
    };
  }
}
