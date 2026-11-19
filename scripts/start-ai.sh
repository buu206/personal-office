#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
if [ ! -x .venv/bin/python ]; then echo '请先安装backend/requirements.txt中的项目依赖。' >&2; exit 1; fi
export OFFICE_AI_PORT="${1:-8780}"
if ! [[ "$OFFICE_AI_PORT" =~ ^[0-9]+$ ]] || [ "$OFFICE_AI_PORT" -lt 1024 ] || [ "$OFFICE_AI_PORT" -gt 65535 ]; then exit 2; fi
printf '宝可梦真实AI工作室：http://127.0.0.1:%s/（Ctrl+C停止）\n' "$OFFICE_AI_PORT"
exec .venv/bin/python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port "$OFFICE_AI_PORT" --no-access-log --log-level critical
