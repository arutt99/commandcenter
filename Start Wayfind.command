#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 22.12 or newer, then open this file again."
  read -r reply
  exit 1
fi
if [ ! -d node_modules ]; then npm ci || exit 1; fi
if ! node scripts/check-build.mjs; then npm run build || exit 1; fi
npm start
