import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLogger } from '../logging';
import { AgentRuntime } from '../runtime';

function writeFixtureConfig(rootDir: string): void {
  const configDir = path.join(rootDir, '.panthereyes');
  mkdirSync(configDir, { recursive: true });

  writeFileSync(
    path.join(configDir, 'policy.yaml'),
    `version: 1
defaults:
  mode: warn
  failOnSeverity: high
  directives:
    minScore: 80
envs:
  dev:
    mode: audit
    directives:
      minScore: 60
  prod:
    mode: enforce
    failOnSeverity: medium
    directives:
      minScore: 95
`,
  );

  writeFileSync(
    path.join(configDir, 'rules.yaml'),
    `version: 1
rules:
  - ruleId: mobile.ios.ats.arbitrary-loads-enabled
    title: ATS relaxed
    description: NSAllowsArbitraryLoads enabled
    defaultSeverity: high
    remediation: Remove arbitrary loads in prod
    tags: [mobile, ios, network]
    allowException: true
    targets: [mobile]
`,
  );

  writeFileSync(
    path.join(configDir, 'exceptions.yaml'),
    `version: 1
exceptions:
  - exceptionId: EXC-DEV-IOS-ATS
    ruleId: mobile.ios.ats.arbitrary-loads-enabled
    environments: [dev]
    targets: [mobile]
    reason: local development
    approvedBy: security
    expiresOn: 2099-12-31
`,
  );
}

test('compare_policy_envs intent returns deterministic diff via runtime', async () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'panthereyes-agent-intents-'));
  writeFixtureConfig(rootDir);

  try {
    const runtime = new AgentRuntime(createLogger({ test: 'compare_policy_envs_intent' }));
    const response = await runtime.handleChat({
      message: 'compare policy dev vs prod for mobile',
      intent: 'compare_policy_envs',
      context: { rootDir, target: 'mobile' },
    });

    assert.equal(response.intent.resolvedIntent, 'compare_policy_envs');
    assert.equal(response.planner.plannerId, 'compare_policy_envs');
    assert.equal(response.planner.changeSet.changes.length, 0);
    assert.deepEqual(
      response.tools.map((trace) => trace.tool),
      [
        'validate_security_config',
        'preview_effective_policy',
        'preview_effective_policy',
        'list_effective_directives',
        'list_effective_directives',
      ],
    );

    const comparison = response.planner.toolOutputs.comparison as {
      environments: { base: string; compare: string };
      summary: { changesDetected: boolean };
    };
    assert.equal(comparison.environments.base, 'dev');
    assert.equal(comparison.environments.compare, 'prod');
    assert.equal(comparison.summary.changesDetected, true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('explain_finding intent resolves demo aliases', async () => {
  const runtime = new AgentRuntime(createLogger({ test: 'explain_finding_intent' }));
  const response = await runtime.handleChat({
    message: 'explique o finding IOS-ATS-001',
    intent: 'explain_finding',
  });

  assert.equal(response.intent.resolvedIntent, 'explain_finding');
  assert.equal(response.planner.plannerId, 'explain_finding');
  assert.equal(response.planner.changeSet.changes.length, 0);
  const explanation = response.planner.toolOutputs.explanation as { findingId: string; requestedFindingId?: string };
  assert.equal(explanation.findingId, 'mobile.ios.ats.arbitrary-loads-enabled');
  assert.equal(explanation.requestedFindingId, 'IOS-ATS-001');
});

test('suggest_remediation intent returns remediation guidance for android alias', async () => {
  const runtime = new AgentRuntime(createLogger({ test: 'suggest_remediation_intent' }));
  const response = await runtime.handleChat({
    message: 'sugira uma remediacao para AND-NET-001 mantendo dev como warn e prod block',
    intent: 'suggest_remediation',
    context: { env: 'prod', target: 'mobile' },
  });

  assert.equal(response.intent.resolvedIntent, 'suggest_remediation');
  assert.equal(response.planner.plannerId, 'suggest_remediation');
  const remediation = response.planner.toolOutputs.remediation as {
    findingId: string;
    policyGuidance: string[];
  };
  assert.equal(remediation.findingId, 'mobile.android.cleartext-traffic-enabled');
  assert.equal(remediation.policyGuidance.length >= 2, true);
});

