import type { IntentId } from '../types';

export interface IntentDefinition {
  id: IntentId;
  title: string;
  description: string;
  keywords: string[];
}

export const intentCatalog: IntentDefinition[] = [
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
