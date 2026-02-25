import type { IntentId } from '../types';

export interface IntentDefinition {
  id: IntentId;
  title: string;
  description: string;
  keywords: string[];
}

export const intentCatalog: IntentDefinition[] = [
  {
    id: 'compare_policy_envs',
    title: 'Compare Policy Environments',
    description: 'Compare effective policy and directives between environments for a target.',
    keywords: ['compare', 'diff', 'difference', 'policy', 'env', 'environment', 'dev', 'staging', 'prod'],
  },
  {
    id: 'explain_finding',
    title: 'Explain Finding',
    description: 'Explain a security finding and why it matters.',
    keywords: ['explain', 'finding', 'issue', 'vulnerability', 'ios-ats-001', 'and-net-001', 'explicar'],
  },
  {
    id: 'suggest_remediation',
    title: 'Suggest Remediation',
    description: 'Suggest remediation steps for a finding or security policy issue.',
    keywords: ['remediation', 'fix', 'resolve', 'mitigate', 'remediacao', 'corrigir', 'bloqueie'],
  },
  {
    id: 'create_policy_exception',
    title: 'Create Policy Exception',
    description: 'Generate a dry-run ChangeSet proposal to add an exception entry in exceptions.yaml.',
    keywords: ['exception', 'excecao', 'waiver', 'bypass', 'approve', 'approved', 'criar excecao'],
  },
  {
    id: 'generate_policy_tests',
    title: 'Generate Policy Tests',
    description: 'Generate a dry-run ChangeSet with policy validation tests for an env and target.',
    keywords: ['policy', 'test', 'tests', 'generate', 'cases', 'scenario', 'cenarios'],
  },
];

export function getIntentById(intentId: string): IntentDefinition | undefined {
  return intentCatalog.find((intent) => intent.id === intentId);
}
