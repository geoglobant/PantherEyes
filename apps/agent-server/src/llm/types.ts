import type { Logger } from '../logging';

export type LlmProviderId = 'openai' | 'claude';
export type LlmKeyScope = 'user' | 'project' | 'org';

export interface LlmGenerateRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
}

export interface LlmGenerateResponse {
  provider: LlmProviderId;
  model: string;
  content: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  raw?: unknown;
}

export type LlmErrorCode =
  | 'timeout'
  | 'rate_limit'
  | 'server_error'
  | 'network_error'
  | 'auth_error'
  | 'bad_request'
  | 'key_not_found'
  | 'provider_not_enabled'
  | 'provider_not_implemented'
  | 'unknown';

export interface ResolvedApiKey {
  provider: LlmProviderId;
  scope: LlmKeyScope;
  key: string;
  source: 'memory' | 'env' | 'secret_storage' | 'vault' | 'custom';
  keyId?: string;
}

export interface KeyResolutionRequest {
  provider: LlmProviderId;
  scopes: LlmKeyScope[];
  userId?: string;
  projectId?: string;
  orgId?: string;
}

export interface KeyResolutionService {
  resolveKey(request: KeyResolutionRequest): Promise<ResolvedApiKey | null>;
}

export interface LlmProviderGenerateContext {
  timeoutMs?: number;
  resolvedKey: ResolvedApiKey;
  logger: Logger;
  requestId?: string;
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly model: string;
  generate(request: LlmGenerateRequest, context: LlmProviderGenerateContext): Promise<LlmGenerateResponse>;
}

export interface LlmRoutingPolicy {
  primary: LlmProviderId;
  fallbackOrder: LlmProviderId[];
  timeoutMs?: number;
  keyScopes: LlmKeyScope[];
}

export interface LlmRouteRequest {
  request: LlmGenerateRequest;
  routing: LlmRoutingPolicy;
  requestId?: string;
  keyContext?: {
    userId?: string;
    projectId?: string;
    orgId?: string;
  };
}

export interface LlmAuditEvent {
  ts: string;
  event:
    | 'llm.route.start'
    | 'llm.route.provider.skipped'
    | 'llm.route.provider.attempt'
    | 'llm.route.provider.success'
    | 'llm.route.provider.failure'
    | 'llm.route.provider.fallback'
    | 'llm.route.exhausted';
  requestId?: string;
  provider?: LlmProviderId;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface LlmAuditSink {
  emit(event: LlmAuditEvent): void;
}
