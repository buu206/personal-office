#!/usr/bin/env bash
set -euo pipefail
PRODUCT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8769}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then
  echo '端口应为1024–65535的整数。' >&2; exit 2
fi
node "$PRODUCT_ROOT/frontend/build.mjs"
printf '个人办公室 · 宝可梦草地工作营（按 Ctrl+C 停止）\n'
printf '打开：http://127.0.0.1:%s/\n' "$PORT"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$PRODUCT_ROOT/frontend/dist"
