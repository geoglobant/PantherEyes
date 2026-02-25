# PantherEyes Agent: Usage Guide and MCP Distribution

This guide covers **all supported ways to use the PantherEyes Agent** in the monorepo and how to **distribute the MCP setup** to other developers on your team.

## 1. Overview: ways to use the agent

The PantherEyes Agent can be used through multiple interfaces (without conflict):

1. `HTTP /chat`
   - human/conversational usage
   - intents/planners (for example: `generate_policy_tests`, `explain_finding`)
2. `HTTP /tools/*`
   - deterministic, structured usage (CI/CD, scripts, automation)
   - endpoints: `/tools/list`, `/tools/schema`, `/tools/call`
3. `MCP (stdio)`
   - integration with Codex / Claude / MCP-capable clients
   - exposes PantherEyes tools natively
4. `VS Code Extension`
   - editor UX (chat + tools bridge + ChangeSet preview)

Architecture (summary):

- **Core tools/planners** = single source of logic
- **HTTP bridge** = adapter for CI/scripts
- **MCP** = adapter for assistants
- **VS Code extension** = development UI

## 2. Prerequisites

- Node.js 20+
- `corepack` enabled
- `pnpm` (via corepack)
- Rust (for CLI/checks when needed)
- `jq` (recommended for scripts/local CI)

Install dependencies:

```bash
corepack pnpm install
```

## 3. Start the Agent Server (HTTP)

From the monorepo root:

```bash
corepack pnpm agent:up
```

By default (root script), the agent runs on:

- `http://localhost:4711`

Validate the healthcheck:

```bash
curl -s http://localhost:4711/health
```

## 4. Use via `/chat` (conversational)

Recommended for:
- human prompts
- planners/intents
- generation/explanation with context

Example (`compare_policy_envs`):

```bash
curl -s http://localhost:4711/chat \
  -H 'content-type: application/json' \
  -d '{
    "message": "compare policy dev vs prod for mobile",
    "intent": "compare_policy_envs",
    "context": {
      "rootDir": "samples/ios-panthereyes-demo",
      "target": "mobile"
    }
  }' | jq .
```

Example (`create_policy_exception` -> dry-run `ChangeSet`):

```bash
curl -s http://localhost:4711/chat \
  -H 'content-type: application/json' \
  -d '{
    "message": "create exception for IOS-ATS-001 in dev approved by security-team",
    "intent": "create_policy_exception",
    "context": {
      "rootDir": "samples/ios-panthereyes-demo",
      "env": "dev",
      "target": "mobile"
    }
  }' | jq .
```

## 5. Use via `/tools/*` (deterministic / CI / automation)

Recommended for:
- CI/CD
- shell scripts
- predictable automation
- internal integrations without MCP

### List tools

```bash
curl -s http://localhost:4711/tools/list | jq .
```

### View tools schema

```bash
curl -s http://localhost:4711/tools/schema | jq .
```

### Call a tool

Example: `scan_gate_report`

```bash
curl -s http://localhost:4711/tools/call \
  -H 'content-type: application/json' \
  -d '{
    "name": "panthereyes.scan_gate_report",
    "arguments": {
      "rootDir": "samples/ios-panthereyes-demo",
      "target": "mobile",
      "phase": "static",
      "failOn": ["block"],
      "format": "both"
    }
  }' | jq .
```

### Usage by project type (mobile / web / CI/CD)

#### Mobile project (Android/iOS repo)

Use `target: "mobile"` and point `rootDir` to the mobile app repo:

```bash
curl -s http://localhost:4711/tools/call \
  -H 'content-type: application/json' \
  -d '{
    "name": "panthereyes.scan_gate_report",
    "arguments": {
      "rootDir": "/path/to/mobile-app",
      "target": "mobile",
      "phase": "static",
      "failOn": ["block"],
      "format": "both"
    }
  }' | jq .
```

#### Web project (site/web app repo)

Use `target: "web"`:

```bash
curl -s http://localhost:4711/tools/call \
  -H 'content-type: application/json' \
  -d '{
    "name": "panthereyes.scan_gate_report",
    "arguments": {
      "rootDir": "/path/to/web-app",
      "target": "web",
      "phase": "static",
      "failOn": ["block"],
      "format": "both"
    }
  }' | jq .
```

#### CI/CD pipeline

