export type PantherEyesTarget = 'web' | 'mobile';

export interface PantherEyesChatRequest {
  message: string;
  intent?: string;
  context?: {
    env?: string;
    target?: PantherEyesTarget;
    rootDir?: string;
  };
}

export interface PantherEyesChange {
  kind: 'create' | 'update';
  path: string;
  language?: string;
  reason: string;
  content: string;
}

export interface PantherEyesChangeSet {
  dryRun: boolean;
  summary: string;
  changes: PantherEyesChange[];
}

export interface PantherEyesChatResponse {
  requestId: string;
  intent: {
    requestedIntent?: string;
    resolvedIntent: string;
    confidence: number;
    strategy: 'explicit' | 'heuristic';
    reason: string;
  };
  planner: {
    plannerId: string;
    deterministic: true;
    summary: string;
    changeSet: PantherEyesChangeSet;
    toolOutputs?: Record<string, unknown>;
    context?: {
      env: string;
      target: PantherEyesTarget;
      rootDir: string;
    };
  };
  tools: Array<{
    tool: string;
    status: 'success' | 'error';
    durationMs: number;
    input?: unknown;
    output?: unknown;
    error?: { message: string; code?: string };
  }>;
}

export interface PantherEyesToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface PantherEyesToolCallResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'json'; json: unknown }
  >;
  structuredContent?: unknown;
  isError?: boolean;
}
