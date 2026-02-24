import type {
  KeyResolutionRequest,
  KeyResolutionService,
  LlmKeyScope,
  LlmProviderId,
  ResolvedApiKey,
} from './types';

export interface ScopedKeyRecord {
  provider: LlmProviderId;
  scope: LlmKeyScope;
  scopeId?: string;
  key: string;
  keyId?: string;
  source?: ResolvedApiKey['source'];
}

function requestScopeId(request: KeyResolutionRequest, scope: LlmKeyScope): string | undefined {
  if (scope === 'user') {
    return request.userId;
  }
  if (scope === 'project') {
    return request.projectId;
  }
  return request.orgId;
}

export class CompositeKeyResolutionService implements KeyResolutionService {
  constructor(private readonly delegates: KeyResolutionService[]) {}

  async resolveKey(request: KeyResolutionRequest): Promise<ResolvedApiKey | null> {
    for (const delegate of this.delegates) {
      const resolved = await delegate.resolveKey(request);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
}

export class InMemoryKeyResolutionService implements KeyResolutionService {
  constructor(private readonly records: ScopedKeyRecord[]) {}

  async resolveKey(request: KeyResolutionRequest): Promise<ResolvedApiKey | null> {
    for (const scope of request.scopes) {
      const scopeId = requestScopeId(request, scope);
      const record = this.records.find(
        (candidate) =>
          candidate.provider === request.provider &&
          candidate.scope === scope &&
          (candidate.scopeId ?? undefined) === (scopeId ?? undefined),
      );

      if (record) {
        return {
          provider: record.provider,
          scope: record.scope,
          key: record.key,
          keyId: record.keyId,
          source: record.source ?? 'memory',
        };
      }
    }

    return null;
  }
}

export class EnvironmentKeyResolutionService implements KeyResolutionService {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async resolveKey(request: KeyResolutionRequest): Promise<ResolvedApiKey | null> {
    const envKey = request.provider === 'openai' ? 'PANTHEREYES_OPENAI_API_KEY' : 'PANTHEREYES_ANTHROPIC_API_KEY';
    const key = this.env[envKey];
    if (!key) {
      return null;
    }

    for (const scope of request.scopes) {
      return {
        provider: request.provider,
        scope,
        key,
        source: 'env',
        keyId: `${envKey.toLowerCase()}:present`,
      };
    }

    return null;
  }
}

export interface ExternalScopedKeyStore {
  getKey(input: { provider: LlmProviderId; scope: LlmKeyScope; scopeId?: string }): Promise<string | undefined>;
}

export class SecretStorageCompatibleKeyResolutionService implements KeyResolutionService {
  constructor(private readonly store: ExternalScopedKeyStore) {}

  async resolveKey(request: KeyResolutionRequest): Promise<ResolvedApiKey | null> {
    for (const scope of request.scopes) {
      const scopeId = requestScopeId(request, scope);
      const key = await this.store.getKey({ provider: request.provider, scope, scopeId });
      if (!key) {
        continue;
      }

      return {
        provider: request.provider,
        scope,
        key,
        source: 'secret_storage',
        keyId: `${request.provider}:${scope}:${scopeId ?? 'default'}`,
      };
    }

    return null;
  }
}
