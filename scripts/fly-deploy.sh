#!/bin/bash
# Deploy webhouse-cms to Fly.io (arn/Stockholm)
# Run from cms-engine/ directory: ./scripts/fly-deploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBHOUSE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"  # /Users/cb/Apps/webhouse/

echo "→ Building and deploying webhouse-cms to Fly.io (arn)..."
echo "  Build context: $WEBHOUSE_DIR"

cd "$WEBHOUSE_DIR"

fly deploy \
  --app webhouse-cms \
  --config fly.toml \
  --dockerfile Dockerfile.cms \
  "$@"

echo ""
echo "✓ Deployed"
echo "  Site:  https://webhouse-cms.fly.dev/"
echo "  Admin: https://webhouse-cms.fly.dev:3010/admin"
