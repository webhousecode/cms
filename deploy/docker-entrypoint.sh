#!/bin/sh
# docker-entrypoint.sh — Seeds CMS Demo site on first boot, then starts server.
#
# If /site is empty (no cms.config.ts), copies the bundled CMS Demo site
# so users get a working CMS with content immediately — zero config needed.

set -e

# Ensure admin-server data dir exists on persistent volume (fresh volumes
# come up empty). WEBHOUSE_DATA_DIR is set by the Dockerfile to /data/cms-admin.
if [ -n "${WEBHOUSE_DATA_DIR}" ]; then
  mkdir -p "${WEBHOUSE_DATA_DIR}/_data"
fi

# Security W41 H9 — never run with the public development signing key. If no
# CMS_JWT_SECRET is given, generate one once and keep it on the data volume so
# sessions survive restarts.
if [ -z "${CMS_JWT_SECRET}" ]; then
  SECRET_FILE="${WEBHOUSE_DATA_DIR:-/data/cms-admin}/_data/.jwt-secret"
  mkdir -p "$(dirname "$SECRET_FILE")"
  if [ ! -s "$SECRET_FILE" ]; then
    (umask 077; head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$SECRET_FILE")
  fi
  CMS_JWT_SECRET="$(cat "$SECRET_FILE")"
  export CMS_JWT_SECRET
fi

# Seed demo site if /site has no config
if [ ! -f /site/cms.config.ts ] && [ -d /app/seed/content ]; then
  echo ""
  echo "  ✦ First boot — seeding CMS Demo site..."
  cp /app/seed/cms.config.ts /site/cms.config.ts
  cp -r /app/seed/content /site/content
  echo "  ✓ CMS Demo site ready (18 documents, EN + DA)"
  echo "  ✓ Open http://localhost:${PORT:-3010} to get started"
  echo ""
fi

# Ensure @webhouse/cms is resolvable from /site (cms.config.ts imports it)
if [ ! -d /site/node_modules/@webhouse ]; then
  mkdir -p /site/node_modules/@webhouse
  ln -sf /app/packages/cms /site/node_modules/@webhouse/cms
fi

# Start CMS admin
exec node /app/packages/cms-admin/server.js