Use the HTTP tools bridge wrapper (`scripts/ci/panthereyes-gate.sh`) or the composite action (`.github/actions/panthereyes-gate/action.yml`).
The HTTP bridge is the recommended CI interface because it returns structured gate decisions and markdown/json reports.

### Local CI/CD wrapper (recommended)

Included script:

- `scripts/ci/panthereyes-gate.sh`

Run it:

```bash
# terminal 1
corepack pnpm agent:up

# terminal 2
./scripts/ci/panthereyes-gate.sh --root-dir . --target web --phase static
```

Also available from the root script:

```bash
corepack pnpm agent:ci:gate -- --root-dir . --target web --phase static
```

Generated artifacts (JSON):

- `artifacts/panthereyes/config-validation.json`
- `artifacts/panthereyes/scan-gate.json`
- `artifacts/panthereyes/scan-gate-report.json`
- `artifacts/panthereyes/policy-diff-report.json` (unless `--skip-policy-diff` is used)

## 6. Use via the VS Code extension (editor UX)

Recommended developer flow:

1. Install the PantherEyes extension (`.vsix`) or run it in dev mode (`F5`)
2. Ensure the agent is available (the extension also attempts local auto-start)
3. Open the Command Palette:
   - `PantherEyes: Ask Agent`
   - `PantherEyes: Run Scan`
   - `PantherEyes: Preview Policy Diff`
   - `PantherEyes: Show Tools Schema`

The webview panel supports:
- chat (`/chat`)
- tools bridge (`/tools/call`)
- `ChangeSet` preview
- `Apply ChangeSet`
- `Review & Apply` per file
- schema-based form helper from `/tools/schema`

## 7. Use via MCP (Codex / VS Code / other MCP clients)

Recommended for:
- Codex
- Claude Desktop
- assistants with MCP support

### Local MCP wrapper (recommended)

Included script:

- `scripts/mcp/panthereyes-mcp.sh`

Run manually (test):

```bash
./scripts/mcp/panthereyes-mcp.sh
```

Or via root script:

```bash
corepack pnpm mcp:up:local
```

### MCP client configuration (generic example)

Template in the repo:

- `docs/examples/codex-vscode-mcp.example.json`
- `docs/examples/codex-vscode-mcp-npx.example.json` (for future packaged distribution via npm)

Example (adjust the absolute path):

```json
{
  "mcpServers": {
    "panthereyes": {
      "command": "/ABSOLUTE/PATH/TO/PantherEyes/scripts/mcp/panthereyes-mcp.sh",
      "args": [],
      "cwd": "/ABSOLUTE/PATH/TO/PantherEyes",
      "env": {
        "PANTHEREYES_ENABLE_LLM_ROUTER": "0"
      }
    }
  }
}
```

Then:
1. save the MCP configuration in the client
2. restart Codex/VS Code
3. ask it to call a PantherEyes tool (for example `panthereyes.scan_gate_report`)

### Source-free distribution (npm)

Target package name:

- `@georgemichelon/panthereyes-mcp`

MCP client configuration (once the package is published):

```json
{
  "mcpServers": {
    "panthereyes": {
      "command": "npx",
      "args": ["-y", "@georgemichelon/panthereyes-mcp"]
    }
  }
}
```

Current note:
- the package exists in the monorepo as a launcher package and supports bundled runtime generation
- `prepack` builds the runtime bundle that will be shipped in the published package

## 8. How to distribute the MCP to other developers (team)

There are 3 maturity levels. Recommended path: start with **Level 1** and evolve.

### Level 1 (fast and practical): distribute through the repo + wrapper script

Each developer:
1. clones the `PantherEyes` repo
2. runs `corepack pnpm install`
3. configures the MCP client to point to:
   - `scripts/mcp/panthereyes-mcp.sh`

Advantages:
- simple
- reuses versioned scripts
- works today

Tradeoffs:
- absolute path differs per machine
- each developer needs local dependencies

### Level 2 (recommended for teams): config template + onboarding script

Standardize:
- a versioned MCP template (already started with `docs/examples/codex-vscode-mcp.example.json`)
- an internal onboarding script that:
  - validates `node/corepack/pnpm`
  - runs `pnpm install`
  - prints the MCP snippet with the developer's local path

This reduces onboarding errors and manual setup.

At this level, keep two templates:
- local-monorepo wrapper (`docs/examples/codex-vscode-mcp.example.json`)
- future packaged `npx` config (`docs/examples/codex-vscode-mcp-npx.example.json`)

