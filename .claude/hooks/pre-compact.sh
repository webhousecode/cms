#!/usr/bin/env bash
# F033.5 — PreCompact hook.
#
# Fires right before Claude Code auto-compacts the conversation. We use it
# to persist a snapshot of session state to cc_session_state so the next
# turn (post-compact) can rehydrate via SessionStart.
#
# Snapshot fields:
#   - in_progress_f_numbers: extracted from current in_progress cards
#   - branch: current git branch
#   - notes: free-text from cc itself (transcript_path tail) — V1 keeps it
#     terse since we may not have a clean parse path
#
# cardmem_session_snapshot lands in F033.4. Until then this script POSTs to
# cardmem_session_start (which is harmless: just refreshes last_seen_at)
# and logs that compact happened. Once F033.4 is shipped we swap the tool
# name below.

set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$DIR/_common.sh"

input=$(cat 2>/dev/null || true)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [[ -z "$session_id" ]]; then
  hook_log "pre-compact: no session_id in input; skipping"
  exit 0
fi

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

# Pull current in-progress F-numbers from session_start (so post-compact
# SessionStart can show "you were working on these"). Cheap enough to
# inline rather than reading from cc transcript.
state_args=$(jq -nc --arg sid "$session_id" '{ session_id: $sid }')
state_resp=$(call_mcp cardmem_session_start "$state_args")
fnums_json='[]'
if [[ -n "$state_resp" ]]; then
  fnums_json=$(printf '%s' "$state_resp" | jq -c '[.in_progress[]?.f_number] | map(select(. != null))')
fi

# Compose snapshot args. notes is a one-liner timestamp so post-compact
# can see when this happened.
snap_args=$(
  jq -nc \
    --arg sid "$session_id" \
    --arg branch "$branch" \
    --argjson fnums "$fnums_json" \
    --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    '{
      session_id: $sid,
      branch: $branch,
      in_progress_f_numbers: $fnums,
      notes: ("PreCompact snapshot @ " + $ts)
    }'
)

call_mcp cardmem_session_snapshot "$snap_args" >/dev/null
hook_log "pre-compact: snapshot saved session=$session_id branch=$branch fnums=$fnums_json"
exit 0
