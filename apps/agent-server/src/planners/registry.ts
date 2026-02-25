import type { IntentId } from '../types';
import type { Planner } from './types';
import { comparePolicyEnvsPlanner } from './comparePolicyEnvs';
import { explainFindingPlanner } from './explainFinding';
import { generatePolicyTestsPlanner } from './generatePolicyTests';
import { suggestRemediationPlanner } from './suggestRemediation';

export class PlannerRegistry {
  private readonly planners = new Map<IntentId, Planner>([
    [generatePolicyTestsPlanner.id, generatePolicyTestsPlanner],
    [comparePolicyEnvsPlanner.id, comparePolicyEnvsPlanner],
    [explainFindingPlanner.id, explainFindingPlanner],
    [suggestRemediationPlanner.id, suggestRemediationPlanner],
  ]);

  get(intentId: IntentId): Planner {
    const planner = this.planners.get(intentId);
    if (!planner) {
      throw new Error(`Planner not registered for intent: ${intentId}`);
    }
    return planner;
  }

  list(): Planner[] {
    return [...this.planners.values()];
  }
}
