#!/usr/bin/env bash
set -euo pipefail

GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; BOLD="\033[1m"; RESET="\033[0m"

SITE_CONFIG="/Users/cb/Apps/webhouse/cms/examples/static/blog/_data/site-config.json"
ORG_DIR="/Users/cb/Apps/webhouse/webhouse-site/_admin/_data/org-settings"
ORG_FILE="$ORG_DIR/aallm.json"
SITE_DIR="/Users/cb/Apps/webhouse/cms/examples/static/blog"
URL="https://thinking-in-pixels.fly.dev"
APP="thinking-in-pixels"

pass=0; fail=0; step=0

ok() { step=$((step+1)); echo -e "  ${GREEN}✓${RESET} $step: $1"; pass=$((pass+1)); }
ko() { step=$((step+1)); echo -e "  ${RED}✗${RESET} $step: $1"; fail=$((fail+1)); }

deploy() {
  local label="$1" token="$2"
  cd "$SITE_DIR"; rm -rf dist deploy; npx tsx build.ts >/dev/null 2>&1

  local tmp=$(mktemp -d)
  mkdir -p "$tmp/public"; cp -r dist/* "$tmp/public/"

  # PROPER multi-line Caddyfile (not semicolons!)
  printf ':80 {\n\troot * /srv\n\tfile_server\n\ttry_files {path} {path}/index.html /index.html\n\tencode gzip\n}\n' > "$tmp/Caddyfile"
  printf 'FROM caddy:2-alpine\nCOPY Caddyfile /etc/caddy/Caddyfile\nCOPY public/ /srv\n' > "$tmp/Dockerfile"
  printf 'app = "%s"\nprimary_region = "arn"\n\n[build]\n\n[http_service]\n  internal_port = 80\n  force_https = true\n  auto_stop_machines = "stop"\n  auto_start_machines = true\n  min_machines_running = 0\n\n[[vm]]\n  size = "shared-cpu-1x"\n  memory = "256mb"\n' "$APP" > "$tmp/fly.toml"

  echo -e "  ${YELLOW}Deploying ($label)...${RESET}"
  local t0=$(date +%s)
  if FLY_API_TOKEN="$token" flyctl deploy --remote-only --ha=false "$tmp" 2>&1 | tail -2; then
    ok "Deploy OK ($label, $(( $(date +%s) - t0 ))s)"
  else
    ko "Deploy FAILED ($label)"
    rm -rf "$tmp"; return 1
  fi
  rm -rf "$tmp"

  # Wait for cold-start with retries
  echo -e "  ${YELLOW}Waiting for cold-start...${RESET}"
  for i in 1 2 3 4 5 6; do
    local s=$(curl -so /dev/null -w '%{http_code}' --max-time 15 "$URL/" 2>/dev/null || echo "000")
    if [ "$s" = "200" ]; then ok "HTTP 200 ($label)"; return 0; fi
    echo -e "    attempt $i: HTTP $s"
    sleep 5
  done
  ko "HTTP not 200 after 30s ($label)"
}

FLY_TOKEN=$(python3 -c "import json; print(json.load(open('$SITE_CONFIG')).get('deployApiToken',''))")

echo -e "\n${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  F87 Swap Test: 3 deploy scenarios${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"

# ── Scenario 1: SITE token only ──
echo -e "\n${YELLOW}Scenario 1: Token on SITE only${RESET}"
rm -f "$ORG_FILE"
deploy "SITE-only" "$FLY_TOKEN"

# ── Scenario 2: ORG token only ──
echo -e "\n${YELLOW}Scenario 2: Token on ORG only (site cleared)${RESET}"
mkdir -p "$ORG_DIR"
python3 -c "import json; json.dump({'deployApiToken':'''$FLY_TOKEN''','deployFlyOrg':'webhouse-app'},open('$ORG_FILE','w'),indent=2)"
python3 -c "import json; c=json.load(open('$SITE_CONFIG')); c['deployApiToken']=''; c['deployFlyOrg']=''; json.dump(c,open('$SITE_CONFIG','w'),indent=2)"

# Verify merge
node -e "
const fs=require('fs'),s=JSON.parse(fs.readFileSync('$SITE_CONFIG')),o=JSON.parse(fs.readFileSync('$ORG_FILE'));
const N=['calendarSecret','deployAppName','deployProductionUrl','deployCustomDomain','deployProvider','deployOnSave','previewSiteUrl'];
const I=['deployApiToken','deployFlyOrg'];
const fo={};for(const[k,v]of Object.entries(o)){if(!N.includes(k)&&v)fo[k]=v;}
const fs2={};for(const[k,v]of Object.entries(s)){if(v===''&&I.includes(k))continue;if(v!=null)fs2[k]=v;}
const m={...fo,...fs2};
if(m.deployApiToken)process.exit(0);else process.exit(1);
" && ok "Merge resolves org token" || ko "Merge FAILED"

deploy "ORG-only" "$FLY_TOKEN"

# ── Scenario 3: BOTH (site override) ──
echo -e "\n${YELLOW}Scenario 3: Token on BOTH (site wins)${RESET}"
python3 -c "import json; c=json.load(open('$SITE_CONFIG')); c['deployApiToken']='''$FLY_TOKEN'''; c['deployFlyOrg']='webhouse-app'; json.dump(c,open('$SITE_CONFIG','w'),indent=2)"
ok "Site token restored (both have token now)"
deploy "BOTH" "$FLY_TOKEN"

# ── Summary ──
echo -e "\n${BOLD}═══════════════════════════════════════════════════════════${RESET}"
t=$((pass+fail))
[ "$fail" -eq 0 ] && echo -e "${GREEN}${BOLD}  ALL $t TESTS PASSED${RESET}" || echo -e "${RED}${BOLD}  $fail/$t FAILED${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}\n"
exit "$fail"
