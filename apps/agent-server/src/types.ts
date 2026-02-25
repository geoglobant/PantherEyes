export type IntentId =
  | 'generate_policy_tests'
  | 'compare_policy_envs'
  | 'explain_finding'
  | 'suggest_remediation';

export type AgentTarget = 'web' | 'mobile';

export interface AgentContextInput {
  env?: string;
  target?: AgentTarget;
  rootDir?: string;
}

export interface ChatRequest {
  message: string;
  intent?: string;
  context?: AgentContextInput;
}

export interface Change {
  kind: 'create' | 'update';
  path: string;
  language?: string;
  reason: string;
  content: string;
}

export interface ChangeSet {
  dryRun: true;
  summary: string;
  changes: Change[];
}

export type ToolName =
  | 'validate_security_config'
  | 'preview_effective_policy'
  | 'list_effective_directives'
  | 'generate_policy_tests';

export interface ResolvedIntent {
  requestedIntent?: string;
  resolvedIntent: IntentId;
  confidence: number;
  strategy: 'explicit' | 'heuristic';
  reason: string;
}

export interface ToolTrace {
  id: string;
  tool: ToolName;
  status: 'success' | 'error';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  input: unknown;
  output?: unknown;
  error?: {
    message: string;
    code?: string;
  };
}

export interface PlannerExecutionResult {
  plannerId: IntentId;
  deterministic: true;
  summary: string;
  changeSet: ChangeSet;
  toolOutputs: Record<string, unknown>;
  context: {
    env: string;
    target: AgentTarget;
    rootDir: string;
  };
}

export interface ChatResponse {
  requestId: string;
  intent: ResolvedIntent;
  planner: PlannerExecutionResult;
  tools: ToolTrace[];
}
