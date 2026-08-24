#!/usr/bin/env bash
# F033.5 — SessionStart hook.
#
# Fires when cc launches in this repo. Calls cardmem_session_start to
# UPSERT cc_sessions + retrieve active_project / in_progress / review_queue
# / recent_audit / last_snapshot. Prints a <projects:state> block on stdout
# so cc orients instantly without burning tokens re-reading PLAN.md.
#
# Inputs (stdin JSON from cc):
#   { session_id, transcript_path, cwd, ... }
#
# Env:
#   BUDDY_SESSION_NAME — from ccb wrapper. Stored in cc_sessions so the
#                        notify-bridge knows where to send card events.

set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$DIR/_common.sh"

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')
if [[ -z "$session_id" ]]; then
  # cc didn't pass a session_id (older cc version, or hook invoked manually).
  # Fall back to a stable id derived from the cwd so reruns aren't multiplied.
  session_id="cc-$(printf '%s' "$PWD" | shasum -a 256 | cut -c1-12)"
  hook_log "session-start: synthesized session_id=$session_id from cwd"
fi

repo=$(resolve_repo)
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
# F047.9 — the model this session runs (e.g. "claude-opus-4-8"). Only the
# SessionStart hook payload carries it (.model); pass it so the Card Detail
# drawer can show which model a live agent is running.
model=$(printf '%s' "$input" | jq -r '.model // empty')

# F075.5 — pass our applied template version (from the marker the daemon writes
# on Update templates) so the server can flag whether we're behind canonical.
tmpl_version=""
if [[ -f "$DIR/../.cardmem-templates.json" ]]; then
  tmpl_version=$(jq -r '.version // empty' "$DIR/../.cardmem-templates.json" 2>/dev/null || echo "")
fi

args=$(session_start_args "$session_id" "$(
  jq -nc \
    --arg branch "$branch" \
    --arg buddy "${BUDDY_SESSION_NAME:-}" \
    --arg model "$model" \
    --arg spawnedCard "${CARDMEM_SPAWNED_CARD_ID:-${PROJECTS_SPAWNED_CARD_ID:-}}" \
    --arg spawnedBranch "${CARDMEM_SPAWNED_BRANCH:-${PROJECTS_SPAWNED_BRANCH:-}}" \
    --arg parent "${CARDMEM_PARENT_SESSION_ID:-${PROJECTS_PARENT_SESSION_ID:-}}" \
    --arg tmplVersion "$tmpl_version" \
    '(if $branch!= "" then { branch:$branch} else {} end)
       + (if $buddy != "" then { buddy_session_name: $buddy } else {} end)
       + (if $model != "" then { model: $model } else {} end)
       + (if $spawnedCard  != "" then { spawned_card_id: $spawnedCard } else {} end)
       + (if $spawnedBranch!= "" then { spawned_branch: $spawnedBranch } else {} end)
       + (if $parent       != "" then { parent_session_id: $parent } else {} end)
       + (if $tmplVersion  != "" then { template_version: $tmplVersion } else {} end)'
)")

result=$(call_mcp cardmem_session_start "$args")
if [[ -z "$result" ]]; then
  hook_log "session-start: no result from cardmem_session_start (server down?)"
  exit 0
fi

# F060.2 — adopt-forcing. If cloud says this repo's Init isn't done, INLINE the
# full adopt skill so the session can't shortcut past reading a file. Cloud-
# authoritative (init.required from session_start), never a local marker.
init_required=$(printf '%s' "$result" | jq -r '.init.required // false')
if [[ "$init_required" == "true" && -f "$DIR/../skills/adopt.md" ]]; then
  printf '<cardmem-adopt-required>\n'
  printf 'This repo is imported into cardmem but its Init is NOT complete. Adoption is your ONLY task until it is done. The full step-by-step guide is inlined below — do NOT shortcut via card task-text, do NOT start unrelated work, do NOT edit CLAUDE.md. Follow it top to bottom:\n\n'
  cat "$DIR/../skills/adopt.md"
  printf '\n</cardmem-adopt-required>\n'
