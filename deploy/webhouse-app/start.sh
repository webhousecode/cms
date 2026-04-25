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

# ── Wire up Next.js standalone output ─────────────────────────
# `output: "standalone"` in next.config.ts produces a self-contained
# server.js but does NOT bundle static assets or public/. The standalone
# server resolves them relative to itself, so symlink them in.
STANDALONE_DIR="/app/packages/cms-admin/.next/standalone/packages/cms-admin"
if [ -d "$STANDALONE_DIR" ]; then
  ln -sfn /app/packages/cms-admin/.next/static "$STANDALONE_DIR/.next/static"
  ln -sfn /app/packages/cms-admin/public       "$STANDALONE_DIR/public"
fi

# ── Start cms-admin ───────────────────────────────────────────
export CMS_CONFIG_PATH="$CONFIG_PATH"
export UPLOAD_DIR="$UPLOADS_DIR"
export PORT=3010
export HOSTNAME=0.0.0.0

echo "[start] Starting cms-admin (standalone) on port 3010..."
exec node /app/packages/cms-admin/.next/standalone/packages/cms-admin/server.js
