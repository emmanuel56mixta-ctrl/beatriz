#!/bin/zsh
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
PY="/usr/local/bin/python3.11"
if [ ! -x "$PY" ]; then
  echo "Beatris necesita Python 3.11 para ADN Lab. Instálalo con: brew install python@3.11"
  read -k 1 "?Pulsa una tecla para cerrar…"
  exit 1
fi
if [ ! -d .analyzer-venv ]; then
  "$PY" -m venv .analyzer-venv
fi
source .analyzer-venv/bin/activate
python -m pip install -q --upgrade pip
python -m pip install -q -r analyzer/requirements.txt
if ! python -c 'import demucs' >/dev/null 2>&1; then
  echo "Nota: ADN Lab funciona; para stems ejecuta analyzer/install-stems.command una vez."
fi
python -m uvicorn analyzer.app.main:app --host 127.0.0.1 --port 8765 > /tmp/beatris-analyzer.log 2>&1 &
ANALYZER_PID=$!
trap 'kill $ANALYZER_PID 2>/dev/null || true' EXIT
if [ ! -d node_modules ]; then npm install; fi
npm run dev -- --host 127.0.0.1
