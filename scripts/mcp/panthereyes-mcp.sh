#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "$REPO_ROOT"

# Allow callers (Codex/VS Code MCP clients) to override env, but default to local deterministic mode.
export PANTHEREYES_ENABLE_LLM_ROUTER="${PANTHEREYES_ENABLE_LLM_ROUTER:-0}"

exec corepack pnpm --filter @georgemichelon/panthereyes-mcp exec panthereyes-mcp
