#!/bin/sh
# docker-entrypoint.sh — Seeds CMS Demo site on first boot, then starts server.
#
# If /site is empty (no cms.config.ts), copies the bundled CMS Demo site
# so users get a working CMS with content immediately — zero config needed.

set -e

# Seed demo site if /site has no config
if [ ! -f /site/cms.config.ts ] && [ -d /app/seed/content ]; then
  echo ""
  echo "  ✦ First boot — seeding CMS Demo site..."
  cp /app/seed/cms.config.ts /site/cms.config.ts
  cp -r /app/seed/content /site/content
  cp -r /app/seed/_data /site/_data 2>/dev/null || true
  echo "  ✓ CMS Demo site ready (18 documents, EN + DA)"
  echo "  ✓ Open http://localhost:${PORT:-3010} to get started"
  echo ""
fi

# Start CMS admin
exec node /app/packages/cms-admin/server.js
