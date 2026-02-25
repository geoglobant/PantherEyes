# PantherEyes MCP (Local Usage)

This document explains how to run the **PantherEyes MCP server** locally (stdio transport) and what is currently implemented in the initial scaffold.

## Status (Current Scope)

Implemented in the initial scaffold:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`

PantherEyes tools exposed:

- `panthereyes.validate_security_config`
- `panthereyes.preview_effective_policy`
- `panthereyes.list_effective_directives`
- `panthereyes.compare_policy_envs`
- `panthereyes.scan`
- `panthereyes.generate_policy_tests`

Transport:

- `stdio` (JSON-RPC with `Content-Length` framing)

## Run the MCP server

From the monorepo root:

```bash
corepack pnpm mcp:up
```

For development (watch mode):

```bash
corepack pnpm mcp:up:dev
```

## Notes

- MCP logs are written to **stderr** (so they do not corrupt the stdio protocol on stdout).
- The existing HTTP `agent-server` (`/chat`) remains unchanged.
- The MCP scaffold reuses the same PantherEyes tool implementations used by the agent planner.

## Example tool call payloads (conceptual)

### `panthereyes.validate_security_config`

```json
{
  "name": "panthereyes.validate_security_config",
  "arguments": {
    "rootDir": "samples/ios-panthereyes-demo"
  }
}
```

### `panthereyes.preview_effective_policy`

```json
{
  "name": "panthereyes.preview_effective_policy",
  "arguments": {
    "rootDir": "samples/android-panthereyes-demo",
    "env": "prod",
    "target": "mobile"
  }
}
```

### `panthereyes.generate_policy_tests`

```json
{
  "name": "panthereyes.generate_policy_tests",
  "arguments": {
    "rootDir": "samples/ios-panthereyes-demo",
    "env": "prod",
    "target": "mobile",
    "userMessage": "Generate policy tests for prod iOS"
  }
}
```

### `panthereyes.compare_policy_envs`

```json
{
  "name": "panthereyes.compare_policy_envs",
  "arguments": {
    "rootDir": "samples/ios-panthereyes-demo",
    "target": "mobile",
    "baseEnv": "dev",
    "compareEnv": "prod"
  }
}
```

### `panthereyes.scan`

```json
{
  "name": "panthereyes.scan",
  "arguments": {
    "rootDir": "samples/android-panthereyes-demo",
    "target": "mobile",
    "phase": "static"
  }
}
```

## MCP client configuration examples (Codex / Claude)

The PantherEyes MCP server uses **stdio**, so any MCP-capable client that supports launching a local command can connect to it.

### Common command (used by clients)

Run from the monorepo root:

```bash
corepack pnpm mcp:up
```

If the client launches the command directly, use an absolute workspace path as the command working directory (or call `corepack` with `--dir` if the client supports it).

### Claude Desktop (example)

`claude_desktop_config.json` (example shape used by Claude Desktop; adjust path to your machine):

```json
{
  "mcpServers": {
    "panthereyes": {
      "command": "corepack",
      "args": ["pnpm", "mcp:up"],
      "cwd": "/Users/george.michelon/Desktop/PantherEyes"
    }
  }
}
```

### Codex / MCP-enabled coding client (generic example)

Codex MCP configuration formats may vary by client/version. Use the equivalent fields below:

```json
{
  "name": "panthereyes",
  "transport": "stdio",
  "command": "corepack",
  "args": ["pnpm", "mcp:up"],
  "cwd": "/Users/george.michelon/Desktop/PantherEyes"
}
```

Required fields conceptually:

- `command`: `corepack`
- `args`: `["pnpm", "mcp:up"]`
- `cwd`: PantherEyes monorepo root
- `transport`: `stdio`

### Validation checklist

After registering the MCP server in your client:

1. Verify the client can connect and list tools.
2. Confirm these tools appear: `panthereyes.scan`, `panthereyes.compare_policy_envs`, `panthereyes.generate_policy_tests`.
3. Run a simple call with `samples/ios-panthereyes-demo` as `rootDir`.
4. Check MCP logs (stderr) if the client reports startup errors.

## Next recommended improvements

1. Add formal MCP schema tests (request/response framing)
2. Normalize shared schemas between `/chat` and MCP tools
3. Add more protocol/tool call integration tests (success + invalid params)
4. Consider exposing `panthereyes.scan` through core tool registry (not only MCP host)
