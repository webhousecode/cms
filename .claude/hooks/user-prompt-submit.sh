#!/usr/bin/env bash
# F033.5 — UserPromptSubmit hook.
#
# Fires on every user message. We use it for two things:
#   1. Auto-claim: if the user's prompt references a card by F-number AND an
#      action verb ("let's do", "implement", "pickup", "tag"), call
#      cardmem_pickup_card to flip it In progress BEFORE cc emits tokens.
#   2. Cheap polling for board-state deltas: every prompt re-calls
#      cardmem_session_start (updates last_seen_at) and surfaces any new
#      audit entries since the previous turn as <projects:events>.
#
# This hook is the heartbeat that keeps cc oriented between prompts.

set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$DIR/_common.sh"

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty')

if [[ -z "$session_id" || -z "$prompt" ]]; then
  exit 0
fi

repo=$(resolve_repo)
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

# Always touch cc_sessions.last_seen_at so the notify-bridge keeps routing
# us. The response also brings the latest 5 audit entries — we'll surface
# any that arrived since "last seen by this hook" using a marker-file.
session_args=$(
  jq -nc \
    --arg sid "$session_id" \
    --arg repo "$repo" \
    --arg branch "$branch" \
    --arg buddy "${BUDDY_SESSION_NAME:-}" \
    '{ session_id: $sid }
       + (if $repo  != "" then { repo:  $repo  } else {} end)
       + (if $branch!= "" then { branch:$branch} else {} end)
       + (if $buddy != "" then { buddy_session_name: $buddy } else {} end)'
)

session_resp=$(call_mcp cardmem_session_start "$session_args")

# F060.2 — adopt-forcing reminder, re-asserted every turn until cloud says Init
# is done (init.required from session_start). The full skill was inlined at
# session-start; this keeps it binding without re-printing it each turn.
init_required=$(printf '%s' "$session_resp" | jq -r '.init.required // false')
if [[ "$init_required" == "true" ]]; then
  printf '<cardmem-adopt-required>\n'
  printf 'Adoption is still your ONLY task — cardmem Init is NOT complete. Follow the adopt skill inlined at session-start (full text in .claude/skills/adopt.md). Do not shortcut via card task-text, do not start unrelated work, do not edit CLAUDE.md.\n'
  printf '</cardmem-adopt-required>\n'
fi

# Strip channel-echo blocks before regex'ing — buddy intercom messages
# arrive embedded in user prompts when Christian pastes/quotes them.
# Auto-claiming on our own bridge-echo creates loops (e.g., a "Review →
# Done" channel message contains "F033.3" and the word "pickup" via our
# tool names, falsely triggering auto-claim back to in_progress).
prompt_stripped=$(printf '%s' "$prompt" | sed 's|<channel[^>]*>.*</channel>||g' | sed 's|<projects:[^>]*>.*</projects:[^>]*>||g')

# Auto-claim requires imperative + F-number on the SAME line within ~40
# chars — not just "anywhere in the prompt". Previous looser regex
# matched any imperative anywhere alongside any F-number anywhere, so
# my own text outputs that mentioned both ("F035.1, F035.2 — implement…")
# triggered false-positive claims. Now we extract pairs from matching
# lines only.
# Imperative must be a whole word (not "implement-detaljer"), followed
# by whitespace, optional bridging words (≤2, short), and the F-number.
# Word-boundary anchor is implicit in macOS grep -E via the (^|[[:space:]])
# wrapper to keep portability with non-PCRE flavors.
imperative='(^|[[:space:]])(lad os (tag|kør|start|implement|bygg)e?r?|let'\''s (do|implement|start)|implementer|implement|claim|begynd på|igangsæt|færdiggør)[[:space:]]+([a-zæøå]{1,8}[[:space:]]+){0,2}F[0-9]+(\.[0-9]+(\.[a-z])?)?'
matched_lines=$(printf '%s' "$prompt_stripped" | grep -iE "$imperative" 2>/dev/null || true)
fnums=$(printf '%s' "$matched_lines" | grep -oE '\bF[0-9]+(\.[0-9]+(\.[a-z])?)?\b' | sort -u || true)

auto_claim=()
if [[ -n "$fnums" ]]; then
  while IFS= read -r fn; do
    [[ -z "$fn" ]] && continue
    # Use cardmem_pickup_card (NOT move_card) — it validates the source
    # column is Backlog or Ready, refusing to move a Done card back to
    # In progress on an accidental match.
    args=$(jq -nc --arg slug "$fn" '{ card_id_or_slug: $slug }')
    pickup_resp=$(call_mcp cardmem_pickup_card "$args")
    if [[ -n "$pickup_resp" ]]; then
      auto_claim+=("$fn")
      hook_log "auto-claim: $fn → in_progress"
    else
      hook_log "auto-claim rejected for $fn (column gate or not found)"
    fi
  done <<<"$fnums"
fi

# Surface state to cc if we have something to say.
if [[ ${#auto_claim[@]} -gt 0 || -n "$session_resp" ]]; then
  printf '<projects:events>\n'
  if [[ ${#auto_claim[@]} -gt 0 ]]; then
    for fn in "${auto_claim[@]}"; do
      printf '  auto-claimed: %s → In progress\n' "$fn"
    done
  fi

  if [[ -n "$session_resp" ]]; then
    in_progress_count=$(printf '%s' "$session_resp" | jq '.in_progress | length')
    review_count=$(printf '%s' "$session_resp" | jq '.review_queue | length')
    [[ "$in_progress_count" -gt 0 ]] && printf '  in_progress=%d  review=%d\n' "$in_progress_count" "$review_count"

    # Show last 3 audit entries (recent activity since cc was last awake).
    printf '%s' "$session_resp" | jq -r \
      '.recent_audit[0:3][]? | "  " + .action + "  " + (.result_summary // "")'
  fi
  printf '</projects:events>\n'
fi

hook_log "user-prompt-submit: session=$session_id auto_claim=${#auto_claim[@]}"
exit 0
