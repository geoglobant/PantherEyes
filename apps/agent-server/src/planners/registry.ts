import type { IntentId } from '../types';
import type { Planner } from './types';
import { generatePolicyTestsPlanner } from './generatePolicyTests';

export class PlannerRegistry {
  private readonly planners = new Map<IntentId, Planner>([[generatePolicyTestsPlanner.id, generatePolicyTestsPlanner]]);

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
