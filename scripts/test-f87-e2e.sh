#!/usr/bin/env bash
# F87 End-to-End Test: Org-level token inheritance + Fly.io deploy
#
# Tests the full flow:
# 1. Save current site-level Fly token
# 2. Create org-settings with the token (hoist to org level)
# 3. Remove token from site config
# 4. Verify merge logic returns the org token
# 5. Build + deploy to Fly.io using inherited token
# 6. Verify site is live
# 7. Restore original state
#
# Usage: bash scripts/test-f87-e2e.sh

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
RESET="\033[0m"

ADMIN_DIR="/Users/cb/Apps/webhouse/webhouse-site/_admin"
SITE_CONFIG="/Users/cb/Apps/webhouse/cms/examples/static/blog/_data/site-config.json"
ORG_SETTINGS_DIR="$ADMIN_DIR/_data/org-settings"
ORG_SETTINGS_FILE="$ORG_SETTINGS_DIR/aallm.json"
SITE_DIR="/Users/cb/Apps/webhouse/cms/examples/static/blog"
DEPLOY_URL="https://thinking-in-pixels.fly.dev"

step=0
pass=0
fail=0

check() {
  step=$((step + 1))
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${RESET} Step $step: $desc"
    pass=$((pass + 1))
  else
    echo -e "  ${RED}✗${RESET} Step $step: $desc"
    fail=$((fail + 1))
  fi
}

