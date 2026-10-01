#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$ROOT"
if [ ! -d node_modules/vite ]; then
  npm install
fi
if [ ! -d src/routes ]; then
  echo "Falta src/routes. Restaurando desde git..."
  git checkout HEAD -- src/routes
fi
if [ ! -f src/routes/index.tsx ]; then
  echo "src/routes no está en esta copia. Sin esa carpeta el mapa no arranca."
  exit 1
fi
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  echo "Ya responde en http://127.0.0.1:8080/"
  exit 0
fi
if command -v ss >/dev/null 2>&1 && ss -ltn | grep -q ':8080 '; then
  echo "El puerto 8080 está ocupado y no responde. Ciérralo con: fuser -k 8080/tcp"
  exit 1
fi
echo "Arrancando en http://127.0.0.1:8080/  (log: /tmp/app-startup.log)"
npm run dev >>/tmp/app-startup.log 2>&1 &
