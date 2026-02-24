import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import {
  defaultRuleCatalog,
  loadExceptions,
  loadRuleCatalog,
  pantherEyesConfigFile,
  severitySchema,
  targetSchema,
  type RuleException,
  type RuleMetadata,
  type RuleTarget,
  type Severity,
} from '@panthereyes/rule-catalog';

const directivePrimitiveSchema = z.union([z.string(), z.number(), z.boolean()]);
const directiveValueSchema = z.union([directivePrimitiveSchema, z.array(directivePrimitiveSchema)]);

export type DirectiveValue = z.infer<typeof directiveValueSchema>;

const ruleOverrideSchema = z.object({
  enabled: z.boolean().optional(),
  severity: severitySchema.optional(),
  directives: z.record(directiveValueSchema).default({}),
});

export type RuleOverride = z.infer<typeof ruleOverrideSchema>;

const policyLayerSchema = z.object({
  mode: z.enum(['audit', 'warn', 'enforce']).optional(),
  failOnSeverity: severitySchema.optional(),
  directives: z.record(directiveValueSchema).default({}),
  ruleOverrides: z.record(ruleOverrideSchema).default({}),
});

export type PolicyLayer = z.infer<typeof policyLayerSchema>;

const envTargetOverridesSchema = z
  .object({
    web: policyLayerSchema.optional(),
    mobile: policyLayerSchema.optional(),
  })
  .default({});

const environmentPolicySchema = policyLayerSchema.extend({
  targets: envTargetOverridesSchema,
});

export type EnvironmentPolicy = z.infer<typeof environmentPolicySchema>;

export const policyFileSchema = z.object({
  version: z.number().int().positive().default(1),
  defaults: policyLayerSchema.default({ directives: {}, ruleOverrides: {} }),
  envs: z.record(environmentPolicySchema).default({}),
});

export type PolicyFile = z.infer<typeof policyFileSchema>;

export interface PolicyEngineOptions {
  rootDir?: string;
}

export interface EffectiveDirective {
  key: string;
  value: DirectiveValue;
  source: 'defaults' | `envs.${string}` | `envs.${string}.targets.${RuleTarget}`;
}

export interface EffectiveRulePreview {
  ruleId: string;
  title: string;
  description: string;
  remediation: string;
  tags: string[];
  allowException: boolean;
  enabled: boolean;
  defaultSeverity: Severity;
  effectiveSeverity: Severity;
  hasActiveException: boolean;
  activeExceptions: RuleException[];
  overrideDirectives: Record<string, DirectiveValue>;
}

export interface EffectivePolicyPreview {
  env: string;
  target: RuleTarget;
  mode: 'audit' | 'warn' | 'enforce';
  failOnSeverity: Severity;
  directives: Record<string, DirectiveValue>;
  directiveList: EffectiveDirective[];
  rules: EffectiveRulePreview[];
  exceptionsApplied: RuleException[];
  paths: {
    policy: string;
    rules: string;
    exceptions: string;
  };
}

export class PolicyConfigSchemaError extends Error {
  constructor(public readonly filePath: string, message: string) {
    super(`Invalid policy schema in ${filePath}: ${message}`);
    this.name = 'PolicyConfigSchemaError';
  }
}

export class PolicyConfigIoError extends Error {
  constructor(public readonly filePath: string, cause: unknown) {
    super(`Failed to read policy file ${filePath}`);
    this.name = 'PolicyConfigIoError';
    this.cause = cause;
  }

  declare cause: unknown;
}

export class UnknownPolicyEnvironmentError extends Error {
  constructor(public readonly envName: string, availableEnvs: string[]) {
    super(
      `Unknown policy environment '${envName}'. Available: ${availableEnvs.length ? availableEnvs.join(', ') : '<none>'}`,
    );
    this.name = 'UnknownPolicyEnvironmentError';
  }
}

export function parsePolicyYaml(rawYaml: string, filePath = '.panthereyes/policy.yaml'): PolicyFile {
  const parsed = YAML.parse(rawYaml);
  const result = policyFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new PolicyConfigSchemaError(filePath, result.error.message);
  }
  return result.data;
}

