import type { DirectiveValue, PolicyDirectiveInput, PolicyRuleInput } from '../types';

export function sortDirectives(input: PolicyDirectiveInput[]): PolicyDirectiveInput[] {
  return [...input].sort((a, b) => a.key.localeCompare(b.key));
}

export function sortRules(input: PolicyRuleInput[]): PolicyRuleInput[] {
  return [...input].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

export function toPascalCase(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

export function toIdentifier(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : 'value';
}

export function normalizeDirectiveValue(value: DirectiveValue): string {
  return JSON.stringify(value);
}

export function escapeSwiftString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function escapeJavaString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
