import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Change } from '../types';
import type { Planner, PlannerContext, PlannerRunInput, PlannerRunOutput } from './types';
import { normalizeToolError, resolvePlannerInputs } from './common';
import { extractFindingIdFromMessage, resolveFindingKnowledge } from './findingKnowledge';
import type { ToolTrace } from '../types';

function sanitizeIdPart(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function inferOwner(message: string): string {
  const lowered = message.toLowerCase();
  if (lowered.includes('security-team') || lowered.includes('security team')) {
    return 'security-team';
  }
  if (lowered.includes('mobile-team') || lowered.includes('mobile team')) {
    return 'mobile-team';
  }
  return 'security-team';
}

function inferReason(message: string, fallbackFinding: string): string {
  const normalized = message.trim();
  if (normalized.length > 0) {
    return `Temporary exception requested via agent for ${fallbackFinding}: ${normalized}`.slice(0, 240);
  }
  return `Temporary exception requested via agent for ${fallbackFinding}`;
}

function buildExceptionEntryYaml(input: {
  exceptionId: string;
  ruleId: string;
  env: string;
  target: 'web' | 'mobile';
  owner: string;
  reason: string;
  expiresOn: string;
}): string {
  const escapedReason = input.reason.replace(/"/g, "'");
  return `  - exceptionId: ${input.exceptionId}
    ruleId: ${input.ruleId}
    environments: [${input.env}]
    targets: [${input.target}]
    reason: "${escapedReason}"
    approvedBy: ${input.owner}
    expiresOn: ${input.expiresOn}
`;
}

function buildUpdatedExceptionsYaml(existingContent: string | null, entryYaml: string): { kind: Change['kind']; content: string } {
  if (!existingContent) {
    return {
      kind: 'create',
      content: `version: 1\nexceptions:\n${entryYaml}`,
    };
  }

  const trimmed = existingContent.trimEnd();
  if (/^version:\s*\d+/m.test(trimmed) && /^exceptions:\s*$/m.test(trimmed)) {
    return {
      kind: 'update',
      content: `${trimmed}\n${entryYaml}`,
    };
  }

  if (/^version:\s*\d+/m.test(trimmed) && !/^exceptions:\s*$/m.test(trimmed)) {
    return {
      kind: 'update',
      content: `${trimmed}\nexceptions:\n${entryYaml}`,
    };
  }

  return {
    kind: 'update',
    content: `version: 1\nexceptions:\n${entryYaml}`,
  };
}

export const createPolicyExceptionPlanner: Planner = {
  id: 'create_policy_exception',
  deterministic: true,

  async run(input: PlannerRunInput, context: PlannerContext): Promise<PlannerRunOutput> {
    const plannerLogger = context.logger.child({ plannerId: 'create_policy_exception' });
    const traces: ToolTrace[] = [];
    const { env, target, rootDir } = resolvePlannerInputs(input.request);
    const requestedFinding = extractFindingIdFromMessage(input.request.message);
    const knowledge = resolveFindingKnowledge(requestedFinding);
    const ruleId = knowledge?.canonicalId ?? requestedFinding ?? `${target}.unknown.finding`;
    const owner = inferOwner(input.request.message);
    const reason = inferReason(input.request.message, ruleId);
    const exceptionId = `EXC-${sanitizeIdPart(ruleId)}-${sanitizeIdPart(env)}`;
    const expiresOn = '2099-12-31';
    const exceptionsPath = path.join(rootDir, '.panthereyes', 'exceptions.yaml');

    plannerLogger.info('planner.create_policy_exception.start', {
      rootDir,
      env,
      target,
      ruleId,
      exceptionId,
    });

    try {
      const validationRun = await context.tools.run(context.requestId, 'validate_security_config', { rootDir });
      traces.push(validationRun.trace);

      const existingContent = existsSync(exceptionsPath) ? readFileSync(exceptionsPath, 'utf8') : null;
      const entryYaml = buildExceptionEntryYaml({
        exceptionId,
        ruleId,
        env,
        target,
        owner,
        reason,
        expiresOn,
      });
      const updated = buildUpdatedExceptionsYaml(existingContent, entryYaml);

      const changeSet = {
        dryRun: true as const,
        summary: `Proposed 1 exception change for ${ruleId} in ${env}/${target}`,
        changes: [
          {
            kind: updated.kind,
            path: '.panthereyes/exceptions.yaml',
            language: 'yaml',
            reason: `Add proposed exception ${exceptionId} for ${ruleId} (${env}/${target}).`,
            content: updated.content,
          },
        ],
      };

      let previewRun: Awaited<ReturnType<typeof context.tools.run<'preview_effective_policy'>>> | null = null;
      if (input.request.context?.rootDir) {
        try {
          previewRun = await context.tools.run(context.requestId, 'preview_effective_policy', { rootDir, env, target });
          traces.push(previewRun.trace);
        } catch {
          previewRun = null;
        }
      }

      const summary = `Proposed policy exception ${exceptionId} for ${ruleId} (${env}/${target}) as dry-run ChangeSet.`;
      return {
        result: {
          plannerId: 'create_policy_exception',
          deterministic: true,
          summary,
          changeSet,
          toolOutputs: {
            validation: validationRun.output,
            proposedException: {
              exceptionId,
              ruleId,
              environments: [env],
              targets: [target],
              approvedBy: owner,
              reason,
              expiresOn,
            },
            policyContext: previewRun?.output
              ? {
                  mode: previewRun.output.mode,
                  failOnSeverity: previewRun.output.failOnSeverity,
                  env: previewRun.output.env,
                  target: previewRun.output.target,
                }
              : null,
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
      plannerLogger.error('planner.create_policy_exception.error', { error: normalized.cause ?? error });
      throw normalized.cause ?? error;
    }
  },
};
