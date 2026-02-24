import type { EffectiveDirective, EffectivePolicyPreview } from '@panthereyes/policy-engine';
import type { ChangeSet, ToolName, ToolTrace } from '../types';
import type { Logger } from '../logging';
import type { CliAdapter } from '../adapters/cli';
import type { ChatModelAdapter } from '../adapters/llm';
import type { PolicyConfigAdapter, SecurityConfigValidation } from '../adapters/policyConfig';
import type { SdkAdapter } from '../adapters/sdk';

export interface AgentAdapters {
  sdk: SdkAdapter;
  cli: CliAdapter;
  llm: ChatModelAdapter;
  policyConfig: PolicyConfigAdapter;
}

export interface ToolExecutionContext {
  requestId: string;
  logger: Logger;
  adapters: AgentAdapters;
}

export interface ToolInputMap {
  validate_security_config: {
    rootDir: string;
  };
  preview_effective_policy: {
    rootDir: string;
    env: string;
    target: 'web' | 'mobile';
  };
  list_effective_directives: {
    rootDir: string;
    env: string;
    target: 'web' | 'mobile';
  };
  generate_policy_tests: {
    rootDir: string;
    env: string;
    target: 'web' | 'mobile';
    userMessage: string;
    validation: SecurityConfigValidation;
    preview: EffectivePolicyPreview;
    directives: EffectiveDirective[];
  };
}

export interface ToolOutputMap {
  validate_security_config: SecurityConfigValidation;
  preview_effective_policy: EffectivePolicyPreview;
  list_effective_directives: EffectiveDirective[];
  generate_policy_tests: {
    changeSet: ChangeSet;
    notes: string[];
  };
}

export interface ToolDefinition<TName extends ToolName = ToolName> {
  name: TName;
  description: string;
  execute: (
    input: ToolInputMap[TName],
    context: ToolExecutionContext,
  ) => Promise<ToolOutputMap[TName]> | ToolOutputMap[TName];
}

export interface ToolExecutionResult<TName extends ToolName = ToolName> {
  output: ToolOutputMap[TName];
  trace: ToolTrace;
}
