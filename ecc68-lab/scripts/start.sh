#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  npm install
fi

if [[ ! -f dist/index.js ]]; then
  npm run build
fi

export ECC68_TRANSPORT="${ECC68_TRANSPORT:-stdio}"
export ECC68_CONCURRENCY="${ECC68_CONCURRENCY:-2}"
export ECC68_DATA_DIR="${ECC68_DATA_DIR:-$ROOT/data}"
export ECC68_WORKSPACES_DIR="${ECC68_WORKSPACES_DIR:-$ROOT/workspaces}"

# Free OpenAI-compatible endpoint only — never invent paid calls.
# If unset, live model is BLOCKED and heuristic executor is used.
# export ECC68_MODEL_URL="http://127.0.0.1:11434/v1"
# export ECC68_MODEL_NAME="llama3.2"
# export ECC68_MODEL_API_KEY=""

if [[ "$ECC68_TRANSPORT" == "http" ]]; then
  if [[ -z "${ECC68_AUTH_TOKEN:-}" ]]; then
    echo "ECC68_AUTH_TOKEN is required for HTTP transport" >&2
    exit 1
  fi
  export ECC68_HOST="${ECC68_HOST:-127.0.0.1}"
  export ECC68_PORT="${ECC68_PORT:-8787}"
  echo "Starting ECC68 Streamable HTTP on http://${ECC68_HOST}:${ECC68_PORT}/mcp" >&2
fi

exec node --experimental-sqlite "$ROOT/dist/index.js"
