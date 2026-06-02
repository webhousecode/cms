---
name: pickup
description: Claim a card and move it to In progress. Takes an F-number (e.g. F033.6) or full slug. Returns the linked plan-doc content so you have full context without a second read_md call.
---

# /pickup F<n>

Args: a single F-number or global_slug — e.g. `F033.6` or `projects-F033.6`.

When invoked, call the `cardmem_pickup_card` MCP tool with:

```json
{
  "card_id_or_slug": "<the F-number user typed>",
  "session_id": "<current session_id, available from SessionStart context>",
  "note": "<optional one-line context — e.g. 'spawned by F035 dispatch'>"
}
```

The response contains the full plan-doc content in `plan_md`. Don't re-read it — it's the same text `cardmem_read_md` would return. Render a short confirmation:

```
✓ Picked up F033.6 — .claude/skills/ (board, pickup, handoff, refresh)
  Plan: docs/features/F033-cc-projects-integration.md · 3 SP · high priority
  AC: <pulled from plan-doc>
```

If the server rejects with "pickup blocked: card is in X, not Backlog or Ready", surface the error verbatim and ask Christian whether to override with `cardmem_move_card`.

Don't start coding immediately after pickup — first confirm the AC with Christian unless the context makes it clear.
