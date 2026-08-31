#!/usr/bin/env bash
# F033.5 / F062 — shared helpers for the cardmem cc hooks.
#
# Each hook script sources this file. Centralises:
#   - CARDMEM_MCP_URL (where to talk to the cardmem server)
#   - CARDMEM_MCP_KEY (optional Bearer for cloud mode)
#   - call_mcp(toolname, jsonargs) — wraps a JSON-RPC tools/call + parses the
#     SSE response back to a single JSON blob
#
# F062 — endpoint resolution is single-source-of-truth via .mcp.json:
#   1. explicit env override (CARDMEM_MCP_URL / legacy PROJECTS_MCP_URL)
#   2. .mcp.json in the repo (the SAME file the cc process uses to reach cloud)
#   3. http://localhost:7474/mcp — only when no .mcp.json exists (local dev)
# Pre-F062 the hooks fell back to localhost:7474 whenever the env var was
# unset, so in cloud mode they hit a dead local endpoint, every MCP call
# returned empty, and session-start.sh never registered a cc_sessions row —
# breaking dispatch routing.
#
# Hooks fail gracefully: if the server is unreachable they exit 0 without
# output so cc keeps working. Their value is real-time orientation, not
# correctness-critical.

set -u
# Don't 'set -e' — we want the hooks to no-op on network failures, not abort cc.

# ── endpoint resolution ───────────────────────────────────────────────
# Explicit env wins; legacy PROJECTS_* honored as fallback for one release.
CARDMEM_MCP_URL="${CARDMEM_MCP_URL:-${PROJECTS_MCP_URL:-}}"
CARDMEM_MCP_KEY="${CARDMEM_MCP_KEY:-${PROJECTS_MCP_KEY:-}}"

# If still unset, resolve from .mcp.json — the single source of truth the
# cc process itself uses (mcpServers.cardmem.args carries the URL + Bearer).
if [[ -z "$CARDMEM_MCP_URL" ]]; then
  _mcp_json=""
  _git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  for _candidate in "${CLAUDE_PROJECT_DIR:-}/.mcp.json" "${_git_root}/.mcp.json" "./.mcp.json"; do
    if [[ -n "$_candidate" && -f "$_candidate" ]]; then _mcp_json="$_candidate"; break; fi
  done
  if [[ -n "$_mcp_json" ]] && command -v jq >/dev/null 2>&1; then
    # Two .mcp.json shapes (buddy bug 2026-06-08): the hooks must read BOTH.
    #  1. MODERN native http transport (preferred):
    #       { "type":"http", "url":"https://…/mcp",
    #         "headers":{ "Authorization":"Bearer pa_…" } }
    #  2. LEGACY mcp-remote bridge:
    #       { "args":[ "-y","mcp-remote","<url>","--header","Authorization: Bearer <key>" ] }
    # The old code only parsed shape 2 → a modern config returned empty → the
    # URL fell through to localhost:7474 (a local server that doesn't host the
    # project) → session_start "no project resolved" → queue-drain never fired.
    # Read the modern fields FIRST, fall back to args[].
    CARDMEM_MCP_URL="$(jq -r '.mcpServers.cardmem.url // empty' "$_mcp_json" 2>/dev/null)"
    _auth_hdr="$(jq -r '.mcpServers.cardmem.headers.Authorization // .mcpServers.cardmem.headers.authorization // empty' "$_mcp_json" 2>/dev/null)"
    if [[ -z "$CARDMEM_MCP_URL" ]]; then
      # Legacy mcp-remote shape: pull the URL + auth header out of args[].
      CARDMEM_MCP_URL="$(jq -r '.mcpServers.cardmem.args[]? | select(type=="string" and test("^https?://"))' "$_mcp_json" 2>/dev/null | head -1)"
      _auth_hdr="$(jq -r '.mcpServers.cardmem.args[]? | select(type=="string" and startswith("Authorization:"))' "$_mcp_json" 2>/dev/null | head -1)"
    fi
    if [[ -n "$_auth_hdr" ]]; then
      # Strip an optional "Authorization: " prefix then "Bearer " → bare token.
      _auth_hdr="${_auth_hdr#Authorization: }"
      _auth_hdr="${_auth_hdr#authorization: }"
      CARDMEM_MCP_KEY="${_auth_hdr#Bearer }"
    fi
  fi
fi

# Final fallback: local dev server. Only reached when no .mcp.json resolved a URL.
CARDMEM_MCP_URL="${CARDMEM_MCP_URL:-http://localhost:7474/mcp}"

CARDMEM_HOOK_DEBUG="${CARDMEM_HOOK_DEBUG:-${PROJECTS_HOOK_DEBUG:-0}}"
CARDMEM_HOOK_LOG="${CARDMEM_HOOK_LOG:-${PROJECTS_HOOK_LOG:-$HOME/.claude/logs/cardmem-hooks.log}}"

mkdir -p "$(dirname "$CARDMEM_HOOK_LOG")" 2>/dev/null || true

hook_log() {
  if [[ "$CARDMEM_HOOK_DEBUG" == "1" ]]; then
    printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" >> "$CARDMEM_HOOK_LOG"
  fi
}

