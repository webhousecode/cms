#!/usr/bin/env bash
# F033.5 — Stop hook.
#
# Fires at the end of every cc response. We use it as a soft nudge: if cc
# wrote code under an F-numbered story this turn but never called
# cardmem_handoff_card / cardmem_move_card, surface a reminder so the
# board stays in sync with reality.
#
# Detection heuristic (cheap, no LLM):
#   1. git diff HEAD shows modified files
#   2. Recent audit_log entries (last 5min) don't include a move_card or
#      handoff_card for any F-number whose plan-doc matches a touched file
#   3. → emit <projects:nudge> with the suspected F-number

set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$DIR/_common.sh"

input=$(cat 2>/dev/null || true)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

# Bail if not in a git repo
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

# Files touched since HEAD (uncommitted) OR since last 5min of commits.
touched=$(git diff --name-only HEAD 2>/dev/null | head -50)
recent_commits=$(git log --since='5 minutes ago' --name-only --format= 2>/dev/null | head -50)
all_touched=$(printf '%s\n%s\n' "$touched" "$recent_commits" | sort -u | grep -v '^$' || true)

if [[ -z "$all_touched" ]]; then
  hook_log "stop: no recent file changes; quiet"
  exit 0
fi

# Pull F-numbers from filenames matching docs/features/F<n>-*.md OR from
# file content patterns. For V1 we only look at plan-doc filenames since
# that's the strongest signal cc actually worked on something F-numbered.
suspect_fnums=$(printf '%s' "$all_touched" | grep -oE 'F[0-9]+(\.[0-9]+)*' | sort -u || true)

if [[ -z "$suspect_fnums" ]]; then
  hook_log "stop: file changes but no F-number signal; quiet"
  exit 0
fi

# Ask the server: which of these have been moved/handed-off in the last 5min?
# Use cardmem_session_start to get the audit tail.
args=$(jq -nc --arg sid "${session_id:-stop-hook}" '{ session_id: $sid }')
session_resp=$(call_mcp cardmem_session_start "$args")

recent_actions=""
if [[ -n "$session_resp" ]]; then
  recent_actions=$(printf '%s' "$session_resp" | jq -r '.recent_audit[]? | .result_summary // ""')
fi

unhandled=()
while IFS= read -r fn; do
  [[ -z "$fn" ]] && continue
  # If any recent audit entry mentions this F-number, skip.
  if printf '%s' "$recent_actions" | grep -q "$fn"; then
    continue
  fi
  unhandled+=("$fn")
done <<<"$suspect_fnums"

if [[ ${#unhandled[@]} -eq 0 ]]; then
  hook_log "stop: all suspect F-numbers already moved; quiet"
  exit 0
fi

printf '<projects:nudge>\n'
printf '  Files changed mention F-numbers without a corresponding move/handoff:\n'
for fn in "${unhandled[@]}"; do
  printf '    - %s\n' "$fn"
done
printf '  Consider: cardmem_move_card to Review, or cardmem_handoff_card with a summary.\n'
printf '</projects:nudge>\n'

hook_log "stop: nudged session=${session_id:-unknown} unhandled=${#unhandled[@]}"
exit 0
