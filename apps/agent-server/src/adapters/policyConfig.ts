import {
  listEffectiveDirectives,
  loadPolicyFile,
  previewEffectivePolicy,
  type EffectiveDirective,
  type EffectivePolicyPreview,
} from '@panthereyes/policy-engine';
import { loadExceptions, loadRuleCatalog } from '@panthereyes/rule-catalog';
import type { AgentTarget } from '../types';

export interface SecurityConfigValidation {
  valid: boolean;
  rootDir: string;
  files: {
    policy: string;
    rules: string;
    exceptions: string;
  };
  counts: {
    environments: number;
    rules: number;
    exceptions: number;
  };
  warnings: string[];
}

export interface PolicyConfigAdapter {
  validateSecurityConfig(rootDir: string): SecurityConfigValidation;
  previewEffectivePolicy(rootDir: string, env: string, target: AgentTarget): EffectivePolicyPreview;
  listEffectiveDirectives(rootDir: string, env: string, target: AgentTarget): EffectiveDirective[];
}

export class WorkspacePolicyConfigAdapter implements PolicyConfigAdapter {
  validateSecurityConfig(rootDir: string): SecurityConfigValidation {
    const policy = loadPolicyFile({ rootDir });
    const rules = loadRuleCatalog({ rootDir });
    const exceptions = loadExceptions({ rootDir });
    const warnings: string[] = [];

    if (Object.keys(policy.data.envs).length === 0) {
      warnings.push('No environments defined in .panthereyes/policy.yaml');
    }

    if (rules.rules.length === 0) {
      warnings.push('Rule catalog is empty');
    }

    return {
      valid: true,
      rootDir,
      files: {
        policy: policy.filePath,
        rules: `${rootDir}/.panthereyes/rules.yaml`,
        exceptions: `${rootDir}/.panthereyes/exceptions.yaml`,
      },
      counts: {
        environments: Object.keys(policy.data.envs).length,
        rules: rules.rules.length,
        exceptions: exceptions.exceptions.length,
      },
      warnings,
    };
  }

  previewEffectivePolicy(rootDir: string, env: string, target: AgentTarget): EffectivePolicyPreview {
    return previewEffectivePolicy(env, target, { rootDir });
  }

  listEffectiveDirectives(rootDir: string, env: string, target: AgentTarget): EffectiveDirective[] {
    return listEffectiveDirectives(env, target, { rootDir });
  }
}
