#!/usr/bin/env bash
# F057-hardening — PostToolUse hook that enforces the queue-drain contract.
#
# Fires after every successful tool call. We only care about
# cardmem_handoff_card: when its response carries
# queue_drain.dispatched=true (or there are still ready cards), we inject
# a system-reminder telling cc to act NOW — no asking, no commentary.
#
# The skill (queue-drain.md) already says this, but cc has been observed
# to "interpret" wishy-washy text and pause for confirmation between
# handoffs. This hook removes that discretion: the instruction lands as
# a system-reminder which cc treats as authoritative.
#
# Inputs (stdin JSON from cc PostToolUse):
#   { tool_name: "cardmem_handoff_card",
#     tool_input: {...},
#     tool_response: {...},  ← contains queue_drain block
#     session_id: ... }

set -u
input=$(cat)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')

# Only handle cardmem_handoff_card. Silent no-op for everything else.
if [[ "$tool_name" != "cardmem_handoff_card" ]]; then
  exit 0
fi

# Parse the queue_drain block from the tool response. The response is
# nested under .tool_response (and may be a stringified JSON or already
# parsed depending on the harness — try both).
queue_drain=$(printf '%s' "$input" | jq -c '.tool_response.queue_drain // empty' 2>/dev/null)
if [[ -z "$queue_drain" || "$queue_drain" == "null" ]]; then
  # Older cc versions wrap result.content[0].text as a JSON string.
  inner=$(printf '%s' "$input" | jq -r '.tool_response.content[0].text // empty' 2>/dev/null)
  if [[ -n "$inner" ]]; then
    queue_drain=$(printf '%s' "$inner" | jq -c '.queue_drain // empty' 2>/dev/null)
  fi
fi

if [[ -z "$queue_drain" || "$queue_drain" == "null" ]]; then
  # No queue_drain block — handoff happened without queue-drain context
  # (project not opted in, or pre-F035.13 server). Nothing to enforce.
  exit 0
fi

dispatched=$(printf '%s' "$queue_drain" | jq -r '.dispatched // false')
next_card_id=$(printf '%s' "$queue_drain" | jq -r '.next_card_id // empty')
next_card_slug=$(printf '%s' "$queue_drain" | jq -r '.next_card_global_slug // empty')
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [[ "$dispatched" == "true" && -n "$next_card_id" ]]; then
  # The cloud has explicitly told us to pick up the next card. Inject a
  # hard imperative — cc must comply or violate the queue-drain contract.
  cat <<EOF
<system-reminder source="queue-drain-hook" severity="binding">
QUEUE-DRAIN CONTRACT — BINDING RULE
====================================
You just handed off a card. The cloud dispatched the next Ready card to
this session: ${next_card_slug} (id=${next_card_id}).

You MUST call cardmem_pickup_card NOW in the same turn:

  cardmem_pickup_card({ card_id_or_slug: '${next_card_id}', session_id: '${session_id}' })

DO NOT:
- ask the user whether to continue
- explain what you're about to do before doing it
- check, verify, or "make sure" before picking up
- pause for any reason

The user already gave the directive when they flipped cards to Ready.
Asking again is a contract violation. Pick up. Now.

If the dispatched card turns out to be archived or already-claimed
(server-side picker bug), then call cardmem_list_cards({ column: 'ready' })
and pick up the first valid ready card — STILL without asking. Falling
back is allowed; asking is never allowed.
</system-reminder>
EOF
  exit 0
fi

# Dispatched=false → queue is empty per cloud. Confirm idle one-liner but
# don't enforce action.
if [[ "$dispatched" == "false" ]]; then
  cat <<EOF
<system-reminder source="queue-drain-hook" severity="info">
Queue-drain: cloud reports Ready empty. Idle is correct. If the user
flips another card to Ready, the daemon will broadcast an intercom event
and you act on that — without asking.
</system-reminder>
EOF
fi
