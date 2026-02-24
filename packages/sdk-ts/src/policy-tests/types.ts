export type PolicyTestEnv = 'dev' | 'staging' | 'prod' | string;
export type PolicyTestTarget = 'ios' | 'android';
export type PolicyTestOutputMode = 'changeset' | 'write';

export type DirectivePrimitive = string | number | boolean;
export type DirectiveValue = DirectivePrimitive | DirectivePrimitive[];

export interface PolicyDirectiveInput {
  key: string;
  value: DirectiveValue;
  source?: string;
}

export interface PolicyRuleInput {
  ruleId: string;
  enabled: boolean;
  effectiveSeverity: string;
  defaultSeverity?: string;
  hasActiveException?: boolean;
  allowException?: boolean;
}

export interface PolicyTestEffectivePolicyInput {
  env: PolicyTestEnv;
  target: PolicyTestTarget;
  mode: string;
  failOnSeverity: string;
  rules: PolicyRuleInput[];
}

export interface Change {
  kind: 'create' | 'update';
  path: string;
  language?: string;
  reason: string;
  content: string;
}

export interface ChangeSet {
  dryRun: boolean;
  summary: string;
  changes: Change[];
}

export interface PolicyTestGeneratorInput {
  effectivePolicy: PolicyTestEffectivePolicyInput;
  directives: PolicyDirectiveInput[];
  outputMode: PolicyTestOutputMode;
  outputDir?: string;
  basePath?: string;
  namespace?: string;
}

export interface RenderedPolicyTestFile {
  path: string;
  language: 'swift' | 'java';
  content: string;
}

export interface PolicyTestTemplateInput {
  effectivePolicy: PolicyTestEffectivePolicyInput;
  directives: PolicyDirectiveInput[];
  namespace?: string;
}
