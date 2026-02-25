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

## Next recommended improvements

1. Add formal MCP schema tests (request/response framing)
2. Add documentation/examples for Codex/Claude MCP client configs
3. Normalize shared schemas between `/chat` and MCP tools
4. Consider exposing `panthereyes.scan` through core tool registry (not only MCP host)
