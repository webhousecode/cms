#!/bin/bash
# Start cms-admin for the landing example site
# Stops any existing cms-admin instance on port 3010 first

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMS_ADMIN_DIR="$(cd "$SCRIPT_DIR/../../packages/cms-admin" && pwd)"

echo "→ Starting cms-admin for landing example..."
echo "  Config: $SCRIPT_DIR/cms.config.ts"
echo "  Admin:  http://localhost:3010/admin"

# Kill existing admin if running
lsof -i :3010 -t 2>/dev/null | xargs kill 2>/dev/null || true

cd "$CMS_ADMIN_DIR"

CMS_CONFIG_PATH="$SCRIPT_DIR/cms.config.ts" \
UPLOAD_DIR="$SCRIPT_DIR/public" \
CMS_DEV_MODE=true \
SCHEMA_EDIT_ENABLED=true \
pnpm dev
