# PantherEyes

PantherEyes is a monorepo for an application and web security product focused on automated checks, policy analysis, and developer workflow integration.

## Planned Components

- `crates/panthereyes-cli`: Rust CLI for local execution and CI.
- `crates/panthereyes-core`: shared core types and contracts.
- `crates/panthereyes-checks-mobile`: security checks for mobile apps.
- `crates/panthereyes-checks-web`: security checks for web apps/sites.
- `packages/sdk-ts`: TypeScript SDK for app/service integrations.
- `packages/policy-engine`: policy evaluation engine in TypeScript.
- `packages/rule-catalog`: initial rule/policy catalog.
- `apps/agent-server`: TypeScript agent server for local/remote orchestration.
- `apps/vscode-extension`: VS Code extension for editor feedback.

## Monorepo Structure

- Node/TypeScript: workspace with `pnpm`
- Rust: workspace with `cargo`
- CI: GitHub Actions (`.github/workflows/ci.yml`, `.github/workflows/release.yml`)

## Getting Started

### Requirements

- Node.js 20+
- pnpm 9+
- Rust (stable toolchain)

### Install JS/TS Dependencies

```bash
pnpm install
```

### Validate TypeScript

```bash
pnpm lint
pnpm typecheck
pnpm build
```

### Validate Rust

```bash
cargo check --workspace
cargo test --workspace
```

### Run Initial Examples

```bash
pnpm --filter @panthereyes/agent-server dev
cargo run -p panthereyes-cli -- scan --target web ./example
```

## GitHub Actions (Pipelines)

### Development CI (PR)

File: `.github/workflows/ci.yml`

Runs:
- lint + typecheck + build + tests for Node/TypeScript (Node matrix)
- fmt + clippy + tests for Rust (Rust matrix)
- `panthereyes config validate` for files in `.panthereyes/`
- `panthereyes scan --phase static` (JSON)
- gate fails when scan returns `status=block`

### Release CI

File: `.github/workflows/release.yml`

Runs:
- `panthereyes scan --phase static` (JSON)
- `panthereyes scan --phase non-static` (stub for now)
- upload JSON scan artifacts
- workflow summary in `GITHUB_STEP_SUMMARY`

## Local Commands (Workflow Equivalents)

Additional requirement for the examples below:
- `jq` (for JSON parsing and local gating)

### PR CI (local)

```bash
# Node/TypeScript
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm -r --if-present run test

# Rust
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

# PantherEyes config validate
cargo run -p panthereyes-cli -- config validate .panthereyes/policy.yaml
cargo run -p panthereyes-cli -- config validate .panthereyes/rules.yaml
cargo run -p panthereyes-cli -- config validate .panthereyes/exceptions.yaml

# PantherEyes static scan (JSON) + block gate
mkdir -p artifacts/scans
cargo run -p panthereyes-cli -- --json scan --phase static --target web . > artifacts/scans/pr-static-scan.json
jq . artifacts/scans/pr-static-scan.json
test "$(jq -r '.summary.status' artifacts/scans/pr-static-scan.json)" != "block"
```

### Agent Tools Bridge (CI-style local gate)

If you want CI/CD behavior using the PantherEyes agent (`/tools/*`) instead of only the CLI:

```bash
# Terminal 1: start the agent
corepack pnpm agent:up

# Terminal 2: run the CI helper wrapper
./scripts/ci/panthereyes-gate.sh --root-dir . --target web --phase static
```

Artifacts are written to `artifacts/panthereyes/`.

Environment variables are also supported (useful in CI):

- `PANTHEREYES_AGENT_URL`
- `PANTHEREYES_CI_ROOT_DIR`
- `PANTHEREYES_CI_TARGET`
- `PANTHEREYES_CI_PHASE`
- `PANTHEREYES_CI_FAIL_ON`
- `PANTHEREYES_CI_BASE_ENV`
- `PANTHEREYES_CI_COMPARE_ENV`
- `PANTHEREYES_CI_ARTIFACTS_DIR`

Reusable GitHub composite action (for internal workflows):

- `.github/actions/panthereyes-gate/action.yml`

### Release CI (local)

```bash
mkdir -p artifacts/scans

# Static
cargo run -p panthereyes-cli -- --json scan --phase static --target web . > artifacts/scans/static-scan.json

# Non-static (stub)
cargo run -p panthereyes-cli -- --json scan --phase non-static --target web . > artifacts/scans/non-static-scan.json

# Quick summary
jq -r '"static: \(.summary.status) (\(.summary.findings | length) findings)"' artifacts/scans/static-scan.json
jq -r '"non-static: \(.summary.status) (\(.summary.findings | length) findings) [stub]"' artifacts/scans/non-static-scan.json
```

## License

Apache-2.0. See `LICENSE`.

## MCP (Codex / VS Code local)

PantherEyes also exposes an MCP server (stdio) for local assistant integration.

Quick start:

```bash
./scripts/mcp/panthereyes-mcp.sh
```

See `docs/mcp-local-usage.md` for local setup examples (including Codex in VS Code).

Additional guide (pt-BR, practical usage + team distribution):

- `docs/agent-usage-and-mcp-distribution.md`
- MCP config template example: `docs/examples/codex-vscode-mcp.example.json`
