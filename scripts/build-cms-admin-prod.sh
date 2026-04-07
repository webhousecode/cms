#!/bin/bash
# Build cms-admin in production mode (Next.js standalone).
# Output: packages/cms-admin/.next/standalone/
#
# Usage:
#   bash scripts/build-cms-admin-prod.sh           # build only
#   bash scripts/build-cms-admin-prod.sh --restart # build + restart PM2 process
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_DIR="$REPO_DIR/packages/cms-admin"
LOG_FILE="$REPO_DIR/.cms-admin-prod-build.log"

cd "$ADMIN_DIR"

echo "[$(date '+%H:%M:%S')] Building cms-admin (standalone)..." | tee -a "$LOG_FILE"
START=$(date +%s)

if pnpm build >> "$LOG_FILE" 2>&1; then
  END=$(date +%s)
  echo "[$(date '+%H:%M:%S')] Build OK ($((END-START))s)" | tee -a "$LOG_FILE"
else
  echo "[$(date '+%H:%M:%S')] Build FAILED — see $LOG_FILE" | tee -a "$LOG_FILE"
  exit 1
fi

# Standalone output excludes public/ and .next/static — copy them in
STANDALONE_DIR="$ADMIN_DIR/.next/standalone/packages/cms-admin"
cp -r "$ADMIN_DIR/public" "$STANDALONE_DIR/" 2>/dev/null || true
cp -r "$ADMIN_DIR/.next/static" "$STANDALONE_DIR/.next/" 2>/dev/null || true

# Copy .env.local so standalone server gets the same config as dev
cp "$ADMIN_DIR/.env.local" "$STANDALONE_DIR/.env.local" 2>/dev/null || true

if [[ "${1:-}" == "--restart" ]]; then
  echo "[$(date '+%H:%M:%S')] Restarting PM2 process cms-admin-prod..." | tee -a "$LOG_FILE"
  pnpm dlx pm2 restart cms-admin-prod >> "$LOG_FILE" 2>&1 || \
    pnpm dlx pm2 start "$REPO_DIR/ecosystem.config.js" --only cms-admin-prod >> "$LOG_FILE" 2>&1
  echo "[$(date '+%H:%M:%S')] Restart OK" | tee -a "$LOG_FILE"
fi
