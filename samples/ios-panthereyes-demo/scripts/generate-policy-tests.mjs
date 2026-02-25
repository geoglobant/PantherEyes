import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(__dirname, '../../..');
const { previewEffectivePolicy, listEffectiveDirectives } = await import(
  pathToFileURL(path.join(repoRoot, 'packages/policy-engine/dist/index.js'))
);
const { PolicyTestGenerator } = await import(pathToFileURL(path.join(repoRoot, 'packages/sdk-ts/dist/index.js')));
const outputMode = process.argv.includes('--write') ? 'write' : 'changeset';
const envArg = process.argv.find((arg) => arg.startsWith('--env='));
const envs = envArg ? [envArg.split('=')[1]] : ['dev', 'staging', 'prod'];

const generator = new PolicyTestGenerator();
const all = [];

for (const env of envs) {
  const preview = previewEffectivePolicy(env, 'mobile', { rootDir: sampleRoot });
  const directives = listEffectiveDirectives(env, 'mobile', { rootDir: sampleRoot });

  const changeSet = await generator.generate({
    effectivePolicy: {
      env,
      target: 'ios',
      mode: preview.mode,
      failOnSeverity: preview.failOnSeverity,
      rules: preview.rules.map((rule) => ({
        ruleId: rule.ruleId,
        enabled: rule.enabled,
        effectiveSeverity: rule.effectiveSeverity,
        defaultSeverity: rule.defaultSeverity,
        hasActiveException: rule.hasActiveException,
        allowException: rule.allowException,
      })),
    },
    directives: directives.map((d) => ({ key: d.key, value: d.value, source: d.source })),
    outputMode,
    outputDir: sampleRoot,
  });

  all.push({ env, changeSet });
}

if (outputMode === 'changeset') {
  console.log(JSON.stringify(all, null, 2));
} else {
  const outDir = path.join(sampleRoot, 'artifacts');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'ios-policy-test-changesets.json'), `${JSON.stringify(all, null, 2)}\n`, 'utf8');
  console.log(`Wrote generated XCTest files and ${outDir}/ios-policy-test-changesets.json`);
}
