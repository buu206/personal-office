#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ ! -x backend/.venv/bin/python ]; then
  echo '先按 README 创建 backend/.venv 并安装 backend/requirements.txt。' >&2
  exit 1
fi
bash scripts/check-upstream.sh build
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend test
backend/.venv/bin/python -m pytest -q backend/tests
printf '本地工程检查通过。以上使用测试替身，不调用真实模型、不产生模型费用。\n'
