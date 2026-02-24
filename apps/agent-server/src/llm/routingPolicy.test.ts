import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogger } from '../logging';
import { InMemoryLlmAuditSink } from './audit';
import { LlmProviderError, LlmRoutingExhaustedError } from './errors';
import { InMemoryKeyResolutionService } from './keyResolution';
import { LlmRouter } from './router';
import type {
  LlmErrorCode,
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmProvider,
  LlmProviderGenerateContext,
} from './types';

class FakeProvider implements LlmProvider {
  calls = 0;

  constructor(
    public readonly id: 'openai' | 'claude',
    public readonly model: string,
    private readonly behavior: (request: LlmGenerateRequest, context: LlmProviderGenerateContext) => Promise<LlmGenerateResponse>,
  ) {}

  generate(request: LlmGenerateRequest, context: LlmProviderGenerateContext): Promise<LlmGenerateResponse> {
    this.calls += 1;
    return this.behavior(request, context);
  }
}

function makeRouterWithPrimaryFailure(code: LlmErrorCode) {
  const audit = new InMemoryLlmAuditSink();
  const primary = new FakeProvider('openai', 'gpt-test', async () => {
    throw new LlmProviderError(`primary failed: ${code}`, {
      provider: 'openai',
      code,
      retryable: code === 'timeout' || code === 'rate_limit' || code === 'server_error',
      statusCode: code === 'server_error' ? 503 : code === 'rate_limit' ? 429 : undefined,
    });
  });
  const fallback = new FakeProvider('claude', 'claude-test', async () => ({
    provider: 'claude',
    model: 'claude-test',
    content: 'fallback-ok',
  }));

  const router = new LlmRouter({
    logger: createLogger({ test: 'llm-routing' }),
    auditSink: audit,
    keyResolution: new InMemoryKeyResolutionService([
      { provider: 'openai', scope: 'project', scopeId: 'proj-1', key: 'sk-openai-test' },
      { provider: 'claude', scope: 'project', scopeId: 'proj-1', key: 'sk-claude-test' },
    ]),
    providers: [primary, fallback],
  });

  return { router, primary, fallback, audit };
}

for (const code of ['timeout', 'rate_limit', 'server_error'] as const) {
  test(`fallback policy routes to secondary provider on ${code}`, async () => {
    const { router, primary, fallback, audit } = makeRouterWithPrimaryFailure(code);

    const result = await router.generate({
      requestId: `req-${code}`,
      request: { prompt: 'hello' },
      routing: {
        primary: 'openai',
        fallbackOrder: ['claude'],
        timeoutMs: 5000,
        keyScopes: ['project', 'org'],
      },
      keyContext: { projectId: 'proj-1', orgId: 'org-1' },
    });

    assert.equal(result.provider, 'claude');
    assert.equal(result.content, 'fallback-ok');
    assert.equal(primary.calls, 1);
    assert.equal(fallback.calls, 1);

    const fallbackEvent = audit.events.find((event) => event.event === 'llm.route.provider.fallback');
    assert.ok(fallbackEvent);
    assert.equal(fallbackEvent?.provider, 'openai');
    assert.equal(fallbackEvent?.metadata?.reason, code);

    const attemptEvent = audit.events.find(
      (event) => event.event === 'llm.route.provider.attempt' && event.provider === 'openai',
    );
    assert.ok(attemptEvent);
    assert.notEqual(attemptEvent?.metadata?.key, 'sk-openai-test');
  });
}

test('fallback policy does not fallback on auth_error', async () => {
  const audit = new InMemoryLlmAuditSink();
  const primary = new FakeProvider('openai', 'gpt-test', async () => {
    throw new LlmProviderError('unauthorized', {
      provider: 'openai',
      code: 'auth_error',
      retryable: false,
      statusCode: 401,
    });
  });
  const fallback = new FakeProvider('claude', 'claude-test', async () => ({
    provider: 'claude',
    model: 'claude-test',
    content: 'should-not-run',
  }));

  const router = new LlmRouter({
    logger: createLogger({ test: 'llm-routing-auth' }),
    auditSink: audit,
    keyResolution: new InMemoryKeyResolutionService([
      { provider: 'openai', scope: 'org', scopeId: 'org-1', key: 'openai-key' },
      { provider: 'claude', scope: 'org', scopeId: 'org-1', key: 'claude-key' },
    ]),
    providers: [primary, fallback],
  });

  await assert.rejects(
    () =>
      router.generate({
        requestId: 'req-auth',
        request: { prompt: 'hello' },
        routing: {
          primary: 'openai',
          fallbackOrder: ['claude'],
          keyScopes: ['org'],
        },
        keyContext: { orgId: 'org-1' },
      }),
    (error: unknown) => {
      assert.ok(error instanceof LlmRoutingExhaustedError);
      assert.equal(error.attempts.length, 1);
      assert.equal(error.attempts[0]?.provider, 'openai');
      assert.equal(error.attempts[0]?.code, 'auth_error');
      return true;
    },
  );

  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 0);
  assert.equal(audit.events.some((event) => event.event === 'llm.route.provider.fallback'), false);
});
