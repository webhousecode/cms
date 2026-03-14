#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
CONTENT_DIR="$DATA_DIR/content"
UPLOADS_DIR="$DATA_DIR/uploads"
CONFIG_PATH="$DATA_DIR/cms.config.ts"

# ── Volume seed / sync ──────────────────────────────────────────
# Always sync content-seed → /data/content so new content in image is deployed.
# Existing files on the volume are OVERWRITTEN (image is source of truth for seeded content).
# Content written via admin (new posts etc.) is preserved because admin writes to /data/content.
mkdir -p "$CONTENT_DIR" "$UPLOADS_DIR"

if [ -d "/app/webhouse-site/content-seed" ]; then
  cp -r /app/webhouse-site/content-seed/. "$CONTENT_DIR/"
  echo "[start] Content synced from image."
fi

if [ ! -f "$CONFIG_PATH" ]; then
  cp /app/webhouse-site/cms.config.ts "$CONFIG_PATH"
  echo "[start] cms.config.ts seeded (first boot)."
fi

# ── Start webhouse-site ─────────────────────────────────────────
export CONTENT_DIR="$CONTENT_DIR"
export PORT=3000
export HOSTNAME=0.0.0.0
(cd /app/webhouse-site && node_modules/.bin/next start --hostname 0.0.0.0 --port 3000) &
SITE_PID=$!
echo "[start] webhouse-site started (pid $SITE_PID)"

# ── Start cms-admin ─────────────────────────────────────────────
export CMS_CONFIG_PATH="$CONFIG_PATH"
export UPLOAD_DIR="$UPLOADS_DIR"
export PORT=3010
(cd /app/cms/packages/cms-admin && node_modules/.bin/next start --hostname 0.0.0.0 --port 3010) &
ADMIN_PID=$!
echo "[start] cms-admin started (pid $ADMIN_PID)"

# ── Forward SIGTERM to children ─────────────────────────────────
trap "kill $SITE_PID $ADMIN_PID 2>/dev/null; exit 0" TERM INT

wait $SITE_PID $ADMIN_PID
