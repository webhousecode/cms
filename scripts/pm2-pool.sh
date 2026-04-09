#!/usr/bin/env bash
# PM2 dev server pool manager for @webhouse/cms test sites.
#
# Manages long-running Next.js dev servers as declared in ecosystem.config.js.
# Static sites are served on-demand by CMS admin's sirv — not touched here.
#
# HARD RULE: never touch port 3010 (CMS admin dev server).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/ecosystem.config.js"
PROTECTED_PORT=3010

# Ports PM2 will bind (keep in sync with ecosystem.config.js)
POOL_PORTS=(3009 3036 3002 3011)

pm2() { pnpm dlx pm2 "$@"; }

ensure_pm2() {
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "ERROR: pnpm not found in PATH" >&2
    exit 1
  fi
}

kill_conflicting_standalone() {
  echo "→ Checking for conflicting standalone dev servers on pool ports..."
  # Collect PIDs owned by pm2 so we don't kill them
  local pm2_pids
  pm2_pids=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    print(' '.join(str(p['pid']) for p in procs if p.get('pid')))
except Exception:
    print('')
" 2>/dev/null || echo "")

  for port in "${POOL_PORTS[@]}"; do
    if [ "$port" = "$PROTECTED_PORT" ]; then
      echo "  ✗ refusing to touch protected port $port" >&2
      continue
    fi
    local pid
    pid=$(lsof -iTCP:"$port" -sTCP:LISTEN -P -t 2>/dev/null | head -1 || true)
    if [ -z "$pid" ]; then
      echo "  · port $port is free"
      continue
    fi
    # Guard: never kill a process that also owns 3010
    if lsof -p "$pid" -iTCP:"$PROTECTED_PORT" -sTCP:LISTEN -P 2>/dev/null | grep -q LISTEN; then
      echo "  ✗ port $port is held by pid $pid which ALSO owns $PROTECTED_PORT — NOT killing" >&2
      continue
    fi
    # Skip pids already managed by pm2
    if echo " $pm2_pids " | grep -q " $pid "; then
      echo "  · port $port held by pm2 pid $pid — leaving alone"
      continue
    fi
    echo "  ⚠ port $port held by standalone pid $pid — stopping"
    kill "$pid" 2>/dev/null || true
    sleep 0.5
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

cmd_up() {
  ensure_pm2
  kill_conflicting_standalone
  echo "→ Starting pool from $CONFIG"
  pm2 start "$CONFIG"
  pm2 list
}

cmd_down() {
  ensure_pm2
  echo "→ Stopping and deleting pool"
  pm2 delete "$CONFIG" 2>/dev/null || pm2 delete all 2>/dev/null || true
}

cmd_status() {
  ensure_pm2
  pm2 list
}

cmd_logs() {
  ensure_pm2
  if [ $# -gt 0 ]; then
    pm2 logs "$1"
  else
    pm2 logs
  fi
}

cmd_restart() {
  ensure_pm2
  if [ $# -gt 0 ]; then
    pm2 restart "$1"
  else
    pm2 restart all
  fi
}

case "${1:-}" in
  up)      shift; cmd_up "$@" ;;
  down)    shift; cmd_down "$@" ;;
  status)  shift; cmd_status "$@" ;;
  logs)    shift; cmd_logs "$@" ;;
  restart) shift; cmd_restart "$@" ;;
  *)
    cat <<EOF
Usage: bash scripts/pm2-pool.sh <command>

Commands:
  up              Start the dev server pool (kills conflicting standalone dev servers first)
  down            Stop and delete all pool processes
  status          Show pool status
  logs [name]     Tail logs (optionally for one site)
  restart [name]  Restart all (or one)

Sites in pool: see ecosystem.config.js
EOF
    exit 1
    ;;
esac
