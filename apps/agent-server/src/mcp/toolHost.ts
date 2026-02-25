import * as cp from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PantherEyesCliAdapter } from '../adapters/cli';
import { NoopChatModelAdapter } from '../adapters/llm';
import { WorkspacePolicyConfigAdapter } from '../adapters/policyConfig';
import { PantherEyesSdkAdapter } from '../adapters/sdk';
import type { Logger } from '../logging';
import { AgentRuntime } from '../runtime';
import { ToolExecutor } from '../tools/executor';
import { ToolRegistry } from '../tools/registry';
import type { ToolOutputMap } from '../tools/types';
import { resolveFindingKnowledge } from '../planners/findingKnowledge';
import type { ToolName } from '../types';
import type { McpToolCallResult, McpToolDefinition } from './types';

type McpToolName =
  | 'panthereyes.validate_security_config'
  | 'panthereyes.preview_effective_policy'
  | 'panthereyes.list_effective_directives'
  | 'panthereyes.generate_policy_tests'
  | 'panthereyes.compare_policy_envs'
  | 'panthereyes.scan'
  | 'panthereyes.explain_finding'
  | 'panthereyes.suggest_remediation'
  | 'panthereyes.create_policy_exception';

interface McpToolCallParams {
  name: string;
  arguments?: unknown;
}

type AgentToolExecutorError = {
  trace?: {
    error?: {
      message?: string;
      code?: string;
    };
  };
  cause?: unknown;
};

export class PantherEyesMcpToolHost {
  private readonly toolExecutor: ToolExecutor;

  constructor(private readonly logger: Logger) {
    this.toolExecutor = new ToolExecutor(new ToolRegistry(), logger, {
      sdk: new PantherEyesSdkAdapter(),
      cli: new PantherEyesCliAdapter(),
      llm: new NoopChatModelAdapter(),
      policyConfig: new WorkspacePolicyConfigAdapter(),
    });
  }

