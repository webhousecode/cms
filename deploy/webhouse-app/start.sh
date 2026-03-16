#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
CONFIG_PATH="$DATA_DIR/cms.config.ts"
CONTENT_DIR="$DATA_DIR/content"
UPLOADS_DIR="$DATA_DIR/uploads"

# ── Seed config + content on first boot ───────────────────────
mkdir -p "$CONTENT_DIR" "$UPLOADS_DIR"

if [ ! -f "$CONFIG_PATH" ]; then
  cp /seed/cms.config.ts "$CONFIG_PATH"
  echo "[start] cms.config.ts seeded (first boot)."
fi

# ── Start cms-admin ───────────────────────────────────────────
export CMS_CONFIG_PATH="$CONFIG_PATH"
export UPLOAD_DIR="$UPLOADS_DIR"
export PORT=3010
export HOSTNAME=0.0.0.0

echo "[start] Starting cms-admin on port 3010..."
exec node_modules/.bin/next start --hostname 0.0.0.0 --port 3010
