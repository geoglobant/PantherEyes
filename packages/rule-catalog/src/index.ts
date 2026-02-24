import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';

export const severitySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type Severity = z.infer<typeof severitySchema>;

export const targetSchema = z.enum(['web', 'mobile']);
export type RuleTarget = z.infer<typeof targetSchema>;

export const ruleMetadataSchema = z.object({
  ruleId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  defaultSeverity: severitySchema,
  remediation: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  allowException: z.boolean().default(false),
  targets: z.array(targetSchema).default(['web', 'mobile']),
});

export type RuleMetadata = z.infer<typeof ruleMetadataSchema>;

export const rulesFileSchema = z.object({
  version: z.number().int().positive().default(1),
  rules: z.array(ruleMetadataSchema),
});

export type RulesFile = z.infer<typeof rulesFileSchema>;

export const exceptionSchema = z.object({
  exceptionId: z.string().min(1),
  ruleId: z.string().min(1),
  environments: z.array(z.string().min(1)).min(1),
  targets: z.array(targetSchema).min(1),
  reason: z.string().min(1),
  approvedBy: z.string().min(1),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scope: z
    .object({
      paths: z.array(z.string().min(1)).optional(),
      services: z.array(z.string().min(1)).optional(),
    })
    .optional(),
});

export type RuleException = z.infer<typeof exceptionSchema>;

export const exceptionsFileSchema = z.object({
  version: z.number().int().positive().default(1),
  exceptions: z.array(exceptionSchema),
});

export type ExceptionsFile = z.infer<typeof exceptionsFileSchema>;

export interface LoadCatalogOptions {
  rootDir?: string;
}

export class RuleCatalogSchemaError extends Error {
  constructor(public readonly filePath: string, message: string) {
    super(`Invalid rule catalog schema in ${filePath}: ${message}`);
    this.name = 'RuleCatalogSchemaError';
  }
}

export class RuleCatalogIoError extends Error {
  constructor(public readonly filePath: string, cause: unknown) {
    super(`Failed to read rule catalog file ${filePath}`);
    this.name = 'RuleCatalogIoError';
    this.cause = cause;
  }

  declare cause: unknown;
}

export class ExceptionsSchemaError extends Error {
  constructor(public readonly filePath: string, message: string) {
    super(`Invalid exceptions schema in ${filePath}: ${message}`);
    this.name = 'ExceptionsSchemaError';
  }
}

export class ExceptionsIoError extends Error {
  constructor(public readonly filePath: string, cause: unknown) {
    super(`Failed to read exceptions file ${filePath}`);
    this.name = 'ExceptionsIoError';
    this.cause = cause;
  }

  declare cause: unknown;
}

export function pantherEyesConfigFile(rootDir: string, fileName: string): string {
  return path.join(rootDir, '.panthereyes', fileName);
}

export function parseRulesYaml(rawYaml: string, filePath = '.panthereyes/rules.yaml'): RulesFile {
  const parsed = YAML.parse(rawYaml);
  const result = rulesFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new RuleCatalogSchemaError(filePath, result.error.message);
  }
  return result.data;
}

export function parseExceptionsYaml(
  rawYaml: string,
  filePath = '.panthereyes/exceptions.yaml',
): ExceptionsFile {
  const parsed = YAML.parse(rawYaml);
  const result = exceptionsFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new ExceptionsSchemaError(filePath, result.error.message);
  }
  return result.data;
}

export function loadRuleCatalog(options: LoadCatalogOptions = {}): RulesFile {
  const rootDir = options.rootDir ?? process.cwd();
  const filePath = pantherEyesConfigFile(rootDir, 'rules.yaml');
  let rawYaml: string;

  try {
    rawYaml = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new RuleCatalogIoError(filePath, error);
  }

  return parseRulesYaml(rawYaml, filePath);
}

export function loadExceptions(options: LoadCatalogOptions = {}): ExceptionsFile {
  const rootDir = options.rootDir ?? process.cwd();
  const filePath = pantherEyesConfigFile(rootDir, 'exceptions.yaml');
  let rawYaml: string;

  try {
    rawYaml = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new ExceptionsIoError(filePath, error);
  }

  return parseExceptionsYaml(rawYaml, filePath);
}

export interface RuleDefinition {
  id: string;
  title: string;
  severity: Severity;
  description: string;
  targets: RuleTarget[];
}

export const defaultRuleCatalog: RulesFile = {
  version: 1,
  rules: [
    {
      ruleId: 'web.csp.required',
      title: 'Content-Security-Policy obrigatoria',
      description: 'Aplicacoes web devem configurar CSP para reduzir risco de XSS.',
      defaultSeverity: 'high',
      remediation: 'Defina o header Content-Security-Policy com directives restritivas.',
      tags: ['web', 'headers', 'xss'],
      allowException: true,
      targets: ['web'],
    },
    {
      ruleId: 'mobile.debug.disabled',
      title: 'Build de producao sem debug',
      description: 'Builds mobile de producao nao devem expor debugging habilitado.',
      defaultSeverity: 'medium',
      remediation: 'Garanta flags de build/release sem debugging e sem debuggable=true.',
      tags: ['mobile', 'release-hardening'],
      allowException: false,
      targets: ['mobile'],
    },
  ],
};

export const defaultRules: RuleDefinition[] = defaultRuleCatalog.rules.map((rule) => ({
  id: rule.ruleId,
  title: rule.title,
  severity: rule.defaultSeverity,
  description: rule.description,
  targets: rule.targets,
}));
