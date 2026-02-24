import type { AgentTarget, ChatRequest, ToolTrace } from '../types';
import type { Planner, PlannerContext, PlannerRunInput, PlannerRunOutput } from './types';

function inferEnv(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('prod') || normalized.includes('production')) {
    return 'prod';
  }
  if (normalized.includes('staging') || normalized.includes('stage')) {
    return 'staging';
  }
  if (normalized.includes('dev') || normalized.includes('development')) {
    return 'dev';
  }
  return 'dev';
}

function inferTarget(message: string): AgentTarget {
  const normalized = message.toLowerCase();
  if (normalized.includes('mobile') || normalized.includes('android') || normalized.includes('ios')) {
    return 'mobile';
  }
  return 'web';
}

function resolvePlannerInputs(request: ChatRequest): { env: string; target: AgentTarget; rootDir: string } {
  const env = request.context?.env?.trim() || inferEnv(request.message);
  const target = request.context?.target || inferTarget(request.message);
  const rootDir = request.context?.rootDir?.trim() || process.cwd();
  return { env, target, rootDir };
}

function normalizeToolError(error: unknown): { trace?: ToolTrace; cause?: unknown } {
  if (typeof error === 'object' && error !== null && 'trace' in error) {
    return error as { trace?: ToolTrace; cause?: unknown };
  }
  return { cause: error };
}

export const generatePolicyTestsPlanner: Planner = {
  id: 'generate_policy_tests',
  deterministic: true,

  async run(input: PlannerRunInput, context: PlannerContext): Promise<PlannerRunOutput> {
    const plannerLogger = context.logger.child({ plannerId: 'generate_policy_tests' });
    const traces: ToolTrace[] = [];
    const { env, target, rootDir } = resolvePlannerInputs(input.request);

    plannerLogger.info('planner.generate_policy_tests.start', {
      env,
      target,
      rootDir,
      intentConfidence: input.intent.confidence,
    });

    try {
      const validationRun = await context.tools.run(context.requestId, 'validate_security_config', { rootDir });
      traces.push(validationRun.trace);

      const previewRun = await context.tools.run(context.requestId, 'preview_effective_policy', {
        rootDir,
        env,
        target,
      });
      traces.push(previewRun.trace);

      const directivesRun = await context.tools.run(context.requestId, 'list_effective_directives', {
        rootDir,
        env,
        target,
      });
      traces.push(directivesRun.trace);

      const generateRun = await context.tools.run(context.requestId, 'generate_policy_tests', {
        rootDir,
        env,
        target,
        userMessage: input.request.message,
        validation: validationRun.output,
        preview: previewRun.output,
        directives: directivesRun.output,
      });
      traces.push(generateRun.trace);

      const result = {
        plannerId: 'generate_policy_tests' as const,
        deterministic: true as const,
        summary: generateRun.output.changeSet.summary,
        changeSet: generateRun.output.changeSet,
        toolOutputs: {
          validation: validationRun.output,
          preview: {
            env: previewRun.output.env,
            target: previewRun.output.target,
            mode: previewRun.output.mode,
            failOnSeverity: previewRun.output.failOnSeverity,
            ruleCount: previewRun.output.rules.length,
            directiveCount: previewRun.output.directiveList.length,
          },
          directives: directivesRun.output,
          generation: generateRun.output,
        },
        context: {
          env,
          target,
          rootDir,
        },
      };

      plannerLogger.info('planner.generate_policy_tests.success', {
        changeCount: result.changeSet.changes.length,
      });

      return { result, traces };
    } catch (error) {
      const normalized = normalizeToolError(error);
      if (normalized.trace) {
        traces.push(normalized.trace);
      }
      plannerLogger.error('planner.generate_policy_tests.error', { error: normalized.cause ?? error });
      throw normalized.cause ?? error;
    }
  },
};
