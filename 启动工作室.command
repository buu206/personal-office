#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! [ -x backend/.venv/bin/python ]; then
  echo '缺少项目Python环境，请按README安装backend/requirements.txt。'
  exit 1
fi
node frontend/build.mjs || exit 1
if /usr/bin/curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:8780/api/v1/health >/dev/null 2>&1; then
  echo '工作室已在本机运行，正在打开。更换密钥后请先停止原服务再启动。'
  /usr/bin/open http://127.0.0.1:8780/
  exit 0
fi
(
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if /usr/bin/curl --noproxy '*' -fsS --max-time 1 http://127.0.0.1:8780/api/v1/health >/dev/null 2>&1; then
      /usr/bin/open http://127.0.0.1:8780/
      break
    fi
    sleep 0.5
  done
) &
exec bash scripts/start-ai.sh
