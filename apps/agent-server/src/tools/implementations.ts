import type { Change, ChangeSet } from '../types';
import type { ToolDefinition, ToolInputMap } from './types';

function formatDirectiveValue(value: unknown): string {
  return JSON.stringify(value);
}

function buildPolicyTestFileContent(input: ToolInputMap['generate_policy_tests']): string {
  const { env, target, preview, directives } = input;
  const enabledRules = preview.rules.filter((rule) => rule.enabled);
  const blockingRules = enabledRules.filter(
    (rule) => rule.effectiveSeverity === preview.failOnSeverity || rule.effectiveSeverity === 'critical',
  );

  const assertions = enabledRules
    .slice(0, 8)
    .map(
      (rule) => `  assert.ok(rules.has('${rule.ruleId}'), 'expected rule ${rule.ruleId} to be present for ${env}/${target}');`,
    )
    .join('\n');

  const directiveAssertions = directives
    .map(
      (directive) =>
        `  assert.deepEqual(directives.get('${directive.key}'), ${formatDirectiveValue(directive.value)}, 'directive ${directive.key} mismatch');`,
    )
    .join('\n');

  return `import assert from 'node:assert/strict';
import test from 'node:test';
import { previewEffectivePolicy, listEffectiveDirectives } from '@panthereyes/policy-engine';

test('policy preview matches expected directives for ${env}/${target}', () => {
  const preview = previewEffectivePolicy('${env}', '${target}');
  const directives = new Map(listEffectiveDirectives('${env}', '${target}').map((d) => [d.key, d.value]));
  const rules = new Map(preview.rules.map((rule) => [rule.ruleId, rule]));

  assert.equal(preview.mode, '${preview.mode}');
  assert.equal(preview.failOnSeverity, '${preview.failOnSeverity}');
  assert.equal(preview.rules.length >= ${enabledRules.length}, true);
${directiveAssertions || '  // No directives to assert.'}
${assertions || '  // No rules to assert.'}
});

test('policy preview block threshold remains stable for ${env}/${target}', () => {
  const preview = previewEffectivePolicy('${env}', '${target}');
  const blockingCandidates = preview.rules.filter((rule) =>
    rule.enabled && (rule.effectiveSeverity === preview.failOnSeverity || rule.effectiveSeverity === 'critical'),
  );

  assert.equal(preview.failOnSeverity, '${preview.failOnSeverity}');
  assert.equal(blockingCandidates.length >= ${blockingRules.length}, true);
});
`;
}

function buildPolicySnapshotContent(input: ToolInputMap['generate_policy_tests']): string {
  const snapshot = {
    env: input.env,
    target: input.target,
    mode: input.preview.mode,
    failOnSeverity: input.preview.failOnSeverity,
    directives: input.directives,
    ruleCount: input.preview.rules.length,
    exceptionsApplied: input.preview.exceptionsApplied.map((entry) => entry.exceptionId),
    cliScanPreview: input.preview.rules.length,
  };

  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function buildReadmeNoteContent(input: ToolInputMap['generate_policy_tests']): string {
  return `# PantherEyes Policy Tests (${input.env}/${input.target})

This file is a dry-run generated proposal from the agent planner. Apply the ChangeSet to add policy regression tests.

## Inputs

- env: ${input.env}
- target: ${input.target}
- rules considered: ${input.preview.rules.length}
- directives considered: ${input.directives.length}
- config root: ${input.rootDir}
`;
}

function buildChangeSet(input: ToolInputMap['generate_policy_tests']): ChangeSet {
  const baseDir = `tests/policy/${input.env}`;
  const changes: Change[] = [
    {
      kind: 'create',
      path: `${baseDir}/${input.target}.effective-policy.test.ts`,
      language: 'ts',
      reason: 'Add deterministic regression tests for effective policy preview and directives.',
      content: buildPolicyTestFileContent(input),
    },
    {
      kind: 'create',
      path: `${baseDir}/${input.target}.effective-policy.snapshot.json`,
      language: 'json',
      reason: 'Persist expected effective policy snapshot for review (dry-run proposal only).',
      content: buildPolicySnapshotContent(input),
    },
    {
      kind: 'create',
      path: `${baseDir}/README.md`,
      language: 'md',
      reason: 'Document generated policy test scope and assumptions.',
      content: buildReadmeNoteContent(input),
    },
  ];

  return {
    dryRun: true,
    summary: `Proposed ${changes.length} file change(s) for policy tests in ${baseDir}`,
    changes,
  };
}

export function createToolImplementations(): Array<ToolDefinition> {
  const validateTool: ToolDefinition<'validate_security_config'> = {
    name: 'validate_security_config',
    description: 'Validate PantherEyes .panthereyes YAML files and return basic counts.',
    execute(input, context) {
      return context.adapters.policyConfig.validateSecurityConfig(input.rootDir);
    },
  };

  const previewTool: ToolDefinition<'preview_effective_policy'> = {
    name: 'preview_effective_policy',
    description: 'Resolve effective policy for a given environment and target.',
    execute(input, context) {
      return context.adapters.policyConfig.previewEffectivePolicy(input.rootDir, input.env, input.target);
    },
  };

  const listDirectivesTool: ToolDefinition<'list_effective_directives'> = {
    name: 'list_effective_directives',
    description: 'List final effective directives with provenance for env and target.',
    execute(input, context) {
      return context.adapters.policyConfig.listEffectiveDirectives(input.rootDir, input.env, input.target);
    },
  };

  const generateTestsTool: ToolDefinition<'generate_policy_tests'> = {
    name: 'generate_policy_tests',
    description: 'Generate a dry-run ChangeSet for policy regression tests without writing files.',
    execute(input, context) {
      const cliPreview = context.adapters.cli.previewScanCommand({
        env: input.env,
        target: input.target,
        rootDir: input.rootDir,
      });
      const sdkScore = context.adapters.sdk.scoreDemoFinding(input.target);
      const changeSet = buildChangeSet(input);
      const notes = [
        `CLI preview: ${cliPreview.command.join(' ')}`,
        `SDK score baseline (empty findings): ${sdkScore.score}/${sdkScore.status}`,
        'Planner is deterministic; no LLM call was performed.',
      ];

      return {
        changeSet,
        notes,
      };
    },
  };

  return [
    validateTool as unknown as ToolDefinition,
    previewTool as unknown as ToolDefinition,
    listDirectivesTool as unknown as ToolDefinition,
    generateTestsTool as unknown as ToolDefinition,
  ];
}
