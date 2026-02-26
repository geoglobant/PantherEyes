# PantherEyes - Current Status and Pending Items

Project snapshot (working branch): `feat/mcp-agent-integration`

Purpose of this document:
- record what is already working
- make current gaps explicit
- support prioritization of next steps (product, engineering, and adoption)

## 1. Executive summary

PantherEyes is already at an **internal pilot / advanced demo** stage.

Today the project already enables:
- running real scans (CLI + initial mobile/web checks)
- resolving policy by environment (`dev/staging/prod`)
- generating policy tests (XCTest/JUnit) deterministically
- using an agent server with intents/planners/tools
- using tools over HTTP (`/tools/*`) for CI/CD
- using MCP with Codex/assistants
- using a VS Code extension with `ChangeSet` review/apply UX

Important items still missing for broader scale/production:
- real `non-static` phase (currently a stub)
- more checks
- official MCP / extension publishing
- operational hardening and client-specific documentation

## 2. What we already have (working)

### 2.1 Monorepo and engineering foundation
- Monorepo with `pnpm` workspace (Node/TypeScript)
- Cargo workspace (Rust)
- organized structure in `apps/`, `packages/`, `crates/`, `docs/`, `.github/`
- base lint/format setup for TypeScript
- Apache-2.0 license

### 2.2 Rust CLI (`panthereyes`)
- `panthereyes` binary
- subcommands:
  - `scan`
  - `config validate`
  - `policy preview`
  - `doctor`
- `--json` support
- error handling with `anyhow` + `thiserror`
- argument parser unit tests
- support for `scan --phase static|non-static` (`non-static` currently stubbed)

### 2.3 Rust core + checks
- `panthereyes-core` with common types/contracts:
  - `Finding`
  - `Severity`
  - `ScanStatus`
  - `PolicyResult`
  - `ScanReport`
  - engine trait
- `panthereyes-checks-mobile`:
  - relaxed iOS ATS
  - Android cleartext
  - Android debuggable
- `panthereyes-checks-web`:
  - structure prepared
  - initial config/header checks (e.g., CSP/HSTS)

### 2.4 Policy engine and rule catalog (TypeScript)
- reads configs from `.panthereyes/`
  - `policy.yaml`
  - `rules.yaml`
  - `exceptions.yaml`
- schema validation with `zod`
- effective policy resolution by environment/target
- `previewEffectivePolicy(env, target)`
- `listEffectiveDirectives(env, target)`
- merge strategy `defaults -> env -> target`
- merge unit tests (`dev` vs `prod`)

### 2.5 TS SDK (policy test generation)
- deterministic `PolicyTestGenerator` (no LLM)
- separate templates:
  - `xctestPolicyTemplate`
  - `junitPolicyTemplate`
- generates `ChangeSet` or writes files (`write`)
- stable/predictable test names
- unit tests

### 2.6 Agent Server (TypeScript)
- architecture with:
  - intents
  - deterministic planners
  - tools
  - adapters
- HTTP endpoints:
  - `/health`
  - `/chat`
  - `/tools/list`
  - `/tools/schema`
  - `/tools/call`
- structured logs
- LLM provider layer (OpenAI/Claude) with:
  - interfaces
  - BYOK key resolution by scope
  - fallback routing
  - usage audit events

### 2.7 Deterministic intents/planners (agent)
- `generate_policy_tests`
- `compare_policy_envs`
- `explain_finding`
- `suggest_remediation`
- `create_policy_exception` (dry-run `ChangeSet`)

### 2.8 MCP tools / HTTP bridge tools (deterministic)
- `panthereyes.validate_security_config`
- `panthereyes.preview_effective_policy`
- `panthereyes.list_effective_directives`
- `panthereyes.compare_policy_envs`
- `panthereyes.compare_policy_envs_report`
- `panthereyes.scan`
- `panthereyes.scan_gate`
- `panthereyes.scan_gate_report`
- `panthereyes.generate_policy_tests`
- `panthereyes.explain_finding`
- `panthereyes.suggest_remediation`
- `panthereyes.create_policy_exception`

### 2.9 MCP (Model Context Protocol)
- working MCP server (stdio)
- methods:
  - `initialize`
  - `ping`
  - `tools/list`
  - `tools/call`
- protocol / server / toolHost tests
- local usage documentation
- MCP package with defined name:
  - `@georgemichelon/panthereyes-mcp`
- package already packable with bundled runtime (source-free packable)
- publish workflow template (npmjs / GitHub Packages)

