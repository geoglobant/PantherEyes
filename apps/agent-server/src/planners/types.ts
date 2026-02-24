import type { ChatRequest, IntentId, PlannerExecutionResult, ResolvedIntent, ToolTrace } from '../types';
import type { Logger } from '../logging';
import type { ToolExecutor } from '../tools/executor';

export interface PlannerContext {
  requestId: string;
  logger: Logger;
  tools: ToolExecutor;
}

export interface PlannerRunInput {
  request: ChatRequest;
  intent: ResolvedIntent;
}

export interface PlannerRunOutput {
  result: PlannerExecutionResult;
  traces: ToolTrace[];
}

export interface Planner {
  id: IntentId;
  deterministic: true;
  run(input: PlannerRunInput, context: PlannerContext): Promise<PlannerRunOutput>;
}
