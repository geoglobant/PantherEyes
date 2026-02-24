import type { PolicyTestTemplateInput, RenderedPolicyTestFile } from '../types';
import {
  escapeJavaString,
  normalizeDirectiveValue,
  sortDirectives,
  sortRules,
  toIdentifier,
  toPascalCase,
} from './helpers';

export function junitPolicyTemplate(input: PolicyTestTemplateInput): RenderedPolicyTestFile {
  const env = input.effectivePolicy.env;
  const envPascal = toPascalCase(env);
  const className = `PantherEyesPolicy${envPascal}Test`;
  const packageName = input.namespace ?? 'com.panthereyes.policy';
  const directives = sortDirectives(input.directives);
  const rules = sortRules(input.effectivePolicy.rules);
  const enabledRules = rules.filter((rule) => rule.enabled);

  const directiveAssertions = directives.map(
    (directive) =>
      `        assertEquals(\"${escapeJavaString(normalizeDirectiveValue(directive.value))}\", directives.get(\"${escapeJavaString(directive.key)}\"));`,
  );

  const ruleAssertions = enabledRules.slice(0, 12).map((rule) => {
    const method = `testRule_${toIdentifier(rule.ruleId)}_isPresent`;
    return `    @Test
    public void ${method}() {
        assertTrue(ruleIds.contains(\"${escapeJavaString(rule.ruleId)}\"));
    }`;
  });

  const ruleInit = rules
    .map(
      (rule) =>
        `        ruleIds.add(\"${escapeJavaString(rule.ruleId)}\"); // enabled=${rule.enabled}, severity=${escapeJavaString(rule.effectiveSeverity)}`,
    )
    .join('\n');

  const directiveInit = directives
    .map(
      (directive) =>
        `        directives.put(\"${escapeJavaString(directive.key)}\", \"${escapeJavaString(normalizeDirectiveValue(directive.value))}\");`,
    )
    .join('\n');

  const content = `package ${packageName};

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;

public final class ${className} {
    private final List<String> ruleIds = new ArrayList<>();
    private final Map<String, String> directives = new HashMap<>();
    private final String mode = \"${escapeJavaString(input.effectivePolicy.mode)}\";
    private final String failOnSeverity = \"${escapeJavaString(input.effectivePolicy.failOnSeverity)}\";

    @Before
    public void setUp() {
${ruleInit || '        // No rules'}
${directiveInit || '        // No directives'}
    }

    @Test
    public void testPolicyMetadata_${toIdentifier(env)}() {
        assertEquals(\"${escapeJavaString(input.effectivePolicy.mode)}\", mode);
        assertEquals(\"${escapeJavaString(input.effectivePolicy.failOnSeverity)}\", failOnSeverity);
        assertTrue(ruleIds.size() >= ${enabledRules.length});
    }

    @Test
    public void testDirectives_${toIdentifier(env)}() {
${directiveAssertions.length > 0 ? directiveAssertions.join('\n') : '        assertTrue(directives.isEmpty());'}
    }

${ruleAssertions.join('\n\n')}
}
`;

  return {
    path: `android/app/src/test/java/${packageName.replace(/\./g, '/')}/${className}.java`,
    language: 'java',
    content,
  };
}
