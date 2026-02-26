#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageDir, '..', '..');
const runtimeDir = path.join(packageDir, 'runtime');

function log(message) {
  process.stderr.write(`[panthereyes-mcp bundle] ${message}\n`);
}

function ensureExists(p, helpMessage) {
  if (!fs.existsSync(p)) {
    throw new Error(`${p} not found.${helpMessage ? ` ${helpMessage}` : ''}`);
  }
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    dereference: true,
    force: true,
    errorOnExist: false,
  });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function copyWorkspacePackageRuntime(name, relativeDistPath) {
  const distSrc = path.join(repoRoot, relativeDistPath);
  ensureExists(distSrc, 'Run `corepack pnpm agent:build` first.');

  const targetDir = path.join(runtimeDir, 'node_modules', ...name.split('/'));
  const targetDist = path.join(targetDir, 'dist');
  copyDir(distSrc, targetDist);
  writeJson(path.join(targetDir, 'package.json'), {
    name,
    version: '0.1.0',
    main: 'dist/index.js',
    type: 'commonjs',
  });
}

function resolveInstalledPackageRoot(pkgName) {
  const candidatePaths = [
    repoRoot,
    path.join(repoRoot, 'packages', 'policy-engine'),
    path.join(repoRoot, 'packages', 'rule-catalog'),
    path.join(repoRoot, 'packages', 'sdk-ts'),
    path.join(repoRoot, 'node_modules', '.pnpm', 'node_modules'),
  ];
  let lastError = null;
  for (const candidate of candidatePaths) {
    try {
      const pkgJsonPath = require.resolve(`${pkgName}/package.json`, { paths: [candidate] });
      return fs.realpathSync(path.dirname(pkgJsonPath));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Unable to resolve ${pkgName}/package.json`);
}

function copyExternalRuntimePackage(pkgName) {
  const sourceRoot = resolveInstalledPackageRoot(pkgName);
  const targetRoot = path.join(runtimeDir, 'node_modules', ...pkgName.split('/'));
  copyDir(sourceRoot, targetRoot);
}

function copyAgentServerDist() {
  const src = path.join(repoRoot, 'apps', 'agent-server', 'dist');
  ensureExists(src, 'Run `corepack pnpm agent:build` first.');
  copyDir(src, path.join(runtimeDir, 'agent-server', 'dist'));
}

function writeRuntimeManifest() {
  writeJson(path.join(runtimeDir, 'bundle-manifest.json'), {
    bundleVersion: 1,
    generatedAt: new Date().toISOString(),
    package: '@georgemichelon/panthereyes-mcp',
    mode: 'bundled-runtime',
    includes: {
      agentServerDist: 'runtime/agent-server/dist',
      workspacePackages: [
        '@panthereyes/sdk-ts',
        '@panthereyes/policy-engine',
        '@panthereyes/rule-catalog',
      ],
      externalDependencies: ['yaml', 'zod'],
    },
  });
}

function main() {
  log(`repo root: ${repoRoot}`);
  resetDir(runtimeDir);

  copyAgentServerDist();
  copyWorkspacePackageRuntime('@panthereyes/sdk-ts', 'packages/sdk-ts/dist');
  copyWorkspacePackageRuntime('@panthereyes/policy-engine', 'packages/policy-engine/dist');
  copyWorkspacePackageRuntime('@panthereyes/rule-catalog', 'packages/rule-catalog/dist');

  // Runtime-only external deps used by compiled policy-engine/rule-catalog.
  copyExternalRuntimePackage('yaml');
  copyExternalRuntimePackage('zod');

  writeRuntimeManifest();
  log('runtime bundle prepared successfully');
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[panthereyes-mcp bundle] ERROR: ${message}\n`);
  process.exit(1);
}
