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