### 2.10 VS Code Extension (PantherEyes)
- commands:
  - Ask Agent
  - Validate Security Config
  - Run Scan
  - Preview Policy Diff
  - Show Tools Schema
  - Set LLM Provider
  - Agent Status
- local agent auto-start
- webview panel with:
  - chat (`/chat`)
  - tool execution (`/tools/call`)
  - history/timeline
  - `ChangeSet` preview/apply
  - per-file `Review & Apply`
  - schema-driven form (`/tools/schema`)
- base `SecretStorage` support (BYOK)
- `.vsix` packaging
- panther branding/logo in panel and extension icon

### 2.11 Samples and end-to-end validation
- `samples/ios-panthereyes-demo`
  - SwiftUI app
  - Xcode project
  - `.panthereyes`
  - tests + helper
  - `LAB.md`
- `samples/android-panthereyes-demo`
  - Kotlin/Gradle app
  - `.panthereyes`
  - tests + helper
  - `LAB.md`
- `samples/shared-fixtures`
  - expected findings
  - expected changesets

### 2.12 CI/CD
- CI workflows (PR / release)
- local gate wrapper via agent tools bridge:
  - `scripts/ci/panthereyes-gate.sh`
- reusable composite action:
  - `.github/actions/panthereyes-gate/action.yml`

## 3. Current pending items (gaps)

### 3.1 Scans and checks
- `scan --phase non-static` is still a stub
- check coverage is still early-stage (mobile/web)
- some didactic checks present in samples are still missing (e.g., Android `allowBackup=true`)
- didactic hardcoded secret detection is not implemented yet

### 3.2 CLI
- CLI `policy preview` is still a scaffold
- CLI `config validate` does not yet perform full schema validation (actual validation lives in `policy-engine`)

### 3.3 MCP package / distribution
- `@georgemichelon/panthereyes-mcp` is packable, but still missing:
  - actual registry publishing
  - clean-environment validation via `npx`
- bundle can still be optimized (size / unnecessary files)

### 3.4 LLM / assisted intelligence
- OpenAI/Claude providers are in early integration stage (stubs/infrastructure ready)
- full LLM experience is not yet enabled as the default flow
- advanced intents are still mostly deterministic (great for CI, but still limits generative use cases)

### 3.5 VS Code Extension
- can evolve in:
  - initial setup wizard
  - more advanced schema form UX
  - more robust persistence/history
- needs broader validation across environments (Windows/Linux/macOS)

### 3.6 Samples
- Android sample depends on globally installed Gradle (no `gradlew`)
- some didactic scenarios still do not produce findings because checks do not exist yet
- full automated validation of mobile UI/tests in CI is still missing

### 3.7 Operations and adoption
- extension is not yet published to the VS Code Marketplace
- MCP publish workflow still needs a real run with actual secrets
- missing client-specific MCP documentation (exact Codex VS Code client, Claude Desktop, etc.)
- team onboarding can still be simplified (additional scripts/templates)

## 4. Pending items by priority (suggested)

### P0 (high immediate impact)
- publish `@georgemichelon/panthereyes-mcp` (npmjs)
- validate `npx @georgemichelon/panthereyes-mcp` flow in a clean environment
- define the official MCP config guide for the Codex client used by the team
- implement at least 1-2 missing sample checks (e.g., `allowBackup`)

### P1 (product and adoption)
- real `non-static` phase (first functional version)
- improve CLI `config validate` / `policy preview`
- publish VS Code extension (or standardize internal `.vsix` distribution)
- optimize MCP package bundle

### P2 (scale and experience)
- expand check catalog
- richer extension UX (wizard, complex forms, persistent timelines)
- enable LLM flows with controlled routing
- PR comment / bot automations using `scan_gate_report`

## 5. Risks / external dependencies

- npm publishing depends on:
  - npm account
  - `NPM_TOKEN`
  - validated publish workflow
- GitHub Packages depends on scope alignment with owner/org namespace
- MCP adoption depends on the exact MCP client format/config (Codex/VS Code) used by the team
- some local tests depend on native toolchains (Xcode / Android SDK / Gradle)

## 6. Conclusion

Current PantherEyes status:
- **well beyond scaffold stage**
- ready for **internal pilot**, technical demos, and initial CI/CD integration
- with a solid foundation for MCP distribution and assistant usage (Codex)

Recommended main focus now:
- **publishing + adoption (MCP/Extension)**
- **more real checks**
- **stronger CI/CD flow**