fi

# Build the <projects:state> block. Keep it tight — capped budget per docs.
printf '<projects:state>\n'

active=$(printf '%s' "$result" | jq -r '.active_project // empty')
repo_unmatched=$(printf '%s' "$result" | jq -r '.repo_unmatched // false')
if [[ -n "$active" ]]; then
  proj_name=$(printf '%s' "$result" | jq -r '.active_project.name')
  proj_repo=$(printf '%s' "$result" | jq -r '.active_project.github_repo_full_name // ""')
  printf '  Project: %s' "$proj_name"
  [[ -n "$proj_repo" ]] && printf ' (%s)' "$proj_repo"
  printf '\n'
elif [[ "$repo_unmatched" == "true" ]]; then
  # F116 — repo was sent but no cardmem project maps to it. Say so explicitly
  # instead of silently mapping this session to another project's board.
  printf '  Project: (none — repo %s is not enrolled in cardmem; ask the cardmem session to scan/enroll it)\n' "${repo:-this repo}"
fi

# F064 — surface queue-drain mode so a session can verify whether it
# inherited the project's auto_pickup_mode toggle (otherwise invisible).
qd_session=$(printf '%s' "$result" | jq -r '.queue_drain.session_auto_pickup_mode // "off"')
qd_project=$(printf '%s' "$result" | jq -r '.queue_drain.project_auto_pickup_mode // "off"')
qd_active=$(printf '%s' "$result" | jq -r '.queue_drain.effective_active // false')
if [[ "$qd_session" == "queue-drain" || "$qd_project" == "queue-drain" ]]; then
  printf '  Queue-drain: session=%s project=%s active=%s\n' "$qd_session" "$qd_project" "$qd_active"
fi

# F168.1 — Ready cards = the durable pickup queue. A human/promote flip to Ready
# is a BINDING pickup directive, so surface it FIRST and explicitly. This is the
# offline drain guarantee: a card promoted to Ready while nothing was running is
# seen the moment any session boots, not left to rot on the board.
pickup_count=$(printf '%s' "$result" | jq '.pending_pickup | length')
if [[ "$pickup_count" -gt 0 ]]; then
  printf '  Ready — pending pickup (a human/promote flip to Ready is BINDING; drain these):\n'
  printf '%s' "$result" | jq -r \
    '.pending_pickup[] | "    - " + (.f_number // .global_slug) + " · " + .title + " (" + .priority + (if .from_mockup then " · 🎨 approved mockup → build" else "" end) + ")"'
fi

in_progress_count=$(printf '%s' "$result" | jq '.in_progress | length')
if [[ "$in_progress_count" -gt 0 ]]; then
  printf '  In progress:\n'
  printf '%s' "$result" | jq -r \
    '.in_progress[] | "    - " + (.f_number // .global_slug) + " · " + .title + " (" + .priority + (if .story_points then ", " + (.story_points|tostring) + " SP" else "" end) + ")"'
fi

review_count=$(printf '%s' "$result" | jq '.review_queue | length')
if [[ "$review_count" -gt 0 ]]; then
  printf '  Review queue:\n'
  printf '%s' "$result" | jq -r \
    '.review_queue[] | "    - " + (.f_number // .global_slug) + " · " + .title'
fi

audit_count=$(printf '%s' "$result" | jq '.recent_audit | length')
if [[ "$audit_count" -gt 0 ]]; then
  printf '  Recent activity:\n'
  printf '%s' "$result" | jq -r \
    '.recent_audit[] | "    - " + (.timestamp | sub("\\..+"; "Z")) + "  " + .action + "  " + (.result_summary // "")' \
    | head -5
fi

