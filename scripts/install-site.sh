#!/usr/bin/env bash
#
# Install a static site into the CMS admin registry.
#
# Usage:
#   bash scripts/install-site.sh <site-dir> [site-name]
#
# Example:
#   bash scripts/install-site.sh examples/static/portfolio-squared "Elina Voss Portfolio"
#
# What it does:
#   1. Validates cms.config.ts and content/ exist
#   2. Adds the site to _admin/registry.json
#   3. Creates _data/team.json with the current admin user
#   4. Reports success
#

set -euo pipefail

# ── Args ──────────────────────────────────────────────────
SITE_DIR="${1:?Usage: install-site.sh <site-dir> [site-name]}"
SITE_DIR="$(cd "$SITE_DIR" && pwd)"  # absolute path

SITE_NAME="${2:-$(basename "$SITE_DIR")}"
SITE_ID="$(echo "$SITE_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-\|-$//g')"

# ── Registry location ────────────────────────────────────
REGISTRY=""
for candidate in \
  "${CMS_CONFIG_PATH:+$(dirname "$(realpath "${CMS_CONFIG_PATH}")")/_admin/registry.json}" \
  "$HOME/Apps/webhouse/webhouse-site/_admin/registry.json"; do
  if [[ -f "$candidate" ]]; then
    REGISTRY="$candidate"
    break
  fi
done

if [[ -z "$REGISTRY" ]]; then
  echo "ERROR: Cannot find registry.json. Set CMS_CONFIG_PATH or check path."
  exit 1
fi

# ── Validate site ─────────────────────────────────────────
CONFIG_FILE="$SITE_DIR/cms.config.ts"
CONTENT_DIR="$SITE_DIR/content"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: $CONFIG_FILE not found"
  exit 1
fi

if [[ ! -d "$CONTENT_DIR" ]]; then
  echo "ERROR: $CONTENT_DIR not found"
  exit 1
fi

# Check content dirs have JSON files
EMPTY_COLLECTIONS=()
for dir in "$CONTENT_DIR"/*/; do
  if [[ -d "$dir" ]]; then
    count=$(find "$dir" -maxdepth 1 -name "*.json" | wc -l | tr -d ' ')
    if [[ "$count" -eq 0 ]]; then
      EMPTY_COLLECTIONS+=("$(basename "$dir")")
    fi
  fi
done

if [[ ${#EMPTY_COLLECTIONS[@]} -gt 0 ]]; then
  echo "WARNING: Empty collections (no .json files): ${EMPTY_COLLECTIONS[*]}"
fi

# ── Check for duplicates ─────────────────────────────────
if grep -q "\"id\": \"$SITE_ID\"" "$REGISTRY" 2>/dev/null; then
  echo "ERROR: Site '$SITE_ID' already exists in registry"
  exit 1
fi

# ── Find admin user ID ────────────────────────────────────
# Look for the first admin user in any existing team.json
ADMIN_USER_ID=""
for team_file in "$(dirname "$REGISTRY")/../_data/team.json" \
                 "$(dirname "$(dirname "$REGISTRY")")/_data/team.json"; do
  if [[ -f "$team_file" ]]; then
    ADMIN_USER_ID=$(python3 -c "
import json, sys
with open('$team_file') as f:
    members = json.load(f)
for m in members:
    if m.get('role') == 'admin':
        print(m['userId'])
        sys.exit(0)
" 2>/dev/null || true)
    if [[ -n "$ADMIN_USER_ID" ]]; then break; fi
  fi
done

if [[ -z "$ADMIN_USER_ID" ]]; then
  echo "ERROR: Cannot find admin user ID from existing team.json files"
  exit 1
fi

# ── Add to registry ───────────────────────────────────────
python3 -c "
import json, sys

registry_path = '$REGISTRY'
with open(registry_path) as f:
    registry = json.load(f)

new_site = {
    'id': '$SITE_ID',
    'name': '$SITE_NAME',
    'adapter': 'filesystem',
    'configPath': '$CONFIG_FILE',
    'contentDir': '$CONTENT_DIR'
}

# Add to first org
registry['orgs'][0]['sites'].append(new_site)

with open(registry_path, 'w') as f:
    json.dump(registry, f, indent=2)

print(f'Added to registry: {new_site[\"name\"]} (id: {new_site[\"id\"]})')
"

# ── Create team.json ──────────────────────────────────────
DATA_DIR="$SITE_DIR/_data"
mkdir -p "$DATA_DIR"
cat > "$DATA_DIR/team.json" << TEAMEOF
[
  {
    "userId": "$ADMIN_USER_ID",
    "role": "admin",
    "addedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  }
]
TEAMEOF

echo "Created team.json with admin user"

# ── Summary ───────────────────────────────────────────────
echo ""
echo "✓ Site installed successfully!"
echo "  Name:    $SITE_NAME"
echo "  ID:      $SITE_ID"
echo "  Config:  $CONFIG_FILE"
echo "  Content: $CONTENT_DIR"
echo ""
echo "Reload CMS admin to see it."
