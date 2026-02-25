import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpLogger } from './logger';
import { PantherEyesMcpToolHost } from './toolHost';

test('mcp tool host lists PantherEyes tools', () => {
  const host = new PantherEyesMcpToolHost(createMcpLogger({ test: 'tool-list' }));
  const tools = host.listTools();

  assert.equal(tools.length, 10);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      'panthereyes.validate_security_config',
      'panthereyes.preview_effective_policy',
      'panthereyes.list_effective_directives',
      'panthereyes.compare_policy_envs',
      'panthereyes.compare_policy_envs_report',
      'panthereyes.scan',
      'panthereyes.generate_policy_tests',
      'panthereyes.explain_finding',
      'panthereyes.suggest_remediation',
      'panthereyes.create_policy_exception',
    ],
  );
});

test('mcp tool host rejects unknown tools', async () => {
  const host = new PantherEyesMcpToolHost(createMcpLogger({ test: 'tool-call' }));

  await assert.rejects(
    () =>
      host.callTool({
        name: 'panthereyes.unknown_tool',
        arguments: {},
      }),
    /Unknown MCP tool/,
  );
});

test('mcp compare_policy_envs returns structured diff', async () => {
  const host = new PantherEyesMcpToolHost(createMcpLogger({ test: 'compare-policy-envs' }));

  const result = await host.callTool({
    name: 'panthereyes.compare_policy_envs',
    arguments: {
      rootDir: 'samples/ios-panthereyes-demo',
      target: 'mobile',
      baseEnv: 'dev',
      compareEnv: 'prod',
    },
  });

  assert.equal(Array.isArray(result.content), true);
  assert.equal(typeof result.structuredContent, 'object');
  const structured = result.structuredContent as {
    summary: { changesDetected: boolean; directiveDiffCount: number };
    environments: { base: string; compare: string };
  };
  assert.equal(structured.environments.base, 'dev');
  assert.equal(structured.environments.compare, 'prod');
  assert.equal(structured.summary.changesDetected, true);
  assert.equal(structured.summary.directiveDiffCount >= 0, true);
});

test('mcp scan returns structured JSON output', async () => {
  const host = new PantherEyesMcpToolHost(createMcpLogger({ test: 'scan' }));

  const result = await host.callTool({
    name: 'panthereyes.scan',
    arguments: {
      rootDir: 'samples/ios-panthereyes-demo',
      target: 'mobile',
      phase: 'static',
    },
  });

  assert.equal(Array.isArray(result.content), true);
  assert.equal(typeof result.structuredContent, 'object');
  const structured = result.structuredContent as {
    summary?: { status?: string };
    phase?: string;
  };
  assert.equal(structured.phase, 'static');
  assert.equal(typeof structured.summary?.status, 'string');
});

test('mcp explain_finding resolves demo alias', async () => {
  const host = new PantherEyesMcpToolHost(createMcpLogger({ test: 'explain-finding' }));
  const result = await host.callTool({
    name: 'panthereyes.explain_finding',
    arguments: {
      findingId: 'IOS-ATS-001',
    },
  });

  const structured = result.structuredContent as {
    known: boolean;
    findingId: string;
  };
  assert.equal(structured.known, true);
  assert.equal(structured.findingId, 'mobile.ios.ats.arbitrary-loads-enabled');
});

test('mcp suggest_remediation returns deterministic guidance for alias', async () => {
  const host = new PantherEyesMcpToolHost(createMcpLogger({ test: 'suggest-remediation' }));
  const result = await host.callTool({
    name: 'panthereyes.suggest_remediation',
    arguments: {
      findingId: 'AND-NET-001',
      keepDevWarn: true,
      prodBlock: true,
    },
  });

  const structured = result.structuredContent as {
    known: boolean;
    findingId: string;
    policyGuidance: string[];
  };
  assert.equal(structured.known, true);
  assert.equal(structured.findingId, 'mobile.android.cleartext-traffic-enabled');
  assert.equal(structured.policyGuidance.length >= 2, true);
});

test('mcp create_policy_exception returns planner ChangeSet', async () => {
  const host = new PantherEyesMcpToolHost(createMcpLogger({ test: 'create-policy-exception' }));
  const result = await host.callTool({
    name: 'panthereyes.create_policy_exception',
    arguments: {
      rootDir: 'samples/ios-panthereyes-demo',
      env: 'dev',
      target: 'mobile',
      findingId: 'IOS-ATS-001',
      owner: 'security-team',
    },
  });

  const structured = result.structuredContent as {
    planner: { plannerId: string; changeSet: { dryRun: true; changes: Array<{ path: string }> } };
  };
  assert.equal(structured.planner.plannerId, 'create_policy_exception');
  assert.equal(structured.planner.changeSet.dryRun, true);
  assert.equal(structured.planner.changeSet.changes[0]?.path, '.panthereyes/exceptions.yaml');
});

test('mcp compare_policy_envs_report returns markdown + json report', async () => {
  const host = new PantherEyesMcpToolHost(createMcpLogger({ test: 'compare-policy-envs-report' }));
  const result = await host.callTool({
    name: 'panthereyes.compare_policy_envs_report',
    arguments: {
      rootDir: 'samples/ios-panthereyes-demo',
      target: 'mobile',
      baseEnv: 'dev',
      compareEnv: 'prod',
      format: 'both',
    },
  });

  assert.equal(result.content.some((item) => item.type === 'text'), true);
  assert.equal(result.content.some((item) => item.type === 'json'), true);
  const structured = result.structuredContent as {
    reportType: string;
    summary: { headline: string };
    markdown: string;
    gate: { shouldReview: boolean };
  };
  assert.equal(structured.reportType, 'panthereyes.policy_env_comparison');
  assert.match(structured.summary.headline, /Policy diff|No effective policy diff/);
  assert.match(structured.markdown, /PantherEyes Policy Comparison Report/);
  assert.equal(typeof structured.gate.shouldReview, 'boolean');
});
