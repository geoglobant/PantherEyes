import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { listEffectiveDirectives, previewEffectivePolicy } from './index';

function writeFixturePantherEyesConfig(): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'panthereyes-policy-engine-'));
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
    requireApprovalForExceptions: true
  ruleOverrides:
    web.csp.required:
      enabled: true
      severity: high
envs:
  dev:
    mode: audit
    directives:
      minScore: 55
      sampleRate: 0.2
    targets:
      web:
        failOnSeverity: critical
        directives:
          browserStackEnabled: true
        ruleOverrides:
          web.csp.required:
            severity: medium
      mobile:
        directives:
          emulatorChecks: false
  prod:
    mode: enforce
    directives:
      minScore: 95
    targets:
      web:
        directives:
          browserStackEnabled: false
`,
    'utf8',
  );

  writeFileSync(
    path.join(configDir, 'rules.yaml'),
    `version: 1
rules:
  - ruleId: web.csp.required
    title: Content-Security-Policy obrigatoria
    description: Aplicacoes web devem configurar CSP.
    defaultSeverity: high
    remediation: Definir o header CSP de forma restritiva.
    tags: [web, headers, xss]
    allowException: true
    targets: [web]
  - ruleId: web.cookies.secure-flag
    title: Cookies com Secure
    description: Cookies sensiveis devem usar flag Secure.
    defaultSeverity: medium
    remediation: Habilitar Secure e HttpOnly em cookies sensiveis.
    tags: [web, cookies]
    allowException: false
    targets: [web]
  - ruleId: mobile.debug.disabled
    title: Build release sem debug
    description: Builds mobile de release nao devem ser debug.
    defaultSeverity: medium
    remediation: Desabilitar debuggable em release.
    tags: [mobile]
    allowException: false
    targets: [mobile]
`,
    'utf8',
  );

  writeFileSync(
    path.join(configDir, 'exceptions.yaml'),
    `version: 1
exceptions:
  - exceptionId: EXC-001
    ruleId: web.csp.required
    environments: [dev]
    targets: [web]
    reason: Ambiente local legado sem reverse proxy.
    approvedBy: security-team
    expiresOn: 2099-12-31
  - exceptionId: EXC-002
    ruleId: web.cookies.secure-flag
    environments: [prod]
    targets: [web]
    reason: Regra nao permite excecao (deve ser ignorada na regra efetiva).
    approvedBy: security-team
    expiresOn: 2099-12-31
`,
    'utf8',
  );

  return rootDir;
}

test('previewEffectivePolicy merges defaults + env + target (dev vs prod)', () => {
  const rootDir = writeFixturePantherEyesConfig();

  const devWeb = previewEffectivePolicy('dev', 'web', { rootDir });
  const prodWeb = previewEffectivePolicy('prod', 'web', { rootDir });

  assert.equal(devWeb.mode, 'audit');
  assert.equal(prodWeb.mode, 'enforce');

  assert.equal(devWeb.failOnSeverity, 'critical');
  assert.equal(prodWeb.failOnSeverity, 'high');

  assert.equal(devWeb.directives.minScore, 55);
  assert.equal(prodWeb.directives.minScore, 95);
  assert.equal(devWeb.directives.browserStackEnabled, true);
  assert.equal(prodWeb.directives.browserStackEnabled, false);

  const devCsp = devWeb.rules.find((rule) => rule.ruleId === 'web.csp.required');
  const prodCsp = prodWeb.rules.find((rule) => rule.ruleId === 'web.csp.required');

  assert.ok(devCsp);
  assert.ok(prodCsp);
  assert.equal(devCsp.effectiveSeverity, 'medium');
  assert.equal(prodCsp.effectiveSeverity, 'high');
  assert.equal(devCsp.hasActiveException, true);
  assert.equal(prodCsp.hasActiveException, false);
});

test('listEffectiveDirectives returns final values with provenance', () => {
  const rootDir = writeFixturePantherEyesConfig();
  const directives = listEffectiveDirectives('dev', 'web', { rootDir });

  const minScore = directives.find((entry) => entry.key === 'minScore');
  const browserStack = directives.find((entry) => entry.key === 'browserStackEnabled');
  const approvals = directives.find((entry) => entry.key === 'requireApprovalForExceptions');

  assert.deepEqual(minScore, {
    key: 'minScore',
    value: 55,
    source: 'envs.dev',
  });

  assert.deepEqual(browserStack, {
    key: 'browserStackEnabled',
    value: true,
    source: 'envs.dev.targets.web',
  });

  assert.deepEqual(approvals, {
    key: 'requireApprovalForExceptions',
    value: true,
    source: 'defaults',
  });
});
