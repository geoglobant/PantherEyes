import type { Logger } from '../logging';
import {
  ClaudeLlmProvider,
  CompositeKeyResolutionService,
  EnvironmentKeyResolutionService,
  InMemoryKeyResolutionService,
  LlmRouter,
  OpenAiLlmProvider,
  type KeyResolutionService,
  type LlmProviderId,
} from '../llm';

export interface ChatModelAdapter {
  provider: 'openai' | 'claude' | 'none' | 'router';
  generate(prompt: string): Promise<string>;
}

export class NoopChatModelAdapter implements ChatModelAdapter {
  provider: 'none' = 'none';

  async generate(_prompt: string): Promise<string> {
    throw new Error('No LLM adapter configured. Deterministic planners are active.');
  }
}

export class RoutedChatModelAdapter implements ChatModelAdapter {
  provider: 'router' = 'router';

  constructor(private readonly router: LlmRouter, private readonly defaults?: { primary?: LlmProviderId; fallback?: LlmProviderId[] }) {}

  async generate(prompt: string): Promise<string> {
    const result = await this.router.generate({
      request: { prompt, temperature: 0 },
      routing: {
        primary: this.defaults?.primary ?? 'openai',
        fallbackOrder: this.defaults?.fallback ?? ['claude'],
        timeoutMs: 10_000,
        keyScopes: ['user', 'project', 'org'],
      },
    });

    return result.content;
  }
}

export function createDefaultLlmRouter(logger: Logger, keyResolution?: KeyResolutionService): LlmRouter {
  const resolver =
    keyResolution ??
    new CompositeKeyResolutionService([
      new InMemoryKeyResolutionService([]),
      new EnvironmentKeyResolutionService(),
    ]);

  return new LlmRouter({
    logger,
    keyResolution: resolver,
    providers: [new OpenAiLlmProvider(), new ClaudeLlmProvider()],
  });
}
