import { evaluatePolicy, type EvaluationInput, type EvaluationResult } from '@panthereyes/policy-engine';
export { PolicyTestGenerator } from './policy-tests/PolicyTestGenerator';
export { junitPolicyTemplate } from './policy-tests/templates/junitPolicyTemplate';
export { xctestPolicyTemplate } from './policy-tests/templates/xctestPolicyTemplate';
export type {
  Change,
  ChangeSet,
  PolicyDirectiveInput,
  PolicyRuleInput,
  PolicyTestEffectivePolicyInput,
  PolicyTestGeneratorInput,
  PolicyTestOutputMode,
  PolicyTestTarget,
} from './policy-tests/types';

export interface PantherEyesClientOptions {
  appName: string;
}

export class PantherEyesClient {
  constructor(private readonly options: PantherEyesClientOptions) {}

  evaluate(input: EvaluationInput): EvaluationResult & { appName: string; evaluatedAt: string } {
    const result = evaluatePolicy(input);

    return {
      ...result,
      appName: this.options.appName,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

export type { EvaluationInput, EvaluationResult } from '@panthereyes/policy-engine';
