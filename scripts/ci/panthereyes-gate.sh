#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
PantherEyes CI gate helper (HTTP tools bridge)

Usage:
  scripts/ci/panthereyes-gate.sh [options]

Options:
  --root-dir PATH           Repository root to scan (default: .)
  --target TARGET           web|mobile (default: web)
  --phase PHASE             static|non-static (default: static)
  --fail-on CSV             Gate statuses to fail on (default: block)
  --base-env ENV            Base env for policy diff report (default: dev)
  --compare-env ENV         Compare env for policy diff report (default: prod)
  --agent-url URL           Agent base URL (default: http://localhost:4711)
  --artifacts-dir PATH      Artifact output dir (default: artifacts/panthereyes)
  --skip-policy-diff        Do not generate compare_policy_envs_report artifact
  --help                    Show this help

Requirements:
  - jq
  - PantherEyes agent-server running with /tools/* endpoints

Environment variable defaults (optional):
  - PANTHEREYES_AGENT_URL
  - PANTHEREYES_CI_ROOT_DIR
  - PANTHEREYES_CI_TARGET
  - PANTHEREYES_CI_PHASE
  - PANTHEREYES_CI_FAIL_ON
  - PANTHEREYES_CI_BASE_ENV
  - PANTHEREYES_CI_COMPARE_ENV
  - PANTHEREYES_CI_ARTIFACTS_DIR

Outputs:
  - config-validation.json
  - scan-gate.json
  - scan-gate-report.json
  - policy-diff-report.json (unless --skip-policy-diff)

Exit code:
  - 0 on pass
  - 1 if PantherEyes gate decides to fail the build
  - non-zero on infrastructure/request errors
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 2
  fi
}

ROOT_DIR="${PANTHEREYES_CI_ROOT_DIR:-.}"
TARGET="${PANTHEREYES_CI_TARGET:-web}"
PHASE="${PANTHEREYES_CI_PHASE:-static}"
FAIL_ON_CSV="${PANTHEREYES_CI_FAIL_ON:-block}"
BASE_ENV="${PANTHEREYES_CI_BASE_ENV:-dev}"
COMPARE_ENV="${PANTHEREYES_CI_COMPARE_ENV:-prod}"
AGENT_URL="${PANTHEREYES_AGENT_URL:-http://localhost:4711}"
ARTIFACTS_DIR="${PANTHEREYES_CI_ARTIFACTS_DIR:-artifacts/panthereyes}"
SKIP_POLICY_DIFF="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root-dir)
      ROOT_DIR="${2:-}"
      shift 2
      ;;
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --phase)
      PHASE="${2:-}"
      shift 2
      ;;
    --fail-on)
      FAIL_ON_CSV="${2:-}"
      shift 2
      ;;
    --base-env)
      BASE_ENV="${2:-}"
      shift 2
      ;;
    --compare-env)
      COMPARE_ENV="${2:-}"
      shift 2
      ;;
    --agent-url)
      AGENT_URL="${2:-}"
      shift 2
      ;;
    --artifacts-dir)
      ARTIFACTS_DIR="${2:-}"
      shift 2
      ;;
    --skip-policy-diff)
      SKIP_POLICY_DIFF="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_cmd curl
require_cmd jq

HEALTH_URL="${AGENT_URL%/}/health"
TOOLS_CALL_URL="${AGENT_URL%/}/tools/call"
TOOLS_SCHEMA_URL="${AGENT_URL%/}/tools/schema"

if ! curl -fsS "$HEALTH_URL" >/dev/null; then
  echo "error: PantherEyes agent is not healthy at $HEALTH_URL" >&2
  exit 3
fi

mkdir -p "$ARTIFACTS_DIR"

fail_on_json="$(printf '%s' "$FAIL_ON_CSV" | awk -F, '
  BEGIN { printf "[" }
  {
    for (i = 1; i <= NF; i++) {
      gsub(/^[ \t]+|[ \t]+$/, "", $i)
      if ($i == "") continue
      if (printed) printf ","
      printf "\"%s\"", $i
      printed = 1
    }
  }
  END { printf "]" }
')"

call_tool() {
  local tool_name="$1"
  local args_json="$2"
  curl -fsS "$TOOLS_CALL_URL" \
    -H 'content-type: application/json' \
    -d "{\"name\":\"${tool_name}\",\"arguments\":${args_json}}"
}

echo "== PantherEyes tools schema =="
curl -fsS "$TOOLS_SCHEMA_URL" | jq '{schemaVersion, generatedAt, tools: (.tools | length)}'

echo "== PantherEyes config validate =="
config_args="$(jq -cn --arg rootDir "$ROOT_DIR" '{rootDir:$rootDir}')"
call_tool "panthereyes.validate_security_config" "$config_args" \
  | tee "${ARTIFACTS_DIR}/config-validation.json" \
  | jq .

echo "== PantherEyes scan gate =="
scan_gate_args="$(jq -cn \
  --arg rootDir "$ROOT_DIR" \
  --arg target "$TARGET" \
  --arg phase "$PHASE" \
  --argjson failOn "$fail_on_json" \
  '{rootDir:$rootDir,target:$target,phase:$phase,failOn:$failOn}')"
call_tool "panthereyes.scan_gate" "$scan_gate_args" \
  | tee "${ARTIFACTS_DIR}/scan-gate.json" \
  | jq .

echo "== PantherEyes scan gate report =="
scan_report_args="$(jq -cn \
  --arg rootDir "$ROOT_DIR" \
  --arg target "$TARGET" \
  --arg phase "$PHASE" \
  --argjson failOn "$fail_on_json" \
  '{rootDir:$rootDir,target:$target,phase:$phase,failOn:$failOn,format:"both"}')"
call_tool "panthereyes.scan_gate_report" "$scan_report_args" \
  | tee "${ARTIFACTS_DIR}/scan-gate-report.json" >/dev/null
jq '.structuredContent.summary // {}' "${ARTIFACTS_DIR}/scan-gate-report.json"

if [[ "$SKIP_POLICY_DIFF" != "true" ]]; then
  echo "== PantherEyes policy diff (${BASE_ENV} vs ${COMPARE_ENV}) =="
  policy_diff_args="$(jq -cn \
    --arg rootDir "$ROOT_DIR" \
    --arg target "$TARGET" \
    --arg baseEnv "$BASE_ENV" \
    --arg compareEnv "$COMPARE_ENV" \
    '{rootDir:$rootDir,target:$target,baseEnv:$baseEnv,compareEnv:$compareEnv,format:"both"}')"
  call_tool "panthereyes.compare_policy_envs_report" "$policy_diff_args" \
    | tee "${ARTIFACTS_DIR}/policy-diff-report.json" >/dev/null
  jq '.structuredContent.summary // {}' "${ARTIFACTS_DIR}/policy-diff-report.json"
fi

should_fail="$(jq -r '.structuredContent.gate.shouldFail // false' "${ARTIFACTS_DIR}/scan-gate.json")"
decision="$(jq -r '.structuredContent.gate.decision // "unknown"' "${ARTIFACTS_DIR}/scan-gate.json")"

echo "== PantherEyes gate decision =="
echo "decision=${decision} shouldFail=${should_fail}"

if [[ "$should_fail" == "true" ]]; then
  echo "PantherEyes CI gate failed." >&2
  exit 1
fi

echo "PantherEyes CI gate passed."
