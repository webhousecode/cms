#!/usr/bin/env bash
# pm2-ports.sh — `pm2 list` plus a PORT column.
#
# PM2's built-in `pm2 list` doesn't show the PORT each app binds to.
# This wrapper parses `pm2 jlist` (the JSON output) and prints a table
# with name, port, status, cpu, mem, pid.
#
# Usage:
#   bash scripts/pm2-ports.sh
#   ./scripts/pm2-ports.sh    # if executable
#
# Recommended alias in ~/.zshrc:
#   alias pmp='bash /Users/cb/Apps/webhouse/cms/scripts/pm2-ports.sh'

set -euo pipefail

# pm2 jlist always succeeds even when no apps run; empty list = empty table.
# Resolve a working `pm2` command — global install if present, else npx fallback.
if command -v pm2 >/dev/null 2>&1; then
  PM2=pm2
elif command -v npx >/dev/null 2>&1; then
  PM2="npx pm2"
else
  echo "Neither pm2 nor npx found on PATH. Install with: npm install -g pm2@6.0.14" >&2
  exit 1
fi

# Capture jlist to a temp file first — piping straight into python is
# fragile when pm2 (especially via npx) writes startup chatter to stdout
# alongside the JSON. The trailing JSON array is the only thing we want.
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
$PM2 jlist 2>/dev/null > "$TMP" || true

python3 - "$TMP" <<'PY'
import json, sys, re

raw = open(sys.argv[1]).read().strip()
# Extract the JSON array — pm2 sometimes prefixes log noise
match = re.search(r'\[.*\]', raw, re.DOTALL)
if not match:
    print("(no apps running under PM2)")
    sys.exit(0)
apps = json.loads(match.group(0))
if not apps:
    print("(no apps running under PM2)")
    sys.exit(0)

print(f'{"NAME":<24} {"PORT":<6} {"STATUS":<10} {"CPU":<6} {"MEM":<8} {"↺":<5} PID')
print('-' * 70)
for a in sorted(apps, key=lambda x: x.get('name', '')):
    name = a.get('name', '?')
    env_block = a.get('pm2_env', {}) or {}
    env = env_block.get('env', {}) or {}
    port = env.get('PORT') or env_block.get('PORT') or '-'
    status = env_block.get('status', '?')
    restarts = env_block.get('restart_time', '-')
    monit = a.get('monit', {}) or {}
    cpu = monit.get('cpu', 0)
    mem = monit.get('memory', 0)
    mem_mb = f'{mem / 1024 / 1024:.0f}M' if mem else '-'
    pid = a.get('pid') or '-'
    print(f'{name:<24} {str(port):<6} {status:<10} {str(cpu) + "%":<6} {mem_mb:<8} {str(restarts):<5} {pid}')
PY
