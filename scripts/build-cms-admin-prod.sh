#!/bin/bash
# Build cms-admin in production mode (regular `next build`).
# PM2 runs `next start --port 4010` from packages/cms-admin/ so it has
# full node_modules access — no standalone copy/symlink needed.
#
# Standalone mode is ONLY used inside the Dockerfile for minimal image
# size. Locally we use the regular build because jiti needs the full
# monorepo deps to resolve cms.config.ts from non-TS framework sites
# (Django, .NET, PHP, etc.).
#
# Usage:
#   bash scripts/build-cms-admin-prod.sh            # build only
#   bash scripts/build-cms-admin-prod.sh --restart   # build + restart PM2
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_DIR="$REPO_DIR/packages/cms-admin"
LOG_FILE="$REPO_DIR/.cms-admin-prod-build.log"

cd "$ADMIN_DIR"

echo "[$(date '+%H:%M:%S')] Building cms-admin (production)..." | tee -a "$LOG_FILE"
START=$(date +%s)

if pnpm build >> "$LOG_FILE" 2>&1; then
  END=$(date +%s)
  echo "[$(date '+%H:%M:%S')] Build OK ($((END-START))s)" | tee -a "$LOG_FILE"
else
  echo "[$(date '+%H:%M:%S')] Build FAILED — see $LOG_FILE" | tee -a "$LOG_FILE"
  exit 1
fi

if [[ "${1:-}" == "--restart" ]]; then
  echo "[$(date '+%H:%M:%S')] Restarting PM2 process cms-admin-prod..." | tee -a "$LOG_FILE"
  pm2 restart cms-admin-prod >> "$LOG_FILE" 2>&1 || \
    npx pm2 restart cms-admin-prod >> "$LOG_FILE" 2>&1 || \
    npx pm2 start "$REPO_DIR/ecosystem.config.js" --only cms-admin-prod >> "$LOG_FILE" 2>&1
  echo "[$(date '+%H:%M:%S')] Restart OK" | tee -a "$LOG_FILE"
fi
