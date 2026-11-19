#!/usr/bin/env bash
set -euo pipefail
PRODUCT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOL_ROOT="$PRODUCT_ROOT/upstream/solo-to-team-skills/mas/release/current/overlay"
MODE="${1:-all}"
case "$MODE" in all|build|tests) ;; *) echo "Usage: check-upstream.sh [all|build|tests]" >&2; exit 2;; esac
BUILD_TMP="$(mktemp -d "${TMPDIR:-/tmp}/personal-office-build.XXXXXX")"
trap 'rm -rf "$BUILD_TMP"' EXIT

if [ "$MODE" != tests ]; then
python3 - "$PRODUCT_ROOT/upstream" <<'PY'
import hashlib, json, sys
from pathlib import Path
root = Path(sys.argv[1])
manifest = json.loads((root / 'source-manifest.json').read_text())
assert not manifest['errors'], 'Import is incomplete'
for entry in manifest['files']:
    data = (root / 'solo-to-team-skills' / entry['path']).read_bytes()
    assert hashlib.sha256(data).hexdigest() == entry['sha256'], entry['path']
print('上游源码完整性：%d/%d 文件匹配固定提交 %s' % (len(manifest['files']), manifest['file_count'], manifest['commit']))
PY

while IFS= read -r -d '' f; do node --check "$f" >/dev/null; done < <(find "$TOOL_ROOT" -type f \( -name '*.js' -o -name '*.mjs' \) -print0)
node "$TOOL_ROOT/team-16/source/build.mjs" "$BUILD_TMP/team-16.html"
node "$TOOL_ROOT/team-16/source/build.mjs" --check
node "$TOOL_ROOT/start-with-files/source/build.mjs" "$BUILD_TMP/start-with-files.html"
cmp "$BUILD_TMP/start-with-files.html" "$TOOL_ROOT/start-with-files/index.html"
node "$TOOL_ROOT/update-team/source/build.mjs" "$BUILD_TMP/update-team.html"
cmp "$BUILD_TMP/update-team.html" "$TOOL_ROOT/update-team/index.html"
printf '三个离线工具重建与上游HTML逐字节一致。\n'

fi
if [ "$MODE" != build ]; then
if [ -f "$PRODUCT_ROOT/../../kit.sh" ]; then
  python3 "$PRODUCT_ROOT/scripts/tests/verification-gate.py"
else
  printf '独立仓库：工具包专属闸门不适用，继续工程测试。\n'
fi
node --test --test-reporter=tap "$TOOL_ROOT/team-16/tests/"*.test.mjs \
  "$TOOL_ROOT/start-with-files/source/tests/"*.test.mjs \
  "$TOOL_ROOT/update-team/source/tests/"*.test.mjs \
  "$PRODUCT_ROOT/scripts/tests/file-roundtrip.test.mjs"
fi