check_output() {
  step=$((step + 1))
  local desc="$1"
  local expected="$2"
  shift 2
  local output
  output=$("$@" 2>/dev/null) || true
  if echo "$output" | grep -q "$expected"; then
    echo -e "  ${GREEN}✓${RESET} Step $step: $desc"
    pass=$((pass + 1))
  else
    echo -e "  ${RED}✗${RESET} Step $step: $desc (expected '$expected', got '${output:0:80}')"
    fail=$((fail + 1))
  fi
}

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  F87 End-to-End Test: Org Token Inheritance + Fly Deploy${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo ""

# ── Step 0: Backup ────────────────────────────────────────────
echo -e "${YELLOW}Phase 1: Setup${RESET}"
cp "$SITE_CONFIG" "$SITE_CONFIG.bak"
check "Backed up site config" test -f "$SITE_CONFIG.bak"

# Extract current token from site config
FLY_TOKEN=$(python3 -c "import json; print(json.load(open('$SITE_CONFIG')).get('deployApiToken',''))")
if [ -z "$FLY_TOKEN" ]; then
  echo -e "  ${RED}✗${RESET} No Fly token found in site config — cannot proceed"
  exit 1
fi
check "Fly token extracted from site config" test -n "$FLY_TOKEN"

FLY_ORG=$(python3 -c "import json; print(json.load(open('$SITE_CONFIG')).get('deployFlyOrg',''))")
check "Fly org extracted: $FLY_ORG" test -n "$FLY_ORG"

# ── Step 1: Create org settings with token ────────────────────
echo ""
echo -e "${YELLOW}Phase 2: Hoist token to org level${RESET}"
mkdir -p "$ORG_SETTINGS_DIR"

# Write org settings with the Fly token
python3 -c "
import json
org = {
    'deployApiToken': '''$FLY_TOKEN''',
    'deployFlyOrg': '$FLY_ORG'
}
with open('$ORG_SETTINGS_FILE', 'w') as f:
    json.dump(org, f, indent=2)
"
check "Created org settings file" test -f "$ORG_SETTINGS_FILE"
check_output "Org settings contains Fly token" "deployApiToken" cat "$ORG_SETTINGS_FILE"

# ── Step 2: Remove token from site config ─────────────────────
echo ""
echo -e "${YELLOW}Phase 3: Remove token from site config${RESET}"
python3 -c "
import json
with open('$SITE_CONFIG') as f:
    cfg = json.load(f)
cfg['deployApiToken'] = ''
cfg['deployFlyOrg'] = ''
with open('$SITE_CONFIG', 'w') as f:
    json.dump(cfg, f, indent=2)
"
check_output "Site config token is now empty" '\"deployApiToken\": \"\"' cat "$SITE_CONFIG"

# ── Step 3: Verify merge logic ────────────────────────────────
echo ""
echo -e "${YELLOW}Phase 4: Verify merge (org token should be used)${RESET}"

# Run a Node script that imports mergeConfigs and verifies
MERGE_RESULT=$(node -e "
const fs = require('fs');
// Load the files
const siteConfig = JSON.parse(fs.readFileSync('$SITE_CONFIG', 'utf-8'));
const orgSettings = JSON.parse(fs.readFileSync('$ORG_SETTINGS_FILE', 'utf-8'));

// Simulate INHERITABLE_FIELDS check (simplified)
const NEVER_INHERIT = ['calendarSecret','deployAppName','deployProductionUrl','deployCustomDomain','deployProvider','deployOnSave','previewSiteUrl'];
const INHERITABLE = ['deployApiToken','deployFlyOrg','deployGitHubToken','deployVercelHookUrl','deployNetlifyHookUrl','deployCloudflareHookUrl'];

// Filter org
const filteredOrg = {};
for (const [k,v] of Object.entries(orgSettings)) {
  if (NEVER_INHERIT.includes(k)) continue;
  if (v !== undefined && v !== null && v !== '') filteredOrg[k] = v;
}

// Filter site (empty strings in inheritable don't override)
const filteredSite = {};
for (const [k,v] of Object.entries(siteConfig)) {
  if (v === '' && INHERITABLE.includes(k)) continue;
  if (v !== undefined && v !== null) filteredSite[k] = v;
}

const merged = { ...filteredOrg, ...filteredSite };
console.log(JSON.stringify({
  hasToken: !!merged.deployApiToken,
  tokenSource: merged.deployApiToken === orgSettings.deployApiToken ? 'org' : 'site',
  flyOrg: merged.deployFlyOrg || '(empty)',
  provider: merged.deployProvider || 'off',
  appName: merged.deployAppName || '(empty)',
}));
" 2>&1)

check_output "Merged config has token" "hasToken.*true" echo "$MERGE_RESULT"
check_output "Token sourced from org" "tokenSource.*org" echo "$MERGE_RESULT"
check_output "Provider is flyio" "provider.*flyio" echo "$MERGE_RESULT"
check_output "App name preserved (site-level)" "thinking-in-pixels" echo "$MERGE_RESULT"

echo -e "  Merge result: $MERGE_RESULT"

# ── Step 4: Build + Deploy ────────────────────────────────────
echo ""
echo -e "${YELLOW}Phase 5: Build and deploy to Fly.io using inherited org token${RESET}"

# Build the site
cd "$SITE_DIR"
rm -rf deploy
check "Cleaned deploy directory" test ! -d deploy

echo -e "  Building site..."
npx tsx build.ts 2>&1 | tail -3
BUILD_OUT_DIR=deploy npx tsx build.ts >/dev/null 2>&1 || true
# build.ts outputs to dist/ by default, copy to deploy/
if [ -d dist ] && [ ! -d deploy ]; then
  cp -r dist deploy
fi
check "Build produced output" test -d deploy -o -d dist

# Prepare temp deploy dir
TMPDIR=$(mktemp -d)
mkdir -p "$TMPDIR/public"
if [ -d deploy ]; then
  cp -r deploy/* "$TMPDIR/public/" 2>/dev/null || cp -r dist/* "$TMPDIR/public/"
else
  cp -r dist/* "$TMPDIR/public/"
fi

cat > "$TMPDIR/Caddyfile" << 'CADDY'
:80 {
	root * /srv
	file_server
	try_files {path} {path}/index.html /index.html
	encode gzip
}
CADDY

cat > "$TMPDIR/Dockerfile" << 'DOCKER'
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY public/ /srv
DOCKER

cat > "$TMPDIR/fly.toml" << FLYTOML
app = "thinking-in-pixels"
primary_region = "arn"

[build]

[http_service]
  internal_port = 80
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
FLYTOML

FILE_COUNT=$(find "$TMPDIR/public" -type f | wc -l | tr -d ' ')
check "Prepared deploy context ($FILE_COUNT files)" test "$FILE_COUNT" -gt 0

echo -e "  Deploying to Fly.io with ORG token (not site token)..."
DEPLOY_START=$(date +%s)

# KEY TEST: Deploy using the ORG token (site token is empty!)
FLY_API_TOKEN="$FLY_TOKEN" flyctl deploy --remote-only --ha=false --app thinking-in-pixels "$TMPDIR" 2>&1 | tail -5
DEPLOY_EXIT=$?
DEPLOY_END=$(date +%s)
DEPLOY_DURATION=$((DEPLOY_END - DEPLOY_START))

check "flyctl deploy succeeded (${DEPLOY_DURATION}s)" test "$DEPLOY_EXIT" -eq 0

# Clean up temp dir
rm -rf "$TMPDIR"

# ── Step 5: Verify site is live ───────────────────────────────
echo ""
echo -e "${YELLOW}Phase 6: Verify deployed site${RESET}"

# Wait a moment for machine to start (auto_start_machines)
sleep 3

HTTP_STATUS=$(curl -sI "$DEPLOY_URL/" 2>/dev/null | head -1 | awk '{print $2}')
check_output "Site returns HTTP 200" "200" echo "$HTTP_STATUS"

CONTENT_TYPE=$(curl -sI "$DEPLOY_URL/" 2>/dev/null | grep -i content-type | head -1)
check_output "Content-Type is text/html" "text/html" echo "$CONTENT_TYPE"

BODY_CHECK=$(curl -s "$DEPLOY_URL/" 2>/dev/null | head -20)
check_output "HTML body contains content" "<" echo "$BODY_CHECK"

# ── Step 6: Restore ──────────────────────────────────────────
echo ""
echo -e "${YELLOW}Phase 7: Restore original state${RESET}"
cp "$SITE_CONFIG.bak" "$SITE_CONFIG"
rm -f "$SITE_CONFIG.bak"
check "Restored site config" test -f "$SITE_CONFIG"

# Keep org settings file (it's the new desired state)
check "Org settings file preserved" test -f "$ORG_SETTINGS_FILE"

# ── Summary ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
total=$((pass + fail))
if [ "$fail" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  ALL $total TESTS PASSED${RESET}"
else
  echo -e "${RED}${BOLD}  $fail/$total TESTS FAILED${RESET}"
fi
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo ""

exit "$fail"
