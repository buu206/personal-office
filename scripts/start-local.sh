#!/usr/bin/env bash
set -euo pipefail
PRODUCT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOL_ROOT="$PRODUCT_ROOT/upstream/solo-to-team-skills/mas/release/current/overlay"
PORT="${1:-8768}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then
  printf '端口应为 1024–65535 的整数。\n' >&2
  exit 2
fi
if [ ! -f "$TOOL_ROOT/team-16/index.html" ]; then
  printf '未找到离线工具，请检查 upstream/solo-to-team-skills 的导入记录。\n' >&2
  exit 1
fi
printf '个人办公室本地工具（按 Ctrl+C 停止）\n'
printf '团队配置：http://127.0.0.1:%s/team-16/index.html\n' "$PORT"
printf '带底稿开工：http://127.0.0.1:%s/start-with-files/index.html\n' "$PORT"
printf '团队更新：http://127.0.0.1:%s/update-team/index.html\n' "$PORT"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$TOOL_ROOT"
