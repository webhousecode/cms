---
name: inbox
description: Capture an idea / bug / TODO to your personal projects Inbox. Inline #tags supported. Triage later via /inbox web route.
argument-hint: "<idea text with optional #tags>"
---

# /inbox: $ARGUMENTS

You just captured an idea via the inbox slash-command. Do the following in a single turn — no clarifying questions.

## Step 1 — Parse the input

The full free-text input is in $ARGUMENTS above. Split it into two parts:

- **tags**: every `#token` substring (e.g. `#ux`, `#v1.5`, `#bug`). Lowercase, deduped. Empty array if none.
- **text**: the body with the `#tag` markers REMOVED + trimmed. Empty string is an error — abort and tell the user the call needs a body.

Example:
```
$ARGUMENTS = "Add dark-mode toggle on the web sidebar #ux #v1.5"
→ tags = ["ux", "v1.5"]
→ text = "Add dark-mode toggle on the web sidebar"
```

## Step 2 — Call `cardmem_capture_idea`

```
cardmem_capture_idea({
  target: { type: "inbox" },
  text: <parsed text from Step 1>,
  tags: <parsed tags array>,
  source: "mcp"
})
```

(The `source: "mcp"` field is V2 metadata. If your tool schema rejects unknown fields, drop it — the MCP tool returns a clear error and you should retry without `source`. Don't invent other fields.)

## Step 3 — Confirm to the user

Print one short line:

```
✓ captured to Inbox: "<first 60 chars of text>..." [tags: ux, v1.5]
```

Then STOP. Do NOT:

- Create a card on any board (the Inbox is the triage surface — promotion happens later in the /inbox web UI or via `cardmem_promote_idea`)
- Open the plan-doc for any related F-number
- Suggest a project to promote it to (that's V2 — AI auto-suggest target project)
- Add ANY trailing commentary beyond the one-line confirmation

The whole point of this skill is **low-friction parking**. Christian had a thought; he jotted it; you confirmed it landed. He triages later when he has headspace. Don't add ceremony.

## Edge cases

- **Empty body after stripping tags** (e.g. user typed only `#bug`) → respond `❌ /inbox needs a body, not just tags. Example: /inbox fix login bug #auth` and call NOTHING.
- **No tags** → tags = []. Still call. Idea-without-tag is the most common case.
- **Idea contains code blocks or multiline text** → preserve verbatim in the `text` field. Don't reformat.
- **Idea references an F-number** (e.g. "see F033.6") — do NOT pickup or move that card. The whole point of Inbox is to park, not act.

## Why this is a skill not a tool

We could expose `cardmem_capture_idea` directly as the user-facing surface. We don't because:
1. Inline `#tag` parsing is a UI affordance, not a server contract. The skill does the parsing in-prompt; the MCP tool stays clean (`tags: string[]`).
2. The "stop after capture" rule keeps the interaction <1 turn, which matters for capture latency.
3. Future capture sources (Discord, Slack, email-inbox, voice memo) reuse the SAME `cardmem_capture_idea` server contract but each surface has its own ergonomic adapter — `inbox.md` is the CD/cc adapter.