export function loadPolicyFile(options: PolicyEngineOptions = {}): { filePath: string; data: PolicyFile } {
  const rootDir = options.rootDir ?? process.cwd();
  const filePath = pantherEyesConfigFile(rootDir, 'policy.yaml');
  let rawYaml: string;

  try {
    rawYaml = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new PolicyConfigIoError(filePath, error);
  }

  return { filePath, data: parsePolicyYaml(rawYaml, filePath) };
}

interface LayerWithSource {
  source: EffectiveDirective['source'];
  layer: PolicyLayer | undefined;
}

interface ResolvedPolicyLayer {
  mode: 'audit' | 'warn' | 'enforce';
  failOnSeverity: Severity;
  directives: Record<string, DirectiveValue>;
  directiveList: EffectiveDirective[];
  ruleOverrides: Record<string, RuleOverride>;
}

function resolveLayerStack(policy: PolicyFile, env: string, target: RuleTarget): LayerWithSource[] {
  const envConfig = policy.envs[env];
  if (!envConfig) {
    throw new UnknownPolicyEnvironmentError(env, Object.keys(policy.envs));
  }

  return [
    { source: 'defaults', layer: policy.defaults },
    { source: `envs.${env}`, layer: envConfig },
    { source: `envs.${env}.targets.${target}`, layer: envConfig.targets[target] },
  ];
}

function mergeRuleOverrides(
  base: Record<string, RuleOverride>,
  incoming: Record<string, RuleOverride>,
): Record<string, RuleOverride> {
  const next: Record<string, RuleOverride> = { ...base };

  for (const [ruleId, override] of Object.entries(incoming)) {
    const previous = next[ruleId];
    next[ruleId] = {
      enabled: override.enabled ?? previous?.enabled,
      severity: override.severity ?? previous?.severity,
      directives: {
        ...(previous?.directives ?? {}),
        ...(override.directives ?? {}),
      },
    };
  }

  return next;
}

function resolveEffectiveLayer(policy: PolicyFile, env: string, target: RuleTarget): ResolvedPolicyLayer {
  const layers = resolveLayerStack(policy, env, target);
  let mode: 'audit' | 'warn' | 'enforce' = 'warn';
  let failOnSeverity: Severity = 'high';
  let directives: Record<string, DirectiveValue> = {};
  let ruleOverrides: Record<string, RuleOverride> = {};
  const directiveSourceMap = new Map<string, EffectiveDirective['source']>();

  for (const { source, layer } of layers) {
    if (!layer) {
      continue;
    }

    if (layer.mode) {
      mode = layer.mode;
    }
    if (layer.failOnSeverity) {
      failOnSeverity = layer.failOnSeverity;
    }
    for (const [key, value] of Object.entries(layer.directives ?? {})) {
      directives[key] = value;
      directiveSourceMap.set(key, source);
    }
    ruleOverrides = mergeRuleOverrides(ruleOverrides, layer.ruleOverrides ?? {});
  }

  const directiveList = Object.keys(directives)
    .sort()
    .map((key) => ({
      key,
      value: directives[key],
      source: directiveSourceMap.get(key) ?? 'defaults',
    }));

  return {
    mode,
    failOnSeverity,
    directives,
    directiveList,
    ruleOverrides,
  };
}

function isExceptionActiveFor(
  exceptionEntry: RuleException,
  env: string,
  target: RuleTarget,
  now = new Date(),
): boolean {
  if (!exceptionEntry.environments.includes(env)) {
    return false;
  }
  if (!exceptionEntry.targets.includes(target)) {
    return false;
  }
  if (!exceptionEntry.expiresOn) {
    return true;
  }

  const expiry = new Date(`${exceptionEntry.expiresOn}T23:59:59.999Z`);
  return !Number.isNaN(expiry.getTime()) && expiry >= now;
}

