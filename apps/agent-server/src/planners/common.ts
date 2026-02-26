import type { AgentTarget, ChangeSet, ChatRequest, ToolTrace } from '../types';

export function inferEnv(message: string): string {
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

export function inferTarget(message: string): AgentTarget {
  const normalized = message.toLowerCase();
  if (normalized.includes('mobile') || normalized.includes('android') || normalized.includes('ios')) {
    return 'mobile';
  }
  return 'web';
}

export function resolvePlannerInputs(request: ChatRequest): { env: string; target: AgentTarget; rootDir: string } {
  const env = request.context?.env?.trim() || inferEnv(request.message);
  const target = request.context?.target || inferTarget(request.message);
  const rootDir = request.context?.rootDir?.trim() || process.cwd();
  return { env, target, rootDir };
}

export function inferEnvironmentPair(message: string, requestedEnv?: string): { baseEnv: string; compareEnv: string } {
  const normalized = message.toLowerCase();
  const found = Array.from(normalized.matchAll(/\b(dev|staging|prod)\b/g)).map((match) => match[1]);
  const unique = [...new Set(found)];

  if (unique.length >= 2) {
    return { baseEnv: unique[0], compareEnv: unique[1] };
  }

  if (requestedEnv) {
    return { baseEnv: requestedEnv === 'dev' ? 'staging' : 'dev', compareEnv: requestedEnv };
  }

  if (normalized.includes('prod')) {
    return { baseEnv: 'dev', compareEnv: 'prod' };
  }

  if (normalized.includes('staging')) {
    return { baseEnv: 'dev', compareEnv: 'staging' };
  }

  return { baseEnv: 'dev', compareEnv: 'prod' };
}

export function normalizeToolError(error: unknown): { trace?: ToolTrace; cause?: unknown } {
  if (typeof error === 'object' && error !== null && 'trace' in error) {
    return error as { trace?: ToolTrace; cause?: unknown };
  }
  return { cause: error };
}

export function emptyChangeSet(summary: string): ChangeSet {
  return {
    dryRun: true,
    summary,
    changes: [],
  };
}

