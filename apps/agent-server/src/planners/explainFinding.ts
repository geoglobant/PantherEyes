import type { Planner, PlannerContext, PlannerRunInput, PlannerRunOutput } from './types';
import { emptyChangeSet, normalizeToolError, resolvePlannerInputs } from './common';
import { extractFindingIdFromMessage, resolveFindingKnowledge } from './findingKnowledge';
import type { ToolTrace } from '../types';

export const explainFindingPlanner: Planner = {
  id: 'explain_finding',
  deterministic: true,

  async run(input: PlannerRunInput, context: PlannerContext): Promise<PlannerRunOutput> {
    const plannerLogger = context.logger.child({ plannerId: 'explain_finding' });
    const traces: ToolTrace[] = [];
    const { env, target, rootDir } = resolvePlannerInputs(input.request);
    const requestedFinding = extractFindingIdFromMessage(input.request.message);
    const knowledge = resolveFindingKnowledge(requestedFinding);

    plannerLogger.info('planner.explain_finding.start', {
      rootDir,
      env,
      target,
      requestedFinding,
      resolvedFinding: knowledge?.canonicalId,
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
        };
      }

      const explanation = knowledge
        ? {
            findingId: knowledge.canonicalId,
            requestedFindingId: requestedFinding,
            title: knowledge.title,
            severity: knowledge.severity,
            target: knowledge.target,
            explanation: knowledge.explanation,
            risk: knowledge.risk,
            remediation: knowledge.remediation,
            references: knowledge.references,
            notes:
              requestedFinding && requestedFinding !== knowledge.canonicalId
                ? [`Alias resolved: ${requestedFinding} -> ${knowledge.canonicalId}`]
                : [],
          }
        : {
            findingId: requestedFinding ?? 'unknown',
            requestedFindingId: requestedFinding,
            title: 'Unknown finding',
            severity: 'medium',
            target,
            explanation:
              'No deterministic knowledge entry was found for this finding. Provide the full PantherEyes finding ID (for example `mobile.ios.ats.arbitrary-loads-enabled`) for a better explanation.',
            risk: ['Review CLI scan JSON output to inspect exact finding fields and remediation text.'],
            remediation: ['Re-run `panthereyes scan --json ...` and use the exact finding `id` in the prompt.'],
            references: [],
            notes: ['LLM-backed explanation is not enabled in this deterministic planner.'],
          };

      const summary = knowledge
        ? `Explained finding ${explanation.findingId} (${explanation.severity}) for ${explanation.target}.`
        : `Could not map finding from prompt; returned generic guidance.`;

      const llmAugmentation = await maybeGenerateLlmAugmentation(context, {
        message: input.request.message,
        explanation,
      });

      return {
        result: {
          plannerId: 'explain_finding',
          deterministic: true,
          summary,
          changeSet: emptyChangeSet(summary),
          toolOutputs: {
            explanation,
            policyContext: previewSummary ?? null,
            llmAugmentation,
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
      plannerLogger.error('planner.explain_finding.error', { error: normalized.cause ?? error });
      throw normalized.cause ?? error;
    }
  },
};

async function maybeGenerateLlmAugmentation(
  context: PlannerContext,
  input: { message: string; explanation: { findingId: string; title: string; explanation: string; remediation: string[] } },
): Promise<{ provider: string; content: string } | null> {
  if (context.llm.provider === 'none') {
    return null;
  }

  try {
    const prompt = [
      'You are helping explain a security finding in PantherEyes.',
      `User request: ${input.message}`,
      `Finding ID: ${input.explanation.findingId}`,
      `Title: ${input.explanation.title}`,
      `Deterministic explanation: ${input.explanation.explanation}`,
      `Deterministic remediation hints: ${input.explanation.remediation.join(' | ')}`,
      'Return a concise developer-focused explanation with one remediation priority ordering.',
    ].join('\n');
    const content = await context.llm.generate(prompt);
    return { provider: context.llm.provider, content };
  } catch (error) {
    context.logger.warn('planner.explain_finding.llm_fallback_failed', {
      provider: context.llm.provider,
      error,
    });
    return null;
  }
}