snapshot=$(printf '%s' "$result" | jq -r '.last_snapshot // empty')
if [[ -n "$snapshot" ]]; then
  snap_fnums=$(printf '%s' "$result" | jq -r '.last_snapshot.in_progress_f_numbers | join(", ")')
  snap_notes=$(printf '%s' "$result" | jq -r '.last_snapshot.notes // ""')
  printf '  Resumed from last snapshot:\n'
  [[ -n "$snap_fnums" && "$snap_fnums" != "null" ]] && printf '    in-progress: %s\n' "$snap_fnums"
  [[ -n "$snap_notes" ]] && printf '    notes: %s\n' "$snap_notes"
fi

# F075.5 — at-launch nudge if this repo's templates are behind canonical.
# The exact stale-file list comes from the cardmem audit (scanLocal, F075.2).
tmpl_outdated=$(printf '%s' "$result" | jq -r '.templates.templates_outdated // false')
if [[ "$tmpl_outdated" == "true" ]]; then
  cur=$(printf '%s' "$result" | jq -r '.templates.current_semver // .templates.current_version // "?"')
  printf '  ⚠ Templates outdated vs canonical v%s — run the cardmem audit / Update templates.\n' "$cur"
fi

# F217.1 — reuse-first: this repo's Discovery gap (shipped @broberg/* packages
# not yet adopted). reuse > re-roll — surfaced so a session matches its work
# against the shared inventory before building. Silent when empty or unavailable.
reuse_gap=$(printf '%s' "$result" | jq '(.discovery_reuse.gap // []) | length')
if [[ "$reuse_gap" =~ ^[0-9]+$ && "$reuse_gap" -gt 0 ]]; then
  printf '  ♻ Reuse-first (F217): %s shared @broberg/* package(s) this repo has NOT adopted — check before you build:\n' "$reuse_gap"
  printf '%s' "$result" | jq -r \
    '.discovery_reuse.gap[] | if type=="string" then "    - " + . else "    - " + (.pkg // .name // .package // (.|tostring)) + (if .version then " (" + (.version|tostring) + ")" else "" end) end' 2>/dev/null | head -12
fi

# F269.2 — the release gate's OWN coverage. The tool has returned this since the
# card shipped; nothing printed it, so the verdict existed and reached nobody —
# which is the exact failure the card's own comment names ("a finding that lives
# only where somebody must remember to look"). buddy found it by asking why their
# turbo-based gate was silent: it was not silent, it was unread.
#
# ALWAYS one line, including 'covered'. Printing only on trouble makes "the gate
# is fine" and "nothing looked" the same silence — the same trap the F195.8 colour
# sync fell into the same day. Detail only when there is something to act on.
gate_state=$(printf '%s' "$result" | jq -r '.gate_coverage.state // empty')
if [[ -n "$gate_state" ]]; then
  gate_disk=$(printf '%s' "$result" | jq -r '.gate_coverage.on_disk // 0')
  gate_cov=$(printf '%s' "$result" | jq -r '.gate_coverage.covered // "?"')
  case "$gate_state" in
    covered) printf '  ✓ Release gate sees all %s test file(s).\n' "$gate_disk" ;;
    *)
      # 'covered: ?' is UNKNOWN and must never render as 0.
      printf '  ⚠ Release gate: %s (%s of %s test files covered)\n' "$gate_state" "$gate_cov" "$gate_disk"
      printf '%s' "$result" | jq -r '"    " + (.gate_coverage.reason // "no reason given")' 2>/dev/null
      printf '%s' "$result" | jq -r '(.gate_coverage.uncovered_sample // [])[] | "    - " + .' 2>/dev/null | head -8
      ;;
  esac
fi

printf '\n  Tools available via projects MCP. /board /pickup /handoff for shortcuts.\n'
printf '</projects:state>\n'

hook_log "session-start: ok session=$session_id buddy=${BUDDY_SESSION_NAME:-} repo=$repo"
exit 0
