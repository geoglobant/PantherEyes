# Tutorial: How to Use the PantherEyes MCP

This tutorial shows, in a practical way, how to use the **PantherEyes MCP** in your local workflow with **Codex / VS Code** (and other MCP clients).

## 1. What is the PantherEyes MCP?

The PantherEyes MCP (Model Context Protocol) exposes security tools to assistants (for example, Codex), such as:

- `panthereyes.scan_gate_report`
- `panthereyes.validate_security_config`
- `panthereyes.compare_policy_envs_report`
- `panthereyes.generate_policy_tests`
- `panthereyes.create_policy_exception`

Instead of using `/chat`, the MCP client calls structured tools directly.

## 2. Usage modes (summary)

You can use the MCP in 3 ways:

1. **Local monorepo (today, without publishing the package)**
   - using the wrapper: `scripts/mcp/panthereyes-mcp.sh`
2. **Published package (recommended for other developers)**
   - via `npx -y @georgemichelon/panthereyes-mcp`
3. **Installed as a dependency in the project**
   - `npm i -D @georgemichelon/panthereyes-mcp`

## 3. Prerequisites

### For local monorepo usage (without a published package)

- Node.js 20+
- `corepack`
- `pnpm`
- PantherEyes cloned locally

Install and build:

```bash
corepack pnpm install
corepack pnpm agent:build
```

### For usage via published package (source-free)

- Node.js 20+
- `npx` (npm)
- no need to clone the monorepo

## 4. Testing the MCP locally (monorepo)

### Option A (recommended): bundled wrapper

From the monorepo root:

```bash
./scripts/mcp/panthereyes-mcp.sh
```

Or:

```bash
corepack pnpm mcp:up:local
```

### Option B (direct dev script)

```bash
corepack pnpm mcp:up
```

## 5. Configuring Codex / VS Code (MCP)

Use an MCP config that points to the PantherEyes launcher.

### Template available in the repo

- [`docs/examples/codex-vscode-mcp.example.json`](examples/codex-vscode-mcp.example.json)

### Example (local monorepo)

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

1. save the MCP config in the client
2. restart Codex / VS Code
3. ask it to list/call PantherEyes tools

## 6. Using it after publishing the package (without downloading source)

Once `@georgemichelon/panthereyes-mcp` is published, usage can look like this:

### Template available

- [`docs/examples/codex-vscode-mcp-npx.example.json`](examples/codex-vscode-mcp-npx.example.json)

### Example (via `npx`)

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

## 7. Installing in a project (mobile/web) as a dependency

In the app/site project:

```bash
npm i -D @georgemichelon/panthereyes-mcp
```

Generic MCP config:

```json
{
  "mcpServers": {
    "panthereyes": {
      "command": "./node_modules/.bin/panthereyes-mcp"
    }
  }
}
```

This is useful for:

- pinning the version per project
- keeping team reproducibility

## 8. Practical usage examples (tools)

Ask Codex/the MCP client to call:

### 1. Validate PantherEyes config

- Tool: `panthereyes.validate_security_config`
- Args:

```json
{
  "rootDir": "samples/ios-panthereyes-demo"
}
```

### 2. Run scan with gate (mobile)

- Tool: `panthereyes.scan_gate_report`
- Args:

```json
{
  "rootDir": "samples/android-panthereyes-demo",
  "target": "mobile",
  "phase": "static",
  "failOn": ["block"],
  "format": "both"
}
```

### 3. Compare `dev` vs `prod` policy

- Tool: `panthereyes.compare_policy_envs_report`
- Args:

```json
{
  "rootDir": "samples/ios-panthereyes-demo",
  "target": "mobile",
  "baseEnv": "dev",
  "compareEnv": "prod",
  "format": "both"
}
```

### 4. Create a policy exception (dry-run `ChangeSet`)

- Tool: `panthereyes.create_policy_exception`
- Args:

```json
{
  "rootDir": "samples/ios-panthereyes-demo",
  "env": "dev",
  "target": "mobile",
  "findingId": "IOS-ATS-001",
  "owner": "security-team"
}
```

## 9. How to use it in your mobile or web project

### Mobile project (Android/iOS)

Use:
- `target: "mobile"`
- `rootDir`: path to the mobile repo

Example:

```json
{
  "rootDir": "/path/to/mobile-app",
  "target": "mobile",
  "phase": "static"
}
```

### Web project

Use:
- `target: "web"`
- `rootDir`: path to the web app/site repo

Example:

```json
{
  "rootDir": "/path/to/web-app",
  "target": "web",
  "phase": "static"
}
```

## 10. Quick troubleshooting

### The MCP client cannot find PantherEyes

- verify the absolute command path in the MCP config
- restart the client after changing the config
- test the launcher manually in a terminal

### MCP starts but does not respond

If you are in the monorepo:

```bash
corepack pnpm agent:build
corepack pnpm --filter @georgemichelon/panthereyes-mcp run doctor
```

### `npx @georgemichelon/panthereyes-mcp` fails

- confirm the package has been published
- check your registry:

```bash
npm config get registry
```

### I want the real package tarball URL

After publishing:

```bash
npm view @georgemichelon/panthereyes-mcp dist.tarball
```

## 11. Recommended next steps

1. Publish `@georgemichelon/panthereyes-mcp` to npmjs
2. Test with Codex in VS Code using the `npx` template
3. Add a Codex-client-specific guide for your team (with the exact config format used internally)
