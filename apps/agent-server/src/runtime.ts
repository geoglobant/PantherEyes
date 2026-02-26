import { randomUUID } from 'node:crypto';
import { PantherEyesCliAdapter } from './adapters/cli';
import { createDefaultLlmRouter, NoopChatModelAdapter, RoutedChatModelAdapter, type ChatModelAdapter } from './adapters/llm';
import { WorkspacePolicyConfigAdapter } from './adapters/policyConfig';
import { PantherEyesSdkAdapter } from './adapters/sdk';
import { resolveIntent } from './intents/resolver';
import type { Logger } from './logging';
import { PlannerRegistry } from './planners/registry';
import { ToolExecutor } from './tools/executor';
import { ToolRegistry } from './tools/registry';
import type { ChatRequest, ChatResponse } from './types';

export class AgentRuntime {
  private readonly plannerRegistry: PlannerRegistry;
  private readonly toolExecutor: ToolExecutor;
  private readonly llmAdapter: ChatModelAdapter;

  constructor(private readonly logger: Logger) {
    const toolRegistry = new ToolRegistry();
    this.plannerRegistry = new PlannerRegistry();
    this.llmAdapter = createRuntimeLlmAdapter(logger);
    this.toolExecutor = new ToolExecutor(toolRegistry, logger, {
      sdk: new PantherEyesSdkAdapter(),
      cli: new PantherEyesCliAdapter(),
      llm: this.llmAdapter,
      policyConfig: new WorkspacePolicyConfigAdapter(),
    });
  }

  async handleChat(request: ChatRequest): Promise<ChatResponse> {
    const requestId = randomUUID();
    const reqLogger = this.logger.child({ requestId });

    reqLogger.info('agent.chat.start', {
      message: request.message,
      requestedIntent: request.intent,
      context: request.context,
    });

    const resolvedIntent = resolveIntent({
      message: request.message,
      requestedIntent: request.intent,
    });

    const planner = this.plannerRegistry.get(resolvedIntent.resolvedIntent);
    const plan = await planner.run(
      { request, intent: resolvedIntent },
      {
        requestId,
        logger: reqLogger,
        tools: this.toolExecutor,
        llm: this.llmAdapter,
      },
    );

    const response: ChatResponse = {
      requestId,
      intent: resolvedIntent,
      planner: plan.result,
      tools: plan.traces,
    };

    reqLogger.info('agent.chat.success', {
      resolvedIntent: resolvedIntent.resolvedIntent,
      changeCount: response.planner.changeSet.changes.length,
      toolCount: response.tools.length,
    });

    return response;
  }
}

function createRuntimeLlmAdapter(logger: Logger): ChatModelAdapter {
  if (process.env.PANTHEREYES_ENABLE_LLM_ROUTER !== '1') {
    return new NoopChatModelAdapter();
  }

  try {
    const router = createDefaultLlmRouter(logger.child({ component: 'llm.router' }));
    return new RoutedChatModelAdapter(router);
  } catch (error) {
    logger.warn('agent.runtime.llm.fallback_to_noop', { error });
    return new NoopChatModelAdapter();
  }
}
