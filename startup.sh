#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$ROOT"
if [ ! -d node_modules/vite ]; then
  npm install
fi
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  echo "Ya responde en http://127.0.0.1:8080/"
  exit 0
fi
echo "Arrancando en http://127.0.0.1:8080/  (log: /tmp/app-startup.log)"
npm run dev >>/tmp/app-startup.log 2>&1 &