  listTools(): McpToolDefinition[] {
    return [
      {
        name: 'panthereyes.validate_security_config',
        description: 'Validate .panthereyes policy/rules/exceptions files for a workspace root.',
        inputSchema: objectSchema(
          {
            rootDir: { type: 'string', description: 'Workspace root directory containing .panthereyes/' },
          },
          ['rootDir'],
        ),
      },
      {
        name: 'panthereyes.preview_effective_policy',
        description: 'Resolve the effective policy for an environment and target.',
        inputSchema: objectSchema(
          {
            rootDir: { type: 'string' },
            env: { type: 'string', description: 'Environment name (e.g., dev, staging, prod)' },
            target: { type: 'string', enum: ['web', 'mobile'] },
          },
          ['rootDir', 'env', 'target'],
        ),
      },
      {
        name: 'panthereyes.list_effective_directives',
        description: 'List effective directives (with provenance) for an environment and target.',
        inputSchema: objectSchema(
          {
            rootDir: { type: 'string' },
            env: { type: 'string' },
            target: { type: 'string', enum: ['web', 'mobile'] },
          },
          ['rootDir', 'env', 'target'],
        ),
      },
      {
        name: 'panthereyes.compare_policy_envs',
        description: 'Compare effective policy and directives between two environments for the same target.',
        inputSchema: objectSchema(
          {
            rootDir: { type: 'string' },
            target: { type: 'string', enum: ['web', 'mobile'] },
            baseEnv: { type: 'string', description: 'Reference environment (e.g., dev)' },
            compareEnv: { type: 'string', description: 'Environment to compare against (e.g., prod)' },
          },
          ['rootDir', 'target', 'baseEnv', 'compareEnv'],
        ),
      },
      {
        name: 'panthereyes.scan',
        description: 'Run PantherEyes CLI scan and return parsed JSON output (uses cargo run -p panthereyes-cli).',
        inputSchema: objectSchema(
          {
            rootDir: { type: 'string', description: 'Path to scan (sample/app root)' },
            target: { type: 'string', enum: ['web', 'mobile'] },
            phase: { type: 'string', enum: ['static', 'non-static'], default: 'static' },
          },
          ['rootDir', 'target'],
        ),
      },
      {
        name: 'panthereyes.generate_policy_tests',
        description: 'Generate a deterministic ChangeSet proposal for policy tests (dry-run, no file writes).',
        inputSchema: objectSchema(
          {
            rootDir: { type: 'string' },
            env: { type: 'string' },
            target: { type: 'string', enum: ['web', 'mobile'] },
            userMessage: {
              type: 'string',
              description: 'Optional user intent text used for planner/tool notes',
              default: 'Generate policy tests',
            },
          },
          ['rootDir', 'env', 'target'],
        ),
      },
      {
        name: 'panthereyes.explain_finding',
        description: 'Explain a PantherEyes finding (supports demo aliases like IOS-ATS-001 / AND-NET-001).',
        inputSchema: objectSchema(
          {
            findingId: { type: 'string', description: 'Finding ID or alias (e.g., IOS-ATS-001)' },
            rootDir: { type: 'string' },
            env: { type: 'string' },
            target: { type: 'string', enum: ['web', 'mobile'] },
          },
          ['findingId'],
        ),
      },
      {
        name: 'panthereyes.suggest_remediation',
        description: 'Return deterministic remediation guidance for a PantherEyes finding.',
        inputSchema: objectSchema(
          {
            findingId: { type: 'string', description: 'Finding ID or alias (e.g., AND-NET-001)' },
            rootDir: { type: 'string' },
            env: { type: 'string' },
            target: { type: 'string', enum: ['web', 'mobile'] },
            keepDevWarn: { type: 'boolean' },
            prodBlock: { type: 'boolean' },
          },
          ['findingId'],
        ),
      },
      {
        name: 'panthereyes.create_policy_exception',
        description: 'Generate a dry-run ChangeSet to add/update an exception in .panthereyes/exceptions.yaml.',
        inputSchema: objectSchema(
          {
            rootDir: { type: 'string' },
            env: { type: 'string' },
            target: { type: 'string', enum: ['web', 'mobile'] },
            findingId: { type: 'string', description: 'Finding ID or alias (e.g., IOS-ATS-001)' },
            owner: { type: 'string', description: 'Optional approver/owner hint' },
            reason: { type: 'string', description: 'Optional explicit reason text' },
          },
          ['rootDir', 'env', 'target', 'findingId'],
        ),
      },
    ];
  }