### Level 3 (more professional): distribute as an internal package/binary

Options:

1. **Internal npm package**
   - publish a package that exposes an MCP launcher (`panthereyes-mcp`)
   - MCP clients use `command: "panthereyes-mcp"`

2. **Binary/container**
   - package the MCP as a binary or Docker image
   - useful for standardized environments/CI

3. **Versioned internal release**
   - zip/tar with `dist` + wrapper + docs
   - developers download a pinned version

Advantages:
- less dependency on the full monorepo
- more controlled versioning
- more predictable onboarding

### Governance recommendations (important)

To avoid “works on machine A but not B”:

1. **Pin versions**
   - use a stable tag/branch/release of PantherEyes for the team
2. **Freeze contracts**
   - `/tools/schema` should mirror what MCP exposes
3. **Document changes**
   - short changelog for added/changed tools
4. **Provide templates per client**
   - Codex VS Code
   - Claude Desktop
   - other MCP clients used by the team

## 9. Which interface should I use in each scenario?

Use this quick guide:

1. **Developer wants to chat and iterate** -> VS Code extension (`/chat` + `/tools/*`)
2. **CI/CD / GitHub Actions** -> `/tools/*` (HTTP bridge)
3. **Codex/Claude as copilots with tools** -> MCP
4. **Fast local scan without agent** -> Rust CLI (`panthereyes`)

## 10. Quick troubleshooting

### Agent HTTP does not respond (`/health`)
- confirm `corepack pnpm agent:up`
- validate port `4711`
- check agent logs in the terminal

### `/tools/call` returns schema/args error
- check `GET /tools/schema`
- validate the JSON sent in `arguments`

### MCP client does not “see” the tools
- verify the absolute path to `scripts/mcp/panthereyes-mcp.sh`
- restart the client after changing MCP config
- test the wrapper manually in a terminal

### VS Code extension does not show PantherEyes commands
- confirm extension is installed (or `F5` in dev mode)
- `Developer: Reload Window`
- `PantherEyes: Agent Status`

### CI wrapper fails even when agent is running
- test `curl http://localhost:4711/health`
- verify `jq`
- review `--target` (`web|mobile`) and `--phase` (`static|non-static`)

## 11. Suggested next steps for the team

1. Publish a Codex-client-specific MCP guide for the internal environment
2. Create a reusable workflow (`workflow_call`) based on `.github/actions/panthereyes-gate`
3. Package MCP into an internal distribution (package/binary) for simpler onboarding

## 12. Publishing `@georgemichelon/panthereyes-mcp` (workflow template)

This repo now includes a publish workflow template:

- `.github/workflows/publish-panthereyes-mcp.yml`

It supports:
- `npmjs` publish (recommended for broad developer usage)
- `GitHub Packages` publish (requires package scope alignment with GitHub owner namespace)
- `dry_run` mode (pack + validate only)

### Required secrets

For npmjs:
- `NPM_TOKEN`

For GitHub Packages:
- `GITHUB_TOKEN` (usually enough for same-repo owner scope), or
- `GH_PACKAGES_TOKEN` (if you prefer a dedicated PAT)

### Run as dry-run (recommended first)

Use `workflow_dispatch` with:
- `registry = npmjs`
- `dry_run = true`

This will:
1. build the PantherEyes runtime dependencies
2. prepare the bundled MCP runtime (`prepack`)
3. generate the tarball
4. upload the tarball as a workflow artifact

### Publish to npmjs

Use `workflow_dispatch` with:
- `registry = npmjs`
- `tag = latest` (or another dist-tag)
- `dry_run = false`

### Publish to GitHub Packages

If publishing to GitHub Packages, the package scope must match the GitHub namespace (owner/org).

Because the package name is currently:

- `@georgemichelon/panthereyes-mcp`

you will typically need to set:
- `package_name_override = @<github-owner>/panthereyes-mcp`

Example:
- `@geoglobant/panthereyes-mcp`

### Local validation before publishing (recommended)

```bash
corepack pnpm agent:build
corepack pnpm --filter @georgemichelon/panthereyes-mcp run bundle:prepare
corepack pnpm --filter @georgemichelon/panthereyes-mcp run doctor
cd packages/panthereyes-mcp && npm_config_cache=/tmp/panthereyes-npm-cache npm pack --dry-run
```
