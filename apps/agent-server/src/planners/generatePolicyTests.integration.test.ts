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
    targets:
      web:
        failOnSeverity: critical
        directives:
          browserStackEnabled: true
  prod:
    mode: enforce
    directives:
      minScore: 95
`,
  );

  writeFileSync(
    path.join(configDir, 'rules.yaml'),
    `version: 1
rules:
  - ruleId: web.csp.required
    title: CSP obrigatoria
    description: Deve configurar CSP
    defaultSeverity: high
    remediation: Configure o header CSP.
    tags: [web, headers]
    allowException: true
    targets: [web]
`,
  );

  writeFileSync(
    path.join(configDir, 'exceptions.yaml'),
    `version: 1
exceptions:
  - exceptionId: EXC-TEST-001
    ruleId: web.csp.required
    environments: [dev]
    targets: [web]
    reason: Ambiente de desenvolvimento local
    approvedBy: security
    expiresOn: 2099-12-31
`,
  );
}

test('generate_policy_tests planner returns deterministic ChangeSet via runtime', async () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'panthereyes-agent-planner-'));
  writeFixtureConfig(rootDir);

  try {
    const logger = createLogger({ test: 'generate_policy_tests_integration' });
    const runtime = new AgentRuntime(logger);

    const response = await runtime.handleChat({
      message: 'Generate policy tests for dev web policy config',
      context: { rootDir, env: 'dev', target: 'web' },
    });

    assert.equal(response.intent.resolvedIntent, 'generate_policy_tests');
    assert.equal(response.planner.plannerId, 'generate_policy_tests');
    assert.equal(response.planner.deterministic, true);
    assert.equal(response.planner.context.env, 'dev');
    assert.equal(response.planner.context.target, 'web');
    assert.equal(response.planner.changeSet.dryRun, true);
    assert.equal(response.tools.length, 4);
    assert.deepEqual(
      response.tools.map((trace) => trace.tool),
      [
        'validate_security_config',
        'preview_effective_policy',
        'list_effective_directives',
        'generate_policy_tests',
      ],
    );

    const [testFile] = response.planner.changeSet.changes;
    assert.ok(testFile.path.endsWith('tests/policy/dev/web.effective-policy.test.ts'));
    assert.match(testFile.content, /previewEffectivePolicy\('dev', 'web'\)/);
    assert.match(testFile.content, /listEffectiveDirectives\('dev', 'web'\)/);

    const generation = response.planner.toolOutputs.generation as { notes: string[] };
    assert.ok(generation.notes.some((note) => note.includes('CLI preview')));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
