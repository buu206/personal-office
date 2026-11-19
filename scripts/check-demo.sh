#!/usr/bin/env bash
set -euo pipefail
PRODUCT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOL_ROOT="$PRODUCT_ROOT/upstream/solo-to-team-skills/mas/release/current/overlay"
MODE="${1:-all}"
case "$MODE" in all|tests|build) ;; *) echo 'Usage: check-demo.sh [all|tests|build]' >&2; exit 2;; esac
if [ "$MODE" != tests ]; then
  bash "$PRODUCT_ROOT/scripts/check-upstream.sh" build
  for f in "$PRODUCT_ROOT/frontend/"*.mjs; do node --check "$f"; done
  node "$PRODUCT_ROOT/frontend/build.mjs"
fi
if [ "$MODE" != build ]; then
  if [ -f "$PRODUCT_ROOT/../../kit.sh" ]; then python3 "$PRODUCT_ROOT/scripts/tests/verification-gate.py"; else printf '独立仓库：工具包专属闸门不适用，继续工程测试。\n'; fi
  node --test --test-reporter=tap "$PRODUCT_ROOT/frontend/tests/"*.test.mjs \
    "$PRODUCT_ROOT/scripts/tests/file-roundtrip.test.mjs" \
    "$TOOL_ROOT/team-16/tests/"*.test.mjs \
    "$TOOL_ROOT/start-with-files/source/tests/"*.test.mjs \
    "$TOOL_ROOT/update-team/source/tests/"*.test.mjs
fi
