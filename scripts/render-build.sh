#!/usr/bin/env bash
set -euo pipefail
npm ci --include=dev
python3 scripts/setup-native.py
npm run build --workspace apps/api
node scripts/start-native.mjs --check