  async callTool(params: McpToolCallParams): Promise<McpToolCallResult> {
    const toolName = assertMcpToolName(params.name);
    const rawArgs = asRecord(params.arguments, 'tools/call.arguments');

    switch (toolName) {
      case 'panthereyes.validate_security_config': {
        const rootDir = readString(rawArgs, 'rootDir');
        const result = await this.runTool('validate_security_config', { rootDir });
        return jsonToolResult(result, `Validated PantherEyes security config in ${rootDir}.`);
      }

      case 'panthereyes.preview_effective_policy': {
        const rootDir = readString(rawArgs, 'rootDir');
        const env = readString(rawArgs, 'env');
        const target = readTarget(rawArgs, 'target');
        const result = await this.runTool('preview_effective_policy', { rootDir, env, target });
        return jsonToolResult(result, `Resolved effective policy for ${env}/${target}.`);
      }

      case 'panthereyes.list_effective_directives': {
        const rootDir = readString(rawArgs, 'rootDir');
        const env = readString(rawArgs, 'env');
        const target = readTarget(rawArgs, 'target');
        const result = await this.runTool('list_effective_directives', { rootDir, env, target });
        return jsonToolResult(result, `Listed effective directives for ${env}/${target}.`);
      }

      case 'panthereyes.generate_policy_tests': {
        const rootDir = readString(rawArgs, 'rootDir');
        const env = readString(rawArgs, 'env');
        const target = readTarget(rawArgs, 'target');
        const userMessage = readOptionalString(rawArgs, 'userMessage') ?? 'Generate policy tests';

        const validation = await this.runTool('validate_security_config', { rootDir });
        const preview = await this.runTool('preview_effective_policy', { rootDir, env, target });
        const directives = await this.runTool('list_effective_directives', { rootDir, env, target });
        const result = await this.runTool('generate_policy_tests', {
          rootDir,
          env,
          target,
          userMessage,
          validation,
          preview,
          directives,
        });

        return {
          content: [
            { type: 'text', text: result.changeSet.summary },
            { type: 'json', json: result },
          ],
          structuredContent: {
            validation,
            previewSummary: {
              mode: preview.mode,
              failOnSeverity: preview.failOnSeverity,
              ruleCount: preview.rules.length,
            },
            directivesCount: directives.length,
            ...result,
          },
        };
      }

      case 'panthereyes.compare_policy_envs': {
        const rootDir = readString(rawArgs, 'rootDir');
        const target = readTarget(rawArgs, 'target');
        const baseEnv = readString(rawArgs, 'baseEnv');
        const compareEnv = readString(rawArgs, 'compareEnv');

        const basePreview = await this.runTool('preview_effective_policy', { rootDir, env: baseEnv, target });
        const comparePreview = await this.runTool('preview_effective_policy', {
          rootDir,
          env: compareEnv,
          target,
        });
        const baseDirectives = await this.runTool('list_effective_directives', {
          rootDir,
          env: baseEnv,
          target,
        });
        const compareDirectives = await this.runTool('list_effective_directives', {
          rootDir,
          env: compareEnv,
          target,
        });

        const diff = comparePolicyEnvs({
          rootDir,
          target,
          baseEnv,
          compareEnv,
          basePreview,
          comparePreview,
          baseDirectives,
          compareDirectives,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Compared ${baseEnv} -> ${compareEnv} for ${target}. ${diff.summary.changesDetected ? 'Changes detected.' : 'No effective policy differences detected.'}`,
            },
            { type: 'json', json: diff },
          ],
          structuredContent: diff,
        };
      }

      case 'panthereyes.scan': {
        const rootDir = readString(rawArgs, 'rootDir');
        const target = readTarget(rawArgs, 'target');
        const phase = readPhase(rawArgs, 'phase');
        const scanResult = await runPantherEyesScanCli({
          cwd: process.cwd(),
          rootDir,
          target,
          phase,
        });
        const status =
          typeof scanResult === 'object' &&
          scanResult &&
          'summary' in scanResult &&
          typeof (scanResult as Record<string, unknown>).summary === 'object'
            ? ((scanResult as { summary?: { status?: string } }).summary?.status ?? 'unknown')
            : 'unknown';

        return {
          content: [
            { type: 'text', text: `PantherEyes scan (${phase}) for ${target} completed with status: ${status}` },
            { type: 'json', json: scanResult },
          ],
          structuredContent: scanResult,
        };
      }

      case 'panthereyes.explain_finding': {
        const findingId = readString(rawArgs, 'findingId');
        const knowledge = resolveFindingKnowledge(findingId);
        const rootDir = readOptionalString(rawArgs, 'rootDir');
        const env = readOptionalString(rawArgs, 'env');
        const target = readOptionalTarget(rawArgs, 'target');

        const policyContext =
          rootDir && env && target
            ? await this.runTool('preview_effective_policy', { rootDir, env, target })
                .then((preview) => ({
                  env: preview.env,
                  target: preview.target,
                  mode: preview.mode,
                  failOnSeverity: preview.failOnSeverity,
                }))
                .catch(() => null)
            : null;

        if (!knowledge) {
          const unknown = {
            findingId,
            known: false,
            explanation:
              'Unknown deterministic finding. Use the exact PantherEyes finding id from scan JSON, or rely on /chat intent for future LLM-backed support.',
            policyContext,
          };
          return {
            content: [
              { type: 'text', text: `No deterministic knowledge entry found for ${findingId}.` },
              { type: 'json', json: unknown },
            ],
            structuredContent: unknown,
          };
        }

        const result = {
          known: true,
          findingId: knowledge.canonicalId,
          requestedFindingId: findingId,
          title: knowledge.title,
          severity: knowledge.severity,
          target: knowledge.target,
          explanation: knowledge.explanation,
          risk: knowledge.risk,
          remediation: knowledge.remediation,
          references: knowledge.references,
          policyContext,
        };
        return {
          content: [
            { type: 'text', text: `Explained finding ${knowledge.canonicalId} (${knowledge.severity}).` },
            { type: 'json', json: result },
          ],
          structuredContent: result,
        };
      }

      case 'panthereyes.suggest_remediation': {
        const findingId = readString(rawArgs, 'findingId');
        const knowledge = resolveFindingKnowledge(findingId);
        const keepDevWarn = readOptionalBoolean(rawArgs, 'keepDevWarn') ?? false;
        const prodBlock = readOptionalBoolean(rawArgs, 'prodBlock') ?? false;
        const rootDir = readOptionalString(rawArgs, 'rootDir');
        const env = readOptionalString(rawArgs, 'env');
        const target = readOptionalTarget(rawArgs, 'target');

        const policyContext =
          rootDir && env && target
            ? await this.runTool('preview_effective_policy', { rootDir, env, target })
                .then((preview) => ({
                  env: preview.env,
                  target: preview.target,
                  mode: preview.mode,
                  failOnSeverity: preview.failOnSeverity,
                }))
                .catch(() => null)
            : null;

        const result = knowledge
          ? {
              known: true,
              findingId: knowledge.canonicalId,
              requestedFindingId: findingId,
              title: knowledge.title,
              remediationSteps: knowledge.remediation,
              policyGuidance: [
                keepDevWarn
                  ? 'Keep dev in warn/audit while the remediation is rolled out and validated.'
                  : 'Validate whether dev should remain warn/audit during remediation rollout.',
                prodBlock
                  ? 'Keep or move prod to block for this severity once remediation is available.'
                  : 'Confirm prod enforcement threshold blocks this finding severity when required.',
              ],
              references: knowledge.references,
              policyContext,
            }
          : {
              known: false,
              findingId,
              remediationSteps: [
                'Use the exact finding id from PantherEyes scan JSON output.',
                'Provide rootDir/env/target to receive policy-aware remediation context.',
              ],
              policyGuidance: ['Deterministic remediation guidance is currently available for seeded demo findings only.'],
              references: [],
              policyContext,
            };

        return {
          content: [
            {
              type: 'text',
              text: result.known
                ? `Suggested remediation for ${result.findingId}.`
                : `No deterministic remediation template found for ${findingId}.`,
            },
            { type: 'json', json: result },
          ],
          structuredContent: result,
        };
      }

      case 'panthereyes.create_policy_exception': {
        const rootDir = readString(rawArgs, 'rootDir');
        const env = readString(rawArgs, 'env');
        const target = readTarget(rawArgs, 'target');
        const findingId = readString(rawArgs, 'findingId');
        const owner = readOptionalString(rawArgs, 'owner');
        const reason = readOptionalString(rawArgs, 'reason');
        const message = [
          'Create policy exception',
          `for ${findingId}`,
          owner ? `owner ${owner}` : '',
          reason ? `reason ${reason}` : '',
        ]
          .filter(Boolean)
          .join(' ');

        const runtime = new AgentRuntime(this.logger.child({ component: 'mcp.runtimeBridge' }));
        const response = await runtime.handleChat({
          message,
          intent: 'create_policy_exception',
          context: { rootDir, env, target },
        });

        return {
          content: [
            { type: 'text', text: response.planner.summary },
            { type: 'json', json: response.planner },
          ],
          structuredContent: {
            intent: response.intent,
            planner: response.planner,
            tools: response.tools,
          },
        };
      }
    }
  }

  private async runTool<TName extends ToolName>(
    name: TName,
    input: Parameters<ToolExecutor['run']>[2],
  ): Promise<ToolOutputMap[TName]> {
    const requestId = `mcp-${randomUUID()}`;
    try {
      const result = await this.toolExecutor.run(requestId, name, input as never);
      return result.output as ToolOutputMap[TName];
    } catch (error) {
      const failure = error as AgentToolExecutorError;
      const message =
        failure?.trace?.error?.message ??
        (failure?.cause instanceof Error ? failure.cause.message : 'Tool execution failed');
      const code = failure?.trace?.error?.code ?? 'tool_execution_error';
      throw new Error(`${code}: ${message}`);
    }
  }
}

function objectSchema(properties: Record<string, unknown>, required: string[]): McpToolDefinition['inputSchema'] {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

function assertMcpToolName(name: string): McpToolName {
  const allowed = new Set<McpToolName>([
    'panthereyes.validate_security_config',
    'panthereyes.preview_effective_policy',
      'panthereyes.list_effective_directives',
      'panthereyes.generate_policy_tests',
      'panthereyes.compare_policy_envs',
      'panthereyes.scan',
      'panthereyes.explain_finding',
      'panthereyes.suggest_remediation',
      'panthereyes.create_policy_exception',
    ]);
  if (!allowed.has(name as McpToolName)) {
    throw new Error(`Unknown MCP tool: ${name}`);
  }
  return name as McpToolName;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected object`);
  }
  return value as Record<string, unknown>;
}

function readString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid tools/call argument '${field}': expected non-empty string`);
  }
  return value.trim();
}

function readOptionalString(source: Record<string, unknown>, field: string): string | undefined {
  const value = source[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Invalid tools/call argument '${field}': expected string`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readTarget(source: Record<string, unknown>, field: string): 'web' | 'mobile' {
  const value = readString(source, field);
  if (value !== 'web' && value !== 'mobile') {
    throw new Error(`Invalid tools/call argument '${field}': expected 'web' or 'mobile'`);
  }
  return value;
}

function readOptionalTarget(
  source: Record<string, unknown>,
  field: string,
): 'web' | 'mobile' | undefined {
  const value = readOptionalString(source, field);
  if (value === undefined) {
    return undefined;
  }
  if (value !== 'web' && value !== 'mobile') {
    throw new Error(`Invalid tools/call argument '${field}': expected 'web' or 'mobile'`);
  }
  return value;
}

function readOptionalBoolean(source: Record<string, unknown>, field: string): boolean | undefined {
  const value = source[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid tools/call argument '${field}': expected boolean`);
  }
  return value;
}

function readPhase(source: Record<string, unknown>, field: string): 'static' | 'non-static' {
  const raw = readOptionalString(source, field) ?? 'static';
  if (raw !== 'static' && raw !== 'non-static') {
    throw new Error(`Invalid tools/call argument '${field}': expected 'static' or 'non-static'`);
  }
  return raw;
}

function jsonToolResult(result: unknown, message: string): McpToolCallResult {
  return {
    content: [
      { type: 'text', text: message },
      { type: 'json', json: result },
    ],
    structuredContent: result,
  };
}

type ComparePolicyEnvInput = {
  rootDir: string;
  target: 'web' | 'mobile';
  baseEnv: string;
  compareEnv: string;
  basePreview: ToolOutputMap['preview_effective_policy'];
  comparePreview: ToolOutputMap['preview_effective_policy'];
  baseDirectives: ToolOutputMap['list_effective_directives'];
  compareDirectives: ToolOutputMap['list_effective_directives'];
};

function comparePolicyEnvs(input: ComparePolicyEnvInput) {
  const baseDirectiveMap = new Map(input.baseDirectives.map((d) => [d.key, d]));
  const compareDirectiveMap = new Map(input.compareDirectives.map((d) => [d.key, d]));
  const directiveKeys = new Set([...baseDirectiveMap.keys(), ...compareDirectiveMap.keys()]);

  const directiveDiffs = [...directiveKeys]
    .sort()
    .map((key) => {
      const base = baseDirectiveMap.get(key);
      const next = compareDirectiveMap.get(key);
      if (!base && next) {
        return { key, kind: 'added' as const, compare: { value: next.value, source: next.source } };
      }
      if (base && !next) {
        return { key, kind: 'removed' as const, base: { value: base.value, source: base.source } };
      }
      if (base && next) {
        const sameValue = JSON.stringify(base.value) === JSON.stringify(next.value);
        const sameSource = base.source === next.source;
        if (!sameValue || !sameSource) {
          return {
            key,
            kind: 'changed' as const,
            base: { value: base.value, source: base.source },
            compare: { value: next.value, source: next.source },
          };
        }
      }
      return null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const baseRuleMap = new Map(input.basePreview.rules.map((rule) => [rule.ruleId, rule]));
  const compareRuleMap = new Map(input.comparePreview.rules.map((rule) => [rule.ruleId, rule]));
  const ruleIds = new Set([...baseRuleMap.keys(), ...compareRuleMap.keys()]);
  const ruleDiffs = [...ruleIds]
    .sort()
    .map((ruleId) => {
      const base = baseRuleMap.get(ruleId);
      const next = compareRuleMap.get(ruleId);
      if (!base && next) {
        return { ruleId, kind: 'added' as const, compare: summarizeRule(next) };
      }
      if (base && !next) {
        return { ruleId, kind: 'removed' as const, base: summarizeRule(base) };
      }
      if (base && next) {
        const changed =
          base.enabled !== next.enabled ||
          base.effectiveSeverity !== next.effectiveSeverity ||
          base.hasActiveException !== next.hasActiveException;
        if (changed) {
          return {
            ruleId,
            kind: 'changed' as const,
            base: summarizeRule(base),
            compare: summarizeRule(next),
          };
        }
      }
      return null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const changesDetected =
    input.basePreview.mode !== input.comparePreview.mode ||
    input.basePreview.failOnSeverity !== input.comparePreview.failOnSeverity ||
    directiveDiffs.length > 0 ||
    ruleDiffs.length > 0;

  return {
    rootDir: input.rootDir,
    target: input.target,
    environments: {
      base: input.baseEnv,
      compare: input.compareEnv,
    },
    summary: {
      changesDetected,
      modeChanged: input.basePreview.mode !== input.comparePreview.mode,
      failOnSeverityChanged:
        input.basePreview.failOnSeverity !== input.comparePreview.failOnSeverity,
      directiveDiffCount: directiveDiffs.length,
      ruleDiffCount: ruleDiffs.length,
    },
    base: {
      mode: input.basePreview.mode,
      failOnSeverity: input.basePreview.failOnSeverity,
      ruleCount: input.basePreview.rules.length,
      directivesCount: input.baseDirectives.length,
    },
    compare: {
      mode: input.comparePreview.mode,
      failOnSeverity: input.comparePreview.failOnSeverity,
      ruleCount: input.comparePreview.rules.length,
      directivesCount: input.compareDirectives.length,
    },
    directiveDiffs,
    ruleDiffs,
  };
}

function summarizeRule(rule: {
  enabled: boolean;
  effectiveSeverity: string;
  hasActiveException: boolean;
  defaultSeverity?: string;
  allowException?: boolean;
}) {
  return {
    enabled: rule.enabled,
    effectiveSeverity: rule.effectiveSeverity,
    hasActiveException: rule.hasActiveException,
    defaultSeverity: rule.defaultSeverity,
    allowException: rule.allowException,
  };
}

async function runPantherEyesScanCli(input: {
  cwd: string;
  rootDir: string;
  target: 'web' | 'mobile';
  phase: 'static' | 'non-static';
}): Promise<unknown> {
  const args = [
    'run',
    '-p',
    'panthereyes-cli',
    '--',
    '--json',
    'scan',
    '--phase',
    input.phase,
    '--target',
    input.target,
    input.rootDir,
  ];

  const { stdout, stderr, exitCode } = await spawnAndCollect('cargo', args, input.cwd);
  if (exitCode !== 0) {
    throw new Error(
      `panthereyes.scan failed (cargo exit ${exitCode}). stderr: ${stderr.trim() || '<empty>'}`,
    );
  }

  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `panthereyes.scan returned invalid JSON: ${(error as Error).message}. stdout: ${stdout.slice(0, 500)}`,
    );
  }
}

async function spawnAndCollect(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      reject(
        new Error(
          `Failed to spawn '${command}'. Ensure it is installed and available in PATH. ${error.message}`,
        ),
      );
    });
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}
