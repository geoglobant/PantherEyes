import type { ToolOutputMap } from '../tools/types';
import type { Planner, PlannerContext, PlannerRunInput, PlannerRunOutput } from './types';
import { emptyChangeSet, inferEnvironmentPair, normalizeToolError, resolvePlannerInputs } from './common';
import type { ToolTrace } from '../types';

type PolicyPreview = ToolOutputMap['preview_effective_policy'];
type EffectiveDirective = ToolOutputMap['list_effective_directives'][number];

interface PolicyEnvComparison {
  rootDir: string;
  target: 'web' | 'mobile';
  environments: { base: string; compare: string };
  mode: { base: string; compare: string; changed: boolean };
  failOnSeverity: { base: string; compare: string; changed: boolean };
  directives: Array<{
    key: string;
    status: 'added' | 'removed' | 'changed';
    baseValue?: unknown;
    compareValue?: unknown;
    baseSource?: string;
    compareSource?: string;
  }>;
  rules: Array<{
    ruleId: string;
    status: 'added' | 'removed' | 'changed';
    changes: string[];
  }>;
  summary: {
    changesDetected: boolean;
    directiveDiffCount: number;
    ruleDiffCount: number;
  };
}

function buildDirectiveMap(directives: EffectiveDirective[]): Map<string, EffectiveDirective> {
  return new Map(directives.map((directive) => [directive.key, directive]));
}

function comparePolicies(input: {
  rootDir: string;
  target: 'web' | 'mobile';
  baseEnv: string;
  compareEnv: string;
  basePreview: PolicyPreview;
  comparePreview: PolicyPreview;
  baseDirectives: EffectiveDirective[];
  compareDirectives: EffectiveDirective[];
}): PolicyEnvComparison {
  const baseDirectiveMap = buildDirectiveMap(input.baseDirectives);
  const compareDirectiveMap = buildDirectiveMap(input.compareDirectives);
  const directiveKeys = [...new Set([...baseDirectiveMap.keys(), ...compareDirectiveMap.keys()])].sort();

  const directives: PolicyEnvComparison['directives'] = [];
  for (const key of directiveKeys) {
    const base = baseDirectiveMap.get(key);
    const compare = compareDirectiveMap.get(key);
    if (!base && compare) {
      directives.push({
        key,
        status: 'added',
        compareValue: compare.value,
        compareSource: compare.source,
      });
      continue;
    }
    if (base && !compare) {
      directives.push({
        key,
        status: 'removed',
        baseValue: base.value,
        baseSource: base.source,
      });
      continue;
    }
    if (base && compare) {
      const baseValue = JSON.stringify(base.value);
      const compareValue = JSON.stringify(compare.value);
      const changed = baseValue !== compareValue || base.source !== compare.source;
      if (changed) {
        directives.push({
          key,
          status: 'changed',
          baseValue: base.value,
          compareValue: compare.value,
          baseSource: base.source,
          compareSource: compare.source,
        });
      }
    }
  }

  const baseRuleMap = new Map(input.basePreview.rules.map((rule) => [rule.ruleId, rule]));
  const compareRuleMap = new Map(input.comparePreview.rules.map((rule) => [rule.ruleId, rule]));
  const ruleIds = [...new Set([...baseRuleMap.keys(), ...compareRuleMap.keys()])].sort();
  const rules: PolicyEnvComparison['rules'] = [];
  for (const ruleId of ruleIds) {
    const baseRule = baseRuleMap.get(ruleId);
    const compareRule = compareRuleMap.get(ruleId);

    if (!baseRule && compareRule) {
      rules.push({ ruleId, status: 'added', changes: ['rule added'] });
      continue;
    }
    if (baseRule && !compareRule) {
      rules.push({ ruleId, status: 'removed', changes: ['rule removed'] });
      continue;
    }
    if (!baseRule || !compareRule) {
      continue;
    }

    const changes: string[] = [];
    if (baseRule.enabled !== compareRule.enabled) {
      changes.push(`enabled: ${baseRule.enabled} -> ${compareRule.enabled}`);
    }
    if (baseRule.effectiveSeverity !== compareRule.effectiveSeverity) {
      changes.push(`effectiveSeverity: ${baseRule.effectiveSeverity} -> ${compareRule.effectiveSeverity}`);
    }
    if (baseRule.hasActiveException !== compareRule.hasActiveException) {
      changes.push(`hasActiveException: ${baseRule.hasActiveException} -> ${compareRule.hasActiveException}`);
    }

    if (changes.length > 0) {
      rules.push({ ruleId, status: 'changed', changes });
    }
  }

  const modeChanged = input.basePreview.mode !== input.comparePreview.mode;
  const failChanged = input.basePreview.failOnSeverity !== input.comparePreview.failOnSeverity;

  return {
    rootDir: input.rootDir,
    target: input.target,
    environments: {
      base: input.baseEnv,
      compare: input.compareEnv,
    },
    mode: {
      base: input.basePreview.mode,
      compare: input.comparePreview.mode,
      changed: modeChanged,
    },
    failOnSeverity: {
      base: input.basePreview.failOnSeverity,
      compare: input.comparePreview.failOnSeverity,
      changed: failChanged,
    },
    directives,
    rules,
    summary: {
      changesDetected: modeChanged || failChanged || directives.length > 0 || rules.length > 0,
      directiveDiffCount: directives.length,
      ruleDiffCount: rules.length,
    },
  };
}

