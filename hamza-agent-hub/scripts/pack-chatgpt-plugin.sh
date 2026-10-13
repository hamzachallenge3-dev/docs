#!/usr/bin/env bash
# Build a ChatGPT / Codex Plugin Directory ZIP from chatgpt-plugin/hamza-agent-hub
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/chatgpt-plugin/hamza-agent-hub"
OUT_DIR="$ROOT/dist"
OUT_ZIP="$OUT_DIR/hamza-agent-hub-chatgpt-plugin.zip"

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

# ZIP must contain one plugin folder with .codex-plugin/plugin.json inside
(
  cd "$ROOT/chatgpt-plugin"
  zip -qr "$OUT_ZIP" hamza-agent-hub \
    -x '*/.DS_Store' \
    -x '*/node_modules/*' \
    -x '*/.git/*'
)

echo "Packed: $OUT_ZIP"
unzip -l "$OUT_ZIP" | head -40
echo
python3 - "$OUT_ZIP" <<'PY'
import json, sys, zipfile
path = sys.argv[1]
with zipfile.ZipFile(path) as z:
    names = z.namelist()
    assert any(n.endswith('.codex-plugin/plugin.json') for n in names), names[:20]
    data = json.loads(z.read('hamza-agent-hub/.codex-plugin/plugin.json'))
    assert data['name'] == 'hamza-agent-hub'
    assert data.get('skills')
    skills = [n for n in names if n.endswith('SKILL.md')]
    print('OK plugin', data['name'], data['version'], 'skills', len(skills))
PY

echo
echo "Upload this ZIP at https://platform.openai.com/plugins"
echo "Or paste CODEX-HANDOFF.md into Codex in ChatGPT to continue."
