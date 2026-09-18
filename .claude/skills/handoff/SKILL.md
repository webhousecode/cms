---
name: handoff
description: Ship a card to Review with a summary + optional branch / commit-sha / evidence. Validates the card is currently In progress. The summary becomes the audit_log row body AND the intercom message Christian sees.
---

# /handoff F<n> "<summary>"

Args:
- F-number or global_slug (required)
- Summary string (required — one line, what was shipped)
- Optional: `--branch=agent/F<n>` if the work landed on a feature branch
- Optional: `--sha=<commit_sha>` to attach the commit
- Optional: `--evidence=<url|path>` (smoke-test output, screenshot path, etc.)

When invoked, call the `cardmem_handoff_card` MCP tool with:

```json
{
  "card_id_or_slug": "<F-number>",
  "summary": "<one-line summary>",
  "session_id": "<current session_id, available from SessionStart context>",
  "branch": "<optional>",
  "commit_sha": "<optional>",
  "evidence": "<optional>"
}
```

**Always pass `session_id`** — it's what lets the server attribute the
handoff to your agent in the audit log AND enables queue-drain
dispatch (F035.13). Without it the post-handoff hook can't fire.

If the server rejects with "handoff blocked: card is in X, not In progress", the card needs `/pickup` first. Surface that to Christian.

After successful handoff:
1. Render a short confirmation showing prev_column → review and the summary
2. The notify-bridge will deliver the same summary to Christian as an intercom message — no need to re-announce
3. Don't auto-move to Done. Christian flips that himself after visual verification (rule per F033 plan-doc, §workflow)
4. **Inspect the response for `queue_drain.dispatched`** — if `true`,
   immediately call `cardmem_pickup_card({ card_id_or_slug:
   response.queue_drain.next_card_id, session_id })` in the same turn.
   This is the F035.14 queue-drain contract: when the user has set
   queue-drain mode, finishing one card immediately starts the next.
   No confirmation. See `.claude/skills/queue-drain/SKILL.md` for the full rule.

## Is the deploy actually live? One request (F343.29)

Before writing "deployed" in a summary, read the marker rather than the exit code:

```bash
curl -s https://www.cardmem.com/api/health | python3 -c 'import sys,json;print(json.load(sys.stdin)["build"])'
git rev-parse HEAD
```

**EQUALITY is the answer, not "a sha came back".** A stale marker is what a
finished-looking deploy of the previous image reports, and it is the exact
failure this check exists to catch.

`build: null` means the image was built without `BUILD_SHA`, so the two builds
CANNOT be told apart — say that out loud rather than treating it as a pass. And
`flyctl`/`gh run` exit 0 means the pipeline finished, never that the code is
serving: nine deploys once went out behind a null marker and each was confirmed
by inventing a one-off probe.

Pattern for the summary:
- Good: "Shipped X with Y unit tests + smoke-tested round-trip"
- Bad: "Done" / "Finished" / "ok"

The summary is what Christian sees first — make it informative.
