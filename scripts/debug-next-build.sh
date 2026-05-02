#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/regis/sistema-delivery-futuro/apps/frontend"
LOG_FILE=${1:-"/tmp/next-build-debug-$(date +%Y%m%dT%H%M%S).log"}

{
  echo "› $(date) – running debug build inside ${ROOT_DIR}"
  echo "› log will be captured at ${LOG_FILE}"
  echo ""
  echo "› compiling TypeScript to make sure the type-check phase is clean"
  cd "$ROOT_DIR"
  npx tsc --pretty
  echo ""
  echo "› launching Next.js build with verbose diagnostics"
  NEXT_TELEMETRY_DISABLED=1 \
    NEXT_VERBOSE_ERRORS=1 \
    NEXT_BUILD_WORKER=false \
    NODE_OPTIONS="--trace-warnings --trace-uncaught --max-old-space-size=4096" \
    npx next build
} | tee "$LOG_FILE"

echo "› build finished (exit code captured above)."
