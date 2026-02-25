# PantherEyes VS Code Extension

VS Code extension to integrate with the PantherEyes `agent-server`, send prompts to the `/chat` endpoint, and preview `ChangeSet` results interactively.

## Features

- Command `PantherEyes: Ask Agent`
- Command `PantherEyes: Validate Security Config`
- Command `PantherEyes: Run Scan` (uses `/tools/call` + `scan_gate_report`, with terminal fallback)
- Command `PantherEyes: Preview Policy Diff` (uses `/tools/call` + `compare_policy_envs_report`)
- Command `PantherEyes: Set LLM Provider` (BYOK-ready via `SecretStorage`, no real provider yet)
- Command `PantherEyes: Agent Status` (healthcheck / restart / logs)
- Simple chat panel (Webview) with response + `ChangeSet` preview
- Auto-start local agent for `localhost` endpoints (default enabled)

## Configuration

Supported settings:

- `panthereyes.agentServerUrl` (default: `http://localhost:4711/chat`)
- `panthereyes.autoStartLocalAgent` (default: `true`)
- `panthereyes.defaultEnv` (default: `dev`)
- `panthereyes.defaultTarget` (default: `web`)

## Quick Start (No F5 / End User Flow)

Use this flow when you want to **use** the extension (not develop it).

For a step-by-step developer packaging guide (with troubleshooting), see:

- `docs/vscode-extension-local-packaging.md`

### 1. Package the extension as `.vsix` (from the monorepo root)

```bash
corepack pnpm install
corepack pnpm extension:package
```

This creates:

- `apps/vscode-extension/panthereyes-vscode-extension.vsix`

### 2. Install the `.vsix` in VS Code

In VS Code:

- `Cmd+Shift+P` -> `Extensions: Install from VSIX...`
- Select `apps/vscode-extension/panthereyes-vscode-extension.vsix`

### 3. Open the PantherEyes monorepo (or project using a remote agent)

The extension auto-starts the local agent when:

- `panthereyes.agentServerUrl` points to `http://localhost:...`
- `panthereyes.autoStartLocalAgent = true`
- the workspace looks like the PantherEyes monorepo

### 4. Use it

- `Cmd+Shift+P` -> `PantherEyes: Ask Agent`
- (Optional) `Cmd+Shift+P` -> `PantherEyes: Agent Status`

## Run with F5 (Extension Development)

1. From the monorepo root, build the dependencies used by `agent-server` and start the server on `4711`:

```bash
corepack pnpm agent:up
```

2. In VS Code, open the `PantherEyes` folder.
3. Open `apps/vscode-extension` in the workspace (or keep the monorepo root open).
4. Press `F5` to open a new Extension Development Host window.
5. In the development window, open the Command Palette and run:
   - `PantherEyes: Ask Agent`

## Expected Flow

- Enter a prompt in the chat panel.
- The extension sends a `POST` request to `http://localhost:4711/chat`.
- The JSON response is displayed in the panel.
- The `ChangeSet` is shown as cards with content previews.
- Utility commands can call the HTTP tools bridge (`/tools/call`) directly for faster structured actions.

## Example Payload Sent to `agent-server`

```json
{
  "message": "Generate policy tests for prod web",
  "intent": "generate_policy_tests",
  "context": {
    "env": "prod",
    "target": "web",
    "rootDir": "/path/to/workspace"
  }
}
```

## Screenshots (placeholders)

The extension currently includes placeholder image assets under `apps/vscode-extension/media/`, but SVG images are not accepted by `vsce` in the extension `README.md` during `.vsix` packaging.

Recommended options:

- replace placeholders with `.png` files before publishing, or
- keep this section text-only for local packaging/demo

Placeholder assets currently available:

- `media/chat-panel-placeholder.svg`
- `media/changeset-preview-placeholder.svg`

## Common Errors

- `Could not reach PantherEyes agent...`
  - Verify `panthereyes.agentServerUrl`.
  - If using local mode, run `PantherEyes: Agent Status` and choose `Show Agent Logs`.
  - If auto-start is disabled, start the agent manually (`corepack pnpm agent:up`).
- `Request body is empty` or `400`
  - Check the payload and the `env/target` fields in the panel.
- `PantherEyes scan via tools bridge failed`
  - The extension offers `Run in Terminal` fallback.
  - Verify the local agent supports `/tools/call` and the tool `panthereyes.scan_gate_report`.
- `cargo run ...` fails when running `Run Scan`
  - Confirm the Rust toolchain is installed and the monorepo is opened at the root.
- `Auto-start failed`
  - Confirm the workspace root is the PantherEyes monorepo (`apps/agent-server` must exist).
  - Confirm `corepack` is available in your shell (`corepack --version`).
