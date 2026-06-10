#!/usr/bin/env bash
# F033.5 / F121.3 — Stop hook. Two jobs, both best-effort (never block cc):
#
#   1. (F121.3) RUN REPORT — if this turn mutated board/repo state (moved a
#      card, handed off, wrote a plan, or pushed a commit), persist cc's own
#      wrap-up as a durable `run` report in /reports (the changelog cc writes
#      about itself). The hook stays thin: it sends cc's final message + the
#      card slugs/commits it touched; cardmem_record_run_report resolves the
#      slugs into the rich shipped/planned list server-side.
#
#   2. (F033.5) NUDGE — if cc touched F-numbered files but never moved/handed
#      off the card, surface a reminder so the board stays in sync.
#
# Performance: a long session's transcript can be 100MB+. We never scan it —
# a byte-offset marker (per session) lets us read only the NEW bytes via
# `tail -c +N` (a seek, not a scan), and the wrap-up via `tail -n 200`.

set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$DIR/_common.sh"

input=$(cat 2>/dev/null || true)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')
transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty')
stop_active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')

# ── 1. RUN REPORT (F121.3) ────────────────────────────────────────────
# Re-entrancy guard: when our own record call ends a turn, cc fires Stop again
# with stop_hook_active=true — never record on that pass.
maybe_record_run_report() {
  [[ "$stop_active" == "true" ]] && return 0
  [[ -z "$transcript" || ! -f "$transcript" ]] && return 0
  [[ -z "$session_id" ]] && return 0
  command -v jq >/dev/null 2>&1 || return 0

  local marker_dir="$HOME/.claude/logs/cardmem-runreport"
  mkdir -p "$marker_dir" 2>/dev/null || true
  local marker="$marker_dir/${session_id}.marker"

  local cur_byte head_sha
  cur_byte=$(stat -f%z "$transcript" 2>/dev/null || stat -c%s "$transcript" 2>/dev/null || echo 0)
  head_sha=$(git rev-parse HEAD 2>/dev/null || echo "")

  # First time we see this session: remember where we are, report nothing yet.
  if [[ ! -f "$marker" ]]; then
    jq -nc --argjson b "${cur_byte:-0}" --arg s "$head_sha" '{last_byte:$b,last_sha:$s}' >"$marker" 2>/dev/null || true
    return 0
  fi

  local last_byte last_sha
  last_byte=$(jq -r '.last_byte // 0' "$marker" 2>/dev/null || echo 0)
  last_sha=$(jq -r '.last_sha // ""' "$marker" 2>/dev/null || echo "")

  # No new transcript bytes since last pass → nothing happened.
  if [[ "${cur_byte:-0}" -le "${last_byte:-0}" ]]; then
    return 0
  fi

  # NEW bytes only (seek, not scan). The first partial line is dropped by
  # `fromjson?`. Cap to keep jq cheap even on a giant delta.
  local newjson
  newjson=$(tail -c +"$((last_byte + 1))" "$transcript" 2>/dev/null | tail -c 4000000)

  local tool_names
  tool_names=$(printf '%s' "$newjson" | jq -Rrc 'fromjson? | select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name' 2>/dev/null)

  # MILESTONE = a deliverable actually reached a reportable state — the only
  # thing worth a run report. A card SHIPPED (handoff → Review, or move_card to
  # Done/Review) OR a feature PLANNED (write_plan) OR a review bundle filed
  # (review_report). A bare commit, a card edit, an idea capture, or a
  # conversational reply is NOT report-worthy (Christian: "det er IKKE den slags
  # der er værd at lave en rapport på"). This is the bar for the changelog-of-self.
  local MILESTONE='cardmem_handoff_card|cardmem_write_plan|cardmem_review_report'
  local milestone="no"
  printf '%s' "$tool_names" | grep -qE "^($MILESTONE)$" && milestone="yes"
  if [[ "$milestone" == "no" ]]; then
    printf '%s' "$newjson" \
      | jq -Rrc 'fromjson? | select(.type=="assistant") | .message.content[]? | select(.type=="tool_use" and .name=="cardmem_move_card") | (.input.to_column // empty)' 2>/dev/null \
      | grep -qiE '^(done|review)$' && milestone="yes"
  fi

  # Commits since the last report — payload only, NOT a trigger on their own.
  local commits_json="[]"
  if [[ -n "$head_sha" && -n "$last_sha" && "$head_sha" != "$last_sha" ]]; then
    commits_json=$(git log --format='%h' "${last_sha}..${head_sha}" 2>/dev/null | head -20 | jq -R . | jq -sc . 2>/dev/null || echo '[]')
  fi

  # Always advance the marker so we never re-process this turn.
  jq -nc --argjson b "${cur_byte:-0}" --arg s "$head_sha" '{last_byte:$b,last_sha:$s}' >"$marker" 2>/dev/null || true

  # Gate: only a milestone is report-worthy. Everything else is silent.
  if [[ "$milestone" == "no" ]]; then
    return 0
  fi

  # cc's own wrap-up = the heart of the report (last assistant TEXT block).
  local body
  body=$(tail -n 200 "$transcript" 2>/dev/null \
    | jq -Rrc 'fromjson? | select(.type=="assistant") | (.message.content[]? | select(.type=="text") | .text)' 2>/dev/null \
    | tail -1 | head -c 8000)
  [[ -z "$body" ]] && body="(no wrap-up captured)"

  # Even on a milestone turn, skip if the wrap-up is just a question to the user
  # (a chat reply, not a work summary) — a report whose body is "Vil du have …?"
  # is noise.
  if [[ "$body" =~ \?[[:space:]]*$ ]]; then
    hook_log "run-report: wrap-up is a question; skip"
    return 0
  fi

  # Card slugs/f-numbers the turn touched: from tool_use inputs + F-numbers in
  # the wrap-up + commit subjects. The server resolves them into the rich list.
  local refs
  refs=$(
    {
      printf '%s' "$newjson" | jq -Rrc 'fromjson? | select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .input | (.card_id_or_slug // empty), (.parent_card_id // empty), (.card_refs[]? // empty)' 2>/dev/null
      printf '%s\n' "$body" | grep -oE 'F[0-9]+(\.[0-9]+)*' 2>/dev/null
    } | sort -u | grep -vE '^$' | head -40
  )
  local refs_json
  refs_json=$(printf '%s' "$refs" | jq -R . | jq -sc 'map(select(length>0))' 2>/dev/null || echo '[]')

  # plan-docs written this turn.
  local plans_json
  plans_json=$(printf '%s' "$newjson" | jq -Rrc 'fromjson? | .. | strings | select(test("docs/features/F[0-9].*\\.md"))' 2>/dev/null \
    | grep -oE 'docs/features/[^"]*\.md' | sort -u | head -20 | jq -R . | jq -sc . 2>/dev/null || echo '[]')

  # Resolve the project (repo → active_project) the same way session-start does.
  local repo proj_resp project_id
  repo=$(resolve_repo)
  proj_resp=$(call_mcp cardmem_session_start "$(jq -nc --arg sid "$session_id" --arg repo "$repo" '{session_id:$sid} + (if $repo!="" then {repo:$repo} else {} end)')")
  project_id=$(printf '%s' "$proj_resp" | jq -r '.active_project.id // .active_project_id // empty' 2>/dev/null)
  [[ -z "$project_id" ]] && { hook_log "run-report: no project resolved; skip"; return 0; }

  local model
  model=$(printf '%s' "$input" | jq -r '.model // empty')

  local args
  args=$(jq -nc \
    --arg pid "$project_id" \
    --arg body "$body" \
    --argjson refs "$refs_json" \
    --argjson commits "$commits_json" \
    --argjson plans "$plans_json" \
    --arg sid "$session_id" \
    --arg sname "${BUDDY_SESSION_NAME:-}" \
    --arg model "$model" \
    '{project_id:$pid, body_md:$body, card_refs:$refs, commits:$commits, plan_refs:$plans, session_id:$sid}
       + (if $sname!="" then {session_name:$sname} else {} end)
       + (if $model!="" then {model:$model} else {} end)')
  call_mcp cardmem_record_run_report "$args" >/dev/null 2>&1 || true
  hook_log "run-report: recorded session=$session_id milestone=$milestone refs=$(printf '%s' "$refs_json" | jq 'length' 2>/dev/null)"
}

maybe_record_run_report || true

# ── 2. NUDGE (F033.5) ─────────────────────────────────────────────────
# Bail if not in a git repo.
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

touched=$(git diff --name-only HEAD 2>/dev/null | head -50)
recent_commits=$(git log --since='5 minutes ago' --name-only --format= 2>/dev/null | head -50)
all_touched=$(printf '%s\n%s\n' "$touched" "$recent_commits" | sort -u | grep -v '^$' || true)
[[ -z "$all_touched" ]] && exit 0

suspect_fnums=$(printf '%s' "$all_touched" | grep -oE 'F[0-9]+(\.[0-9]+)*' | sort -u || true)
[[ -z "$suspect_fnums" ]] && exit 0

args=$(jq -nc --arg sid "${session_id:-stop-hook}" '{ session_id: $sid }')
session_resp=$(call_mcp cardmem_session_start "$args")
recent_actions=""
if [[ -n "$session_resp" ]]; then
  recent_actions=$(printf '%s' "$session_resp" | jq -r '.recent_audit[]? | .result_summary // ""')
fi

unhandled=()
while IFS= read -r fn; do
  [[ -z "$fn" ]] && continue
  if printf '%s' "$recent_actions" | grep -q "$fn"; then continue; fi
  unhandled+=("$fn")
done <<<"$suspect_fnums"

[[ ${#unhandled[@]} -eq 0 ]] && exit 0

printf '<projects:nudge>\n'
printf '  Files changed mention F-numbers without a corresponding move/handoff:\n'
for fn in "${unhandled[@]}"; do printf '    - %s\n' "$fn"; done
printf '  Consider: cardmem_move_card to Review, or cardmem_handoff_card with a summary.\n'
printf '</projects:nudge>\n'

hook_log "stop: nudged session=${session_id:-unknown} unhandled=${#unhandled[@]}"
exit 0
