import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChangeSet, PolicyTestGeneratorInput, PolicyTestTarget, RenderedPolicyTestFile } from './types';
import { junitPolicyTemplate } from './templates/junitPolicyTemplate';
import { xctestPolicyTemplate } from './templates/xctestPolicyTemplate';

function resolveTemplate(target: PolicyTestTarget): (input: PolicyTestGeneratorInput) => RenderedPolicyTestFile {
  if (target === 'ios') {
    return (input) =>
      xctestPolicyTemplate({
        effectivePolicy: input.effectivePolicy,
        directives: input.directives,
        namespace: input.namespace,
      });
  }

  return (input) =>
    junitPolicyTemplate({
      effectivePolicy: input.effectivePolicy,
      directives: input.directives,
      namespace: input.namespace,
    });
}

function buildChangeSet(input: PolicyTestGeneratorInput, rendered: RenderedPolicyTestFile): ChangeSet {
  const relativePath = input.basePath ? path.posix.join(input.basePath, rendered.path) : rendered.path;

  return {
    dryRun: input.outputMode !== 'write',
    summary: `Generated 1 policy test file for ${input.effectivePolicy.target}/${input.effectivePolicy.env}`,
    changes: [
      {
        kind: 'create',
        path: relativePath,
        language: rendered.language,
        reason: 'Deterministic policy regression test generated from effective policy and directives.',
        content: rendered.content,
      },
    ],
  };
}

export class PolicyTestGenerator {
  async generate(input: PolicyTestGeneratorInput): Promise<ChangeSet> {
    const template = resolveTemplate(input.effectivePolicy.target);
    const rendered = template(input);
    const changeSet = buildChangeSet(input, rendered);

    if (input.outputMode === 'write') {
      if (!input.outputDir) {
        throw new Error('outputDir is required when outputMode is write');
      }

      const change = changeSet.changes[0];
      const absolutePath = path.join(input.outputDir, change.path);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, change.content, 'utf8');
    }

    return changeSet;
  }
}
