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

# F353.1 (cardmem) — WHAT started this session: startup | resume | clear |
# compact | fork. cc has handed us this field all along and the hook threw it
# away, so "does this hook fire on /clear?" could not be answered from history
# at all. `// empty` on purpose, never `// "startup"`: an empty value travels as
# JSON null, because "cc named no source" and "cc said startup" are two different
# facts and only one is a measurement. Guarded so a missing or unhappy jq costs
# this session nothing.
source=$(printf '%s' "$input" | jq -r '.source // empty' 2>/dev/null || printf '')

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
    --arg source "$source" \
    '(if $branch!= "" then { branch:$branch} else {} end)
       + (if $buddy != "" then { buddy_session_name: $buddy } else {} end)
       + (if $model != "" then { model: $model } else {} end)
       + (if $spawnedCard  != "" then { spawned_card_id: $spawnedCard } else {} end)
       + (if $spawnedBranch!= "" then { spawned_branch: $spawnedBranch } else {} end)
       + (if $parent       != "" then { parent_session_id: $parent } else {} end)
       + (if $tmplVersion  != "" then { template_version: $tmplVersion } else {} end)
       + { session_start_event: { source: (if $source != "" then $source else null end) } }'
)")

result=$(call_mcp cardmem_session_start "$args")
if [[ -z "$result" ]]; then
  hook_log "session-start: no result from cardmem_session_start (server down?)"
  exit 0
fi

# F287.3 — write the kill list the gates read. The logic lives in _common.sh
# (write_rules_local) so it can be driven by test-rules-disabled.sh; a block
# buried in this 200-line hook could not be.
rules_written=$(write_rules_local "$result" "$DIR/..")
if [[ -n "$rules_written" && "$rules_written" != "[]" && "$rules_written" != "absent" \
      && "$rules_written" != "no-jq" && "$rules_written" != "write-failed" ]]; then
  hook_log "session-start: rules disabled by the owner: $rules_written"
  printf '<cardmem-rules-disabled>\n'
  printf 'The owner has switched these harness rules OFF for this project: %s\n' "$rules_written"
  printf 'The corresponding gates will not fire. This is deliberate — do not re-enable them\n'
  printf 'or work around their absence; if one is missing that you think should be on, say so.\n'
  printf '</cardmem-rules-disabled>\n'
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

# F297.1 — the Decision Register, BEFORE the state block.
#
# Deliberately first: it is the only part of this payload that constrains what
# the session may DECIDE, and it has to survive a compaction — which is exactly
# when this hook fires again. Everything below is what is happening; this is what
# is already settled, and reading it after the work queue is reading it late.
render_decisions "$result"

# F353.2 — THE HANDOVER ITSELF, not a path to it.
#
# MEASURED 18 September 2026: after a real /clear, cms did NOT find its own
# handover file. It woke, took the board's orientation, and answered an intercom
# from MONDAY. A handover that has to be FOUND is not a handover — so the
# content is printed here, in the block the session already reads.
#
# FIRST, because it is a WORK ORDER. Everything below it is what is happening;
# this is what the previous session was in the middle of, and reading it after
# the board's list is reading it late.
#
# `never_set` is printed VERBATIM. A field nobody answered and a field answered
# with nothing are different facts, and the one thing this must never do is make
# them look the same.
ho=$(printf '%s' "$result" | jq -r '.last_handoff // empty' 2>/dev/null || printf '')
if [[ -n "$ho" ]]; then
  printf '<cardmem-handoff>\n'
  printf 'The session that ran here before you left this. It is a WORK ORDER, not a story.\n\n'
  printf '%s' "$result" | jq -r '
    .last_handoff as $h
    | ("  handed over: " + ($h.at // "?"))
    , (if ($h.skipped_empty_rows // 0) > 0 then
         "  ^ NOT the newest entry. " + (($h.skipped_empty_rows|tostring))
         + " newer handover(s) carried no next step and no state of play — written by a script at compaction, not by a session. The newest was at "
         + ($h.newest_at // "?") + ". This is the last one that actually SAID something, so read its age before acting on it."
       else empty end)
    , (if $h.next_step then "  NEXT: " + $h.next_step else "  NEXT: (not answered — the previous session did not say)" end)
    , (if $h.state_of_play then "  WHERE IT STANDS: " + $h.state_of_play else "  WHERE IT STANDS: (not answered)" end)
    , (if $h.origin == "migrated" then
         "  ^ THIS IS NOT A HANDOVER. It is the single summary that survived the old one-slot field, carried in when handovers became a log. Do not act on it as a work order."
       else empty end)
    , (if ($h.in_progress_f_numbers | type) == "array" then
         (if ($h.in_progress_f_numbers | length) == 0 then "  cards: none (answered: it was working on no card)"
          else "  cards: " + ($h.in_progress_f_numbers | join(", ")) end)
       else "  cards: (not answered)" end)
    , (if ($h.uncarded_work | type) == "array" then
         ($h.uncarded_work[] | "  - [" + .basis + " @ " + .as_of + "] " + .what + (if .where then "  (" + .where + ")" else "" end)
            + (if .owner_last_said == "nothing" then "\n      ^ the previous session states the OWNER HAS NEVER SPOKEN on this — worth checking"
               elif .owner_last_said then "\n      ^ owner last said (" + .owner_last_said.at + "): \"" + .owner_last_said.quote + "\""
               else "" end))
       else "  work without a card: (not answered)" end)
    , (if ($h.owner_decisions | type) == "array" then
         ($h.owner_decisions[] | "  owner decided (" + .at + "): " + .decision)
       else empty end)
    , (if (($h.never_set // []) | length) > 0 then
         "\n  NEVER ANSWERED: " + ($h.never_set | join(", ")) + " — treat these as unknown, not as empty."
       else empty end)
  ' 2>/dev/null
  printf '\nA claim marked [assumed] was a GUESS when it was written. Check it before you act on it — on 18 September one such line said the owner had not answered when he had, ten minutes earlier.\n'
  printf '</cardmem-handoff>\n'
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

# F353.1 (cardmem) — WHAT started this session, read back from the row just
# written. ALWAYS one line, same shape whatever the source: this MEASURES, it
# does not branch. 'not recorded' would mean an older cardmem; (none) means the
# hook ran and cc named no source.
start_src=$(printf '%s' "$result" | jq -r '(.recent_starts // []) | if length == 0 then "" else (.[0].source // "(none)") end' 2>/dev/null || printf '')
if [[ -n "$start_src" ]]; then
  start_n=$(printf '%s' "$result" | jq -r '(.recent_starts // []) | length' 2>/dev/null || printf '?')
  printf '  Started by: %s (this session has %s recorded start(s))\n' "$start_src" "$start_n"
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
