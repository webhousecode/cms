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

# ── Make @webhouse/cms resolvable from the data dir ───────────
# cms.config.ts (lives at $DATA_DIR/cms.config.ts) does
# `import "@webhouse/cms"`. Node's module resolver walks up from that
# file's location, NOT from the standalone server's CWD — so we need
# a node_modules entry under $DATA_DIR. Symlink to /app/packages/cms
# (NOT the standalone copy) because the workspace package keeps its
# own node_modules with hono/zod/nanoid/drizzle/marked/better-sqlite3.
#
# rm-then-ln (instead of `ln -sfn`) because the symlink survives across
# deploys on the persistent volume. BusyBox `ln -f` doesn't always
# replace symlinks pointing into directories — observed crash on Fly:
# `ln: /data/node_modules/@webhouse/cms: File exists` → exit 1 → boot loop.
mkdir -p "$DATA_DIR/node_modules/@webhouse"
rm -f "$DATA_DIR/node_modules/@webhouse/cms"
ln -s /app/packages/cms "$DATA_DIR/node_modules/@webhouse/cms"

# ── Defensive ownership-audit ─────────────────────────────────
# nextjs uid=1001 owns the volume by design (Dockerfile chowns /data).
# If anyone copies files in via `flyctl ssh sftp put` (which runs as
# root), those files end up uid=0 and every ContentService write
# silently fails EACCES. Same problem hit sanneandersen-site 2026-05-19:
# 6 of 141 ICD pushes failed for root-owned files until we manually
# chown'ed them. We can't chown here (start.sh runs as nextjs), but
# logging at boot makes the drift discoverable before it causes
# mysterious "edits don't save" tickets.
bad=$(find "$DATA_DIR" -type f ! -uid 1001 2>/dev/null | wc -l)
if [ "$bad" -gt 0 ]; then
  echo "[start] WARN: $bad files in $DATA_DIR not owned by nextjs (uid=1001) — writes will EACCES"
  find "$DATA_DIR" -type f ! -uid 1001 2>/dev/null | head -20 | while read -r f; do
    echo "[start] WARN:   not-nextjs: $f"
  done
fi

# ── Start cms-admin ───────────────────────────────────────────
export CMS_CONFIG_PATH="$CONFIG_PATH"
export UPLOAD_DIR="$UPLOADS_DIR"
export PORT=3010
export HOSTNAME=0.0.0.0

echo "[start] Starting cms-admin (standalone) on port 3010..."
exec node /app/packages/cms-admin/.next/standalone/packages/cms-admin/server.js
