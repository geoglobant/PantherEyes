import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpLogger } from './logger';
import { PantherEyesMcpToolHost } from './toolHost';

test('mcp tool host lists PantherEyes tools', () => {
  const host = new PantherEyesMcpToolHost(createMcpLogger({ test: 'tool-list' }));
  const tools = host.listTools();

  assert.equal(tools.length, 6);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      'panthereyes.validate_security_config',
      'panthereyes.preview_effective_policy',
      'panthereyes.list_effective_directives',
      'panthereyes.compare_policy_envs',
      'panthereyes.scan',
      'panthereyes.generate_policy_tests',
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
