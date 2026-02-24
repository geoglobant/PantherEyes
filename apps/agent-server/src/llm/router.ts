import type { Logger } from '../logging';
import { LoggerLlmAuditSink } from './audit';
import { LlmProviderError, LlmRoutingExhaustedError } from './errors';
import type {
  KeyResolutionService,
  LlmAuditSink,
  LlmGenerateResponse,
  LlmProvider,
  LlmProviderId,
  LlmRouteRequest,
} from './types';

export interface LlmRouterOptions {
  providers: LlmProvider[];
  keyResolution: KeyResolutionService;
  logger: Logger;
  auditSink?: LlmAuditSink;
}

function nowIso(): string {
  return new Date().toISOString();
}

function shouldFallback(error: LlmProviderError): boolean {
  return error.retryable;
}

export class LlmRouter {
  private readonly providerMap = new Map<LlmProviderId, LlmProvider>();
  private readonly auditSink: LlmAuditSink;

  constructor(private readonly options: LlmRouterOptions) {
    for (const provider of options.providers) {
      this.providerMap.set(provider.id, provider);
    }
    this.auditSink = options.auditSink ?? new LoggerLlmAuditSink(options.logger.child({ subsystem: 'llm' }));
  }

  async generate(routeRequest: LlmRouteRequest): Promise<LlmGenerateResponse> {
    const order = [routeRequest.routing.primary, ...routeRequest.routing.fallbackOrder.filter((id) => id !== routeRequest.routing.primary)];
    const attempts: LlmRoutingExhaustedError['attempts'] = [];

    this.auditSink.emit({
      ts: nowIso(),
      event: 'llm.route.start',
      requestId: routeRequest.requestId,
      metadata: {
        order,
        keyScopes: routeRequest.routing.keyScopes,
      },
    });

    for (let index = 0; index < order.length; index += 1) {
      const providerId = order[index];
      const provider = this.providerMap.get(providerId);
      if (!provider) {
        this.auditSink.emit({
          ts: nowIso(),
          event: 'llm.route.provider.skipped',
          requestId: routeRequest.requestId,
          provider: providerId,
          metadata: { reason: 'provider_not_enabled' },
        });
        attempts.push({ provider: providerId, code: 'provider_not_enabled', message: 'Provider not configured' });
        continue;
      }

      const resolvedKey = await this.options.keyResolution.resolveKey({
        provider: providerId,
        scopes: routeRequest.routing.keyScopes,
        userId: routeRequest.keyContext?.userId,
        projectId: routeRequest.keyContext?.projectId,
        orgId: routeRequest.keyContext?.orgId,
      });

      if (!resolvedKey) {
        this.auditSink.emit({
          ts: nowIso(),
          event: 'llm.route.provider.skipped',
          requestId: routeRequest.requestId,
          provider: providerId,
          metadata: { reason: 'key_not_found' },
        });
        attempts.push({ provider: providerId, code: 'key_not_found', message: 'No key resolved for provider' });
        continue;
      }

      this.auditSink.emit({
        ts: nowIso(),
        event: 'llm.route.provider.attempt',
        requestId: routeRequest.requestId,
        provider: providerId,
        model: provider.model,
        metadata: {
          scope: resolvedKey.scope,
          source: resolvedKey.source,
          keyId: resolvedKey.keyId,
          attemptIndex: index,
        },
      });

      try {
        const response = await provider.generate(routeRequest.request, {
          resolvedKey,
          timeoutMs: routeRequest.routing.timeoutMs,
          logger: this.options.logger.child({ requestId: routeRequest.requestId, provider: providerId }),
          requestId: routeRequest.requestId,
        });

        this.auditSink.emit({
          ts: nowIso(),
          event: 'llm.route.provider.success',
          requestId: routeRequest.requestId,
          provider: providerId,
          model: provider.model,
          metadata: {
            scope: resolvedKey.scope,
            source: resolvedKey.source,
          },
        });

        return response;
      } catch (error) {
        const providerError =
          error instanceof LlmProviderError
            ? error
            : new LlmProviderError((error as Error).message, {
                provider: providerId,
                code: 'unknown',
                retryable: false,
                cause: error,
              });

        attempts.push({
          provider: providerId,
          code: providerError.code,
          message: providerError.message,
          statusCode: providerError.options.statusCode,
        });

        this.auditSink.emit({
          ts: nowIso(),
          event: 'llm.route.provider.failure',
          requestId: routeRequest.requestId,
          provider: providerId,
          model: provider.model,
          metadata: {
            code: providerError.code,
            retryable: providerError.retryable,
            statusCode: providerError.options.statusCode,
          },
        });

        const hasFallback = index < order.length - 1;
        if (hasFallback && shouldFallback(providerError)) {
          this.auditSink.emit({
            ts: nowIso(),
            event: 'llm.route.provider.fallback',
            requestId: routeRequest.requestId,
            provider: providerId,
            model: provider.model,
            metadata: {
              reason: providerError.code,
              nextProvider: order[index + 1],
            },
          });
          continue;
        }

        throw new LlmRoutingExhaustedError('No LLM provider could fulfill the request.', attempts);
      }
    }

    this.auditSink.emit({
      ts: nowIso(),
      event: 'llm.route.exhausted',
      requestId: routeRequest.requestId,
      metadata: { attempts },
    });

    throw new LlmRoutingExhaustedError('No LLM provider could fulfill the request.', attempts);
  }
}
