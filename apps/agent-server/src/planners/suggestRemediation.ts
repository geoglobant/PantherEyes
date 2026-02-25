import type { Planner, PlannerContext, PlannerRunInput, PlannerRunOutput } from './types';
import { emptyChangeSet, normalizeToolError, resolvePlannerInputs } from './common';
import { extractFindingIdFromMessage, resolveFindingKnowledge } from './findingKnowledge';
import type { ToolTrace } from '../types';

function extractEnvironmentHint(message: string): { keepDevWarn: boolean; wantsProdBlock: boolean } {
  const normalized = message.toLowerCase();
  return {
    keepDevWarn: normalized.includes('dev') && (normalized.includes('warn') || normalized.includes('audit')),
    wantsProdBlock: normalized.includes('prod') && (normalized.includes('block') || normalized.includes('bloquei')),
  };
}

export const suggestRemediationPlanner: Planner = {
  id: 'suggest_remediation',
  deterministic: true,

  async run(input: PlannerRunInput, context: PlannerContext): Promise<PlannerRunOutput> {
    const plannerLogger = context.logger.child({ plannerId: 'suggest_remediation' });
    const traces: ToolTrace[] = [];
    const { env, target, rootDir } = resolvePlannerInputs(input.request);
    const requestedFinding = extractFindingIdFromMessage(input.request.message);
    const knowledge = resolveFindingKnowledge(requestedFinding);
    const hints = extractEnvironmentHint(input.request.message);

    plannerLogger.info('planner.suggest_remediation.start', {
      rootDir,
      env,
      target,
      requestedFinding,
      resolvedFinding: knowledge?.canonicalId,
      hints,
    });

    try {
      let previewSummary: unknown;
      if (input.request.context?.rootDir) {
        const previewRun = await context.tools.run(context.requestId, 'preview_effective_policy', { rootDir, env, target });
        traces.push(previewRun.trace);
        previewSummary = {
          env: previewRun.output.env,
          target: previewRun.output.target,
          mode: previewRun.output.mode,
          failOnSeverity: previewRun.output.failOnSeverity,
          ruleCount: previewRun.output.rules.length,
        };
      }

      const remediation = knowledge
        ? {
            findingId: knowledge.canonicalId,
            requestedFindingId: requestedFinding,
            title: knowledge.title,
            remediationSteps: knowledge.remediation,
            policyGuidance: [
              hints.keepDevWarn
                ? 'Keep dev in warn/audit mode while applying code/config remediation in prod/staging first.'
                : 'Validate whether dev should remain warn/audit to avoid blocking local experimentation.',
              hints.wantsProdBlock
                ? 'Set prod policy to block on this finding severity (or stronger) after remediation rollout.'
                : 'Confirm prod policy fail threshold matches the finding severity for enforcement.',
            ],
            suggestedFiles: knowledge.references,
            dryRunChangeSetSupported: false,
            notes: ['This planner suggests remediation steps only; it does not apply patches yet.'],
          }
        : {
            findingId: requestedFinding ?? 'unknown',
            requestedFindingId: requestedFinding,
            title: 'Unknown finding',
            remediationSteps: [
              'Use the exact finding `id` from PantherEyes scan JSON output.',
              'Re-run the request with `rootDir`, `env`, and `target` context to get policy-aware guidance.',
            ],
            policyGuidance: ['Deterministic remediation knowledge is available only for seeded demo findings in this version.'],
            suggestedFiles: [],
            dryRunChangeSetSupported: false,
            notes: ['LLM-backed remediation generation is not enabled in this deterministic planner.'],
          };

      const summary = knowledge
        ? `Suggested remediation for ${knowledge.canonicalId} with policy guidance for ${env}/${target}.`
        : 'Returned generic remediation guidance because finding could not be mapped.';

      return {
        result: {
          plannerId: 'suggest_remediation',
          deterministic: true,
          summary,
          changeSet: emptyChangeSet(summary),
          toolOutputs: {
            remediation,
            policyContext: previewSummary ?? null,
          },
          context: {
            env,
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
      plannerLogger.error('planner.suggest_remediation.error', { error: normalized.cause ?? error });
      throw normalized.cause ?? error;
    }
  },
};

