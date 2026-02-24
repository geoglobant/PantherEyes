import { randomUUID } from 'node:crypto';
import { PantherEyesCliAdapter } from './adapters/cli';
import { NoopChatModelAdapter } from './adapters/llm';
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

  constructor(private readonly logger: Logger) {
    const toolRegistry = new ToolRegistry();
    this.plannerRegistry = new PlannerRegistry();
    this.toolExecutor = new ToolExecutor(toolRegistry, logger, {
      sdk: new PantherEyesSdkAdapter(),
      cli: new PantherEyesCliAdapter(),
      llm: new NoopChatModelAdapter(),
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