function toEffectiveRulePreview(
  rule: RuleMetadata,
  override: RuleOverride | undefined,
  activeExceptions: RuleException[],
): EffectiveRulePreview {
  return {
    ruleId: rule.ruleId,
    title: rule.title,
    description: rule.description,
    remediation: rule.remediation,
    tags: rule.tags,
    allowException: rule.allowException,
    enabled: override?.enabled ?? true,
    defaultSeverity: rule.defaultSeverity,
    effectiveSeverity: override?.severity ?? rule.defaultSeverity,
    hasActiveException: activeExceptions.length > 0,
    activeExceptions,
    overrideDirectives: override?.directives ?? {},
  };
}

export function previewEffectivePolicy(
  env: string,
  target: RuleTarget,
  options: PolicyEngineOptions = {},
): EffectivePolicyPreview {
  const rootDir = options.rootDir ?? process.cwd();
  const policy = loadPolicyFile({ rootDir });
  const rulesCatalog = loadRuleCatalog({ rootDir });
  const exceptionsCatalog = loadExceptions({ rootDir });
  const resolved = resolveEffectiveLayer(policy.data, env, target);

  const scopedRules = (rulesCatalog.rules.length ? rulesCatalog.rules : defaultRuleCatalog.rules).filter((rule) =>
    rule.targets.includes(target),
  );

  const activeExceptions = exceptionsCatalog.exceptions.filter((entry) => isExceptionActiveFor(entry, env, target));

  const effectiveRules = scopedRules.map((rule) => {
    const ruleExceptions = activeExceptions.filter((entry) => entry.ruleId === rule.ruleId && rule.allowException);
    return toEffectiveRulePreview(rule, resolved.ruleOverrides[rule.ruleId], ruleExceptions);
  });

  return {
    env,
    target,
    mode: resolved.mode,
    failOnSeverity: resolved.failOnSeverity,
    directives: resolved.directives,
    directiveList: resolved.directiveList,
    rules: effectiveRules,
    exceptionsApplied: activeExceptions.filter((entry) => scopedRules.some((rule) => rule.ruleId === entry.ruleId)),
    paths: {
      policy: path.join(rootDir, '.panthereyes', 'policy.yaml'),
      rules: path.join(rootDir, '.panthereyes', 'rules.yaml'),
      exceptions: path.join(rootDir, '.panthereyes', 'exceptions.yaml'),
    },
  };
}

export function listEffectiveDirectives(
  env: string,
  target: RuleTarget,
  options: PolicyEngineOptions = {},
): EffectiveDirective[] {
  return previewEffectivePolicy(env, target, options).directiveList;
}

// Backward-compatible scoring API used by sdk-ts scaffold.
export interface FindingInput {
  id: string;
  severity: Severity;
  message: string;
}

export interface EvaluationInput {
  target: RuleTarget;
  findings: FindingInput[];
  rules?: Array<{
    id: string;
    title: string;
    severity: Severity;
    description: string;
    targets: RuleTarget[];
  }>;
}

export interface EvaluationResult {
  target: RuleTarget;
  findings: FindingInput[];
  matchedRules: Array<{
    id: string;
    title: string;
    severity: Severity;
    description: string;
    targets: RuleTarget[];
  }>;
  score: number;
  status: 'pass' | 'warn' | 'fail';
}

export function evaluatePolicy(input: EvaluationInput): EvaluationResult {
  const rules =
    input.rules ??
    defaultRuleCatalog.rules.map((rule) => ({
      id: rule.ruleId,
      title: rule.title,
      severity: rule.defaultSeverity,
      description: rule.description,
      targets: rule.targets,
    }));

  const matchedRules = rules.filter((rule) => rule.targets.includes(input.target));
  const severityWeight: Record<Severity, number> = {
    low: 5,
    medium: 15,
    high: 35,
    critical: 60,
  };

  const penalty = input.findings.reduce((sum, finding) => sum + severityWeight[finding.severity], 0);
  const score = Math.max(0, 100 - penalty);
  const status: EvaluationResult['status'] = score >= 85 ? 'pass' : score >= 60 ? 'warn' : 'fail';

  return {
    target: input.target,
    findings: input.findings,
    matchedRules,
    score,
    status,
  };
}