export const comparePolicyEnvsPlanner: Planner = {
  id: 'compare_policy_envs',
  deterministic: true,

  async run(input: PlannerRunInput, context: PlannerContext): Promise<PlannerRunOutput> {
    const plannerLogger = context.logger.child({ plannerId: 'compare_policy_envs' });
    const traces: ToolTrace[] = [];
    const { target, rootDir, env } = resolvePlannerInputs(input.request);
    const { baseEnv, compareEnv } = inferEnvironmentPair(input.request.message, env);

    plannerLogger.info('planner.compare_policy_envs.start', {
      rootDir,
      target,
      baseEnv,
      compareEnv,
    });

    try {
      const validationRun = await context.tools.run(context.requestId, 'validate_security_config', { rootDir });
      traces.push(validationRun.trace);

      const basePreviewRun = await context.tools.run(context.requestId, 'preview_effective_policy', {
        rootDir,
        env: baseEnv,
        target,
      });
      traces.push(basePreviewRun.trace);

      const comparePreviewRun = await context.tools.run(context.requestId, 'preview_effective_policy', {
        rootDir,
        env: compareEnv,
        target,
      });
      traces.push(comparePreviewRun.trace);

      const baseDirectivesRun = await context.tools.run(context.requestId, 'list_effective_directives', {
        rootDir,
        env: baseEnv,
        target,
      });
      traces.push(baseDirectivesRun.trace);

      const compareDirectivesRun = await context.tools.run(context.requestId, 'list_effective_directives', {
        rootDir,
        env: compareEnv,
        target,
      });
      traces.push(compareDirectivesRun.trace);

      const comparison = comparePolicies({
        rootDir,
        target,
        baseEnv,
        compareEnv,
        basePreview: basePreviewRun.output,
        comparePreview: comparePreviewRun.output,
        baseDirectives: baseDirectivesRun.output,
        compareDirectives: compareDirectivesRun.output,
      });

      const summary = comparison.summary.changesDetected
        ? `Compared policy ${baseEnv} -> ${compareEnv} for ${target}. Found ${comparison.summary.directiveDiffCount} directive diff(s) and ${comparison.summary.ruleDiffCount} rule diff(s).`
        : `Compared policy ${baseEnv} -> ${compareEnv} for ${target}. No effective differences detected.`;

      return {
        result: {
          plannerId: 'compare_policy_envs',
          deterministic: true,
          summary,
          changeSet: emptyChangeSet(summary),
          toolOutputs: {
            validation: validationRun.output,
            comparison,
          },
          context: {
            env: compareEnv,
            target,
            rootDir,
          },
        },
        traces,
      };
    } catch (error) {
      const normalized = normalizeToolError(error);
      if (normalized.trace) {
        traces.push(normalized.trace);
      }
      plannerLogger.error('planner.compare_policy_envs.error', { error: normalized.cause ?? error });
      throw normalized.cause ?? error;
    }
  },
};