# call_mcp <tool_name> <args_json>
# Returns: tool output as JSON on stdout, or empty string on error.
call_mcp() {
  local tool_name="$1"
  local args_json="$2"

  local auth_header=()
  if [[ -n "$CARDMEM_MCP_KEY" ]]; then
    auth_header=(-H "Authorization: Bearer $CARDMEM_MCP_KEY")
  fi

  local body
  body=$(
    jq -nc \
      --arg name "$tool_name" \
      --argjson args "$args_json" \
      '{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: $name, arguments: $args } }'
  )

  local response
  response=$(
    curl -s --max-time 4 \
      -X POST "$CARDMEM_MCP_URL" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json, text/event-stream" \
      "${auth_header[@]}" \
      --data "$body" 2>/dev/null
  )

  if [[ -z "$response" ]]; then
    hook_log "call_mcp $tool_name: empty response (server unreachable? url=$CARDMEM_MCP_URL)"
    return 1
  fi

  # MCP HTTP transport replies as SSE: lines start with "event:" / "data:".
  # We want the data line's JSON. Strip the SSE framing.
  local data_line
  data_line=$(printf '%s' "$response" | awk -F': ' '/^data: /{print substr($0,7); exit}')
  if [[ -z "$data_line" ]]; then
    # Plain JSON response (no SSE framing) — happens with some transports.
    data_line="$response"
  fi

  # Pull result.content[0].text and parse as JSON.
  printf '%s' "$data_line" | jq -r '.result.content[0].text // empty' 2>/dev/null
}

# resolve_repo — best-effort "owner/name" for the current cwd. Empty string
# if not a github clone. Uses bash parameter expansion only — macOS sed
# does not support PCRE non-greedy quantifiers.
# F260.5 — the ONE place session_start's arguments are assembled.
#
# Every hook that calls cardmem_session_start must build its args here. `repo` is
# the field that decides WHICH PROJECT the call reads and writes; a call without
# it is answered with whatever board the owner happens to have open, and the
# caller cannot tell. stop.sh did exactly that at every turn end and reconciled
# this repo's F-numbers against another project's audit log.
#
# The point of a builder is that a call site cannot forget a field it never
# assembles. Four of the five call sites were already correct — the fifth was
# correct-looking, in a file whose OTHER call site passed repo, which is why a
# guard that read whole files stayed green over it.
#
# $1 = session id. $2 = optional extra JSON object, merged on top.
session_start_args() {
  local sid="$1" extra="${2:-{\}}" repo
  repo=$(resolve_repo)
  jq -nc --arg sid "$sid" --arg repo "$repo" --argjson extra "$extra" \
    '{ session_id: $sid }
       + (if $repo != "" then { repo: $repo } else {} end)
       + $extra'
}

resolve_repo() {
  local origin
  origin=$(git remote get-url origin 2>/dev/null) || { printf ''; return 0; }
  origin=${origin#git@github.com:}
  origin=${origin#https://github.com/}
  origin=${origin#http://github.com/}
  origin=${origin%.git}
  origin=${origin%/}
  printf '%s' "$origin"
}

# ─── F287.3 — the kill switch a gate consults before it fires ───────────
#
# A rule ships as a COPY in every repo, so switching one off centrally reaches
# nothing unless the copy asks. This is where it asks. session-start.sh writes
# the list cardmem_session_start returned to .claude/rules.local.json; every
# gate calls rule_disabled "<id>" as its FIRST act and exits 0 when told to.
#
# THE FAIL DIRECTION IS INVERTED HERE, and it is the whole design.
#
# Everywhere else in these hooks, doubt means "let the command through" — a
# guard that blocks work on its own uncertainty gets switched off, and then it
# is worse than no guard. Here doubt means the OPPOSITE: no file, unreadable
# file, no jq, malformed JSON, a `disabled` that is not a list — the gate still
# RUNS. A kill switch that silently disables a safety gate because a file was
# missing is worse than no kill switch, and the two defaults point the same way
# morally: never let our own uncertainty be the thing that causes the damage.
#
# Returns 0 (true, "yes it is disabled") ONLY on a positive, well-formed match.
rule_disabled() {
  local id="${1:-}"
  [ -n "$id" ] || return 1
  local f="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}/.claude/rules.local.json"
  [ -r "$f" ] || return 1
  command -v jq >/dev/null 2>&1 || return 1
  # `index` on an explicit array, so a `disabled` that is a string or an object
  # is a jq error (-> return 1 -> the gate runs), never a substring match. A
  # `disabled` of "deploy-background-experiment" must not disable
  # "deploy-background".
  jq -e --arg id "$id" '(.disabled | arrays) as $d | $d | index($id) != null' "$f" >/dev/null 2>&1
}

# F287.3 — write the kill list the gates read, from a session_start result.
#
# A FUNCTION rather than eight lines inside session-start.sh, because the write
# is the half that can silently go wrong (a stale file from another project, a
# half-written file, an absent field mistaken for "nothing disabled") and a
# block buried in a 200-line hook cannot be driven by a test.
#
# Echoes what it decided so a caller can report it. Never fails the boot.
write_rules_local() { # $1 = the full session_start result JSON
  local result="${1:-}" dir="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  local f="$dir/rules.local.json"
  command -v jq >/dev/null 2>&1 || { echo "no-jq"; return 0; }
  local rules
  rules=$(printf '%s' "$result" | jq -c '.disabled_rules // empty' 2>/dev/null || echo "")
  # ABSENT is not EMPTY. A server older than this hook cannot tell us "nothing
  # is disabled", and treating its silence as a clear would re-enable a rule the
  # owner had switched off. So we leave whatever is there alone.
  if [ -z "$rules" ]; then echo "absent"; return 0; fi
  # Atomic: a gate may read this file at any moment, and half a file parses as
  # malformed. Malformed keeps the gate ON, so it is safe — but it would make
  # the switch look flaky for no reason.
  if printf '{"disabled":%s}\n' "$rules" > "$f.tmp" 2>/dev/null; then
    mv -f "$f.tmp" "$f" 2>/dev/null || { rm -f "$f.tmp"; echo "write-failed"; return 0; }
    echo "$rules"; return 0
  fi
  rm -f "$f.tmp" 2>/dev/null
  echo "write-failed"
}
