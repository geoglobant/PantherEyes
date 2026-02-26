#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function printHelp() {
  process.stderr.write(
    [
      'PantherEyes MCP launcher (@georgemichelon/panthereyes-mcp)',
      '',
      'Usage:',
      '  panthereyes-mcp [--doctor] [--help] [--version]',
      '',
      'Current mode:',
      '  - Monorepo/local launcher (expects PantherEyes repo with built agent-server dist)',
      '',
      'Examples:',
      '  panthereyes-mcp',
      '  panthereyes-mcp --doctor',
      '',
      'If running from the PantherEyes monorepo, build dependencies first:',
      '  corepack pnpm agent:build',
      '',
    ].join('\n'),
  );
}

function readVersion() {
  try {
    const pkgPath = path.resolve(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function findMonorepoRoot() {
  const packageDir = path.resolve(__dirname, '..');
  let current = packageDir;
  for (let i = 0; i < 8; i += 1) {
    const rootPkg = path.join(current, 'package.json');
    const workspace = path.join(current, 'pnpm-workspace.yaml');
    const agentDist = path.join(current, 'apps', 'agent-server', 'dist', 'mcp', 'index.js');
    if (fs.existsSync(rootPkg) && fs.existsSync(workspace) && fs.existsSync(agentDist)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function findBundledRuntime() {
  const packageDir = path.resolve(__dirname, '..');
  const entry = path.join(packageDir, 'runtime', 'agent-server', 'dist', 'mcp', 'index.js');
  if (fs.existsSync(entry)) {
    return {
      packageDir,
      entry,
      runtimeRoot: path.join(packageDir, 'runtime'),
    };
  }
  return null;
}

function buildDoctorReport() {
  const bundled = findBundledRuntime();
  const repoRoot = findMonorepoRoot();
  const report = {
    launcher: '@georgemichelon/panthereyes-mcp',
    version: readVersion(),
    cwd: process.cwd(),
    node: process.version,
    mode: bundled ? 'bundled' : (repoRoot ? 'monorepo' : 'unresolved'),
    repoRoot,
    bundledRuntimeRoot: bundled ? bundled.runtimeRoot : null,
    checks: [],
  };

  if (bundled) {
    const checks = [
      ['bundled-agent-server-dist', bundled.entry],
      ['bundled-sdk', path.join(bundled.runtimeRoot, 'node_modules', '@panthereyes', 'sdk-ts', 'dist', 'index.js')],
      ['bundled-policy-engine', path.join(bundled.runtimeRoot, 'node_modules', '@panthereyes', 'policy-engine', 'dist', 'index.js')],
      ['bundled-rule-catalog', path.join(bundled.runtimeRoot, 'node_modules', '@panthereyes', 'rule-catalog', 'dist', 'index.js')],
      ['bundled-yaml', path.join(bundled.runtimeRoot, 'node_modules', 'yaml', 'package.json')],
      ['bundled-zod', path.join(bundled.runtimeRoot, 'node_modules', 'zod', 'package.json')],
    ];
    for (const [name, p] of checks) {
      report.checks.push({ name, ok: fs.existsSync(p), detail: p });
    }
    return report;
  }

  if (!repoRoot) {
    report.checks.push({
      name: 'monorepo-detection',
      ok: false,
      detail: 'Could not locate PantherEyes monorepo root from launcher path.',
    });
    return report;
  }

  const checks = [
    ['agent-server-dist', path.join(repoRoot, 'apps', 'agent-server', 'dist', 'mcp', 'index.js')],
    ['policy-engine-dist', path.join(repoRoot, 'packages', 'policy-engine', 'dist', 'index.js')],
    ['rule-catalog-dist', path.join(repoRoot, 'packages', 'rule-catalog', 'dist', 'index.js')],
    ['sdk-ts-dist', path.join(repoRoot, 'packages', 'sdk-ts', 'dist', 'index.js')],
    ['root-node-modules', path.join(repoRoot, 'node_modules')],
  ];

  for (const [name, p] of checks) {
    report.checks.push({
      name,
      ok: fs.existsSync(p),
      detail: p,
    });
  }

  return report;
}

function printDoctorAndExit() {
  const report = buildDoctorReport();
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  const failed = Array.isArray(report.checks) && report.checks.some((c) => c && c.ok === false);
  process.exit(failed ? 1 : 0);
}

function launchMonorepoMcp() {
  const bundled = findBundledRuntime();
  if (bundled) {
    const child = spawn(process.execPath, [bundled.entry], {
      cwd: bundled.packageDir,
      env: {
        ...process.env,
        PANTHEREYES_ENABLE_LLM_ROUTER: process.env.PANTHEREYES_ENABLE_LLM_ROUTER ?? '0',
      },
      stdio: 'inherit',
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    });

    child.on('error', (error) => {
      process.stderr.write(`Failed to launch bundled PantherEyes MCP runtime: ${error.message}\n`);
      process.exit(1);
    });
    return;
  }

  const repoRoot = findMonorepoRoot();
  if (!repoRoot) {
    process.stderr.write(
      [
        'PantherEyes MCP launcher could not find a PantherEyes monorepo root.',
        'No bundled runtime was found in this package either.',
        'This means the package was installed without the runtime bundle or the runtime files are missing.',
        '',
        'Workarounds:',
        '  1) Reinstall a published/bundled version of @georgemichelon/panthereyes-mcp, or',
        '  2) Clone the PantherEyes repo and run in monorepo mode:',
        '     - corepack pnpm install',
        '     - corepack pnpm agent:build',
        '     - panthereyes-mcp',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const mcpEntry = path.join(repoRoot, 'apps', 'agent-server', 'dist', 'mcp', 'index.js');
  if (!fs.existsSync(mcpEntry)) {
    process.stderr.write(
      [
        'PantherEyes MCP runtime is not built yet.',
        `Expected: ${mcpEntry}`,
        '',
        'Build it first:',
        '  corepack pnpm agent:build',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const child = spawn(process.execPath, [mcpEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PANTHEREYES_ENABLE_LLM_ROUTER: process.env.PANTHEREYES_ENABLE_LLM_ROUTER ?? '0',
    },
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    process.stderr.write(`Failed to launch PantherEyes MCP runtime: ${error.message}\n`);
    process.exit(1);
  });
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`${readVersion()}\n`);
    return;
  }
  if (args.includes('--doctor')) {
    printDoctorAndExit();
    return;
  }

  launchMonorepoMcp();
}

main();
