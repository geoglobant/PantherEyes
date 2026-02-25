# @georgemichelon/panthereyes-mcp

PantherEyes MCP launcher package for local/Codex/VS Code integration.

## Current status

This package supports two modes:

1. **Bundled runtime mode** (publishable/source-free)
   - a runtime bundle is generated into `runtime/` during `prepack`
   - the published package can run without the PantherEyes source repo
2. **Monorepo/local launcher mode**
   - fallback for development inside the PantherEyes monorepo
   - requires `apps/agent-server/dist/mcp/index.js`

## Usage

```bash
panthereyes-mcp
```

Doctor mode:

```bash
panthereyes-mcp --doctor
```

## Monorepo prerequisites

```bash
corepack pnpm install
corepack pnpm agent:build
```

Prepare the bundled runtime locally (same step used by `prepack`):

```bash
corepack pnpm --filter @georgemichelon/panthereyes-mcp run bundle:prepare
```

Then:

```bash
corepack pnpm --filter @georgemichelon/panthereyes-mcp doctor
corepack pnpm --filter @georgemichelon/panthereyes-mcp exec panthereyes-mcp
```

## Packaging (publishable tarball)

`prepack` automatically builds the bundled runtime:

```bash
cd packages/panthereyes-mcp
npm pack
```

After publishing, developers can use:

```bash
npx -y @georgemichelon/panthereyes-mcp
```
