#!/usr/bin/env bash
# Build a ChatGPT / Codex Plugin Directory ZIP from chatgpt-plugin/hamza-agent-hub
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/chatgpt-plugin/hamza-agent-hub"
OUT_DIR="$ROOT/chatgpt-plugin/release"
OUT_ZIP="$OUT_DIR/hamza-agent-hub-chatgpt-plugin.zip"

# Keep handoff inside the package for Codex
if [[ -f "$ROOT/CODEX-HANDOFF.md" ]]; then
  cp "$ROOT/CODEX-HANDOFF.md" "$SRC/CODEX-HANDOFF.md"
fi

test -f "$SRC/.codex-plugin/plugin.json" || {
  echo "missing $SRC/.codex-plugin/plugin.json" >&2
  exit 1
}
test -d "$SRC/skills" || {
  echo "missing skills/" >&2
  exit 1
}

mkdir -p "$OUT_DIR"
rm -f "$OUT_ZIP"

(
  cd "$ROOT/chatgpt-plugin"
  zip -qr "$OUT_ZIP" hamza-agent-hub \
    -x '*/.DS_Store' \
    -x '*/node_modules/*' \
    -x '*/.git/*'
)

echo "Packed: $OUT_ZIP"
unzip -l "$OUT_ZIP" | head -45
echo
python3 - "$OUT_ZIP" <<'PY'
import json, sys, zipfile
path = sys.argv[1]
with zipfile.ZipFile(path) as z:
    names = z.namelist()
    assert any(n.endswith('.codex-plugin/plugin.json') for n in names), names[:20]
    assert 'hamza-agent-hub/CODEX-HANDOFF.md' in names, 'handoff missing from zip'
    data = json.loads(z.read('hamza-agent-hub/.codex-plugin/plugin.json'))
    assert data['name'] == 'hamza-agent-hub'
    skills = [n for n in names if n.endswith('SKILL.md')]
    print('OK plugin', data['name'], data['version'], 'skills', len(skills), 'bytes', __import__('os').path.getsize(path))
PY

echo
echo "Raw ZIP (after push):"
echo "https://raw.githubusercontent.com/hamzachallenge3-dev/docs/cursor/hamza-agent-hub-plugin-838a/hamza-agent-hub/chatgpt-plugin/release/hamza-agent-hub-chatgpt-plugin.zip"
