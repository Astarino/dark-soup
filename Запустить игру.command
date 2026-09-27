#!/bin/bash
set -e
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then
  exec node scripts/serve.js --open
elif command -v python3 >/dev/null 2>&1; then
  (sleep 1; open "http://localhost:5173") &
  exec python3 -m http.server 5173 --bind 127.0.0.1
else
  echo 'Для запуска нужен Node.js 22+ или Python 3. См. README.md.'
  read -r -p 'Нажмите Enter для выхода.'
fi
