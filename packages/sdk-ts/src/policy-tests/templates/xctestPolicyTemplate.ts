import type { PolicyTestTemplateInput, RenderedPolicyTestFile } from '../types';
import {
  escapeSwiftString,
  normalizeDirectiveValue,
  sortDirectives,
  sortRules,
  toIdentifier,
  toPascalCase,
} from './helpers';

export function xctestPolicyTemplate(input: PolicyTestTemplateInput): RenderedPolicyTestFile {
  const env = input.effectivePolicy.env;
  const envPascal = toPascalCase(env);
  const className = `PantherEyesPolicy${envPascal}Tests`;
  const directives = sortDirectives(input.directives);
  const rules = sortRules(input.effectivePolicy.rules);
  const enabledRules = rules.filter((rule) => rule.enabled);

  const directiveLines = directives.map(
    (directive) =>
      `        XCTAssertEqual(directives[\"${escapeSwiftString(directive.key)}\"], \"${escapeSwiftString(normalizeDirectiveValue(directive.value))}\")`,
  );

  const ruleLines = enabledRules.slice(0, 12).map((rule) => {
    const fn = `testRule_${toIdentifier(rule.ruleId)}_isPresent`;
    return `    func ${fn}() {
        let rules = Set(policyRules.map(\\.ruleId))
        XCTAssertTrue(rules.contains(\"${escapeSwiftString(rule.ruleId)}\"))
    }`;
  });

  const policyRulesArray = rules
    .map(
      (rule) =>
        `        PolicyRule(ruleId: \"${escapeSwiftString(rule.ruleId)}\", enabled: ${rule.enabled ? 'true' : 'false'}, effectiveSeverity: \"${escapeSwiftString(rule.effectiveSeverity)}\")`,
    )
    .join(',\n');

  const directivesDictionary = directives
    .map(
      (directive) =>
        `        \"${escapeSwiftString(directive.key)}\": \"${escapeSwiftString(normalizeDirectiveValue(directive.value))}\"`,
    )
    .join(',\n');

  const content = `import XCTest

final class ${className}: XCTestCase {
    struct PolicyRule {
        let ruleId: String
        let enabled: Bool
        let effectiveSeverity: String
    }

    private let mode = \"${escapeSwiftString(input.effectivePolicy.mode)}\"
    private let failOnSeverity = \"${escapeSwiftString(input.effectivePolicy.failOnSeverity)}\"
    private let policyRules: [PolicyRule] = [
${policyRulesArray}
    ]
    private let directives: [String: String] = [
${directivesDictionary}
    ]

    func testPolicyMetadata_${toIdentifier(env)}() {
        XCTAssertEqual(mode, \"${escapeSwiftString(input.effectivePolicy.mode)}\")
        XCTAssertEqual(failOnSeverity, \"${escapeSwiftString(input.effectivePolicy.failOnSeverity)}\")
        XCTAssertGreaterThanOrEqual(policyRules.count, ${enabledRules.length})
    }

    func testDirectives_${toIdentifier(env)}() {
${directiveLines.length > 0 ? directiveLines.join('\n') : '        XCTAssertTrue(directives.isEmpty)'}
    }

${ruleLines.join('\n\n')}
}
`;

  return {
    path: `ios/Tests/PantherEyesPolicyTests/${className}.swift`,
    language: 'swift',
    content,
  };
}
