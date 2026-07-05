---
name: feature
description: Propose a new feature in any cardmem-compatible repo — checks for duplicates, writes the plan-doc, creates the epic + stories on the board via MCP. Hard rule: the plan-doc file lands in the SAME turn as the F-number. Skill is project-agnostic; paths come from the repo's own CLAUDE.md "## Project layout" section.
argument-hint: "<feature idea in plain text>"
---

# ⚠️ HARD RULE — READ THIS FIRST ⚠️

**When the user invokes this skill, you MUST write the full plan-doc file to disk in the SAME turn.** No exceptions. No deferrals. No "I'll write the plan next."

What is NOT acceptable:
- Calling `cardmem_create_feature` (or `cardmem_create_card`) with an F-number that has no plan-doc file behind it on disk.
- Saying "planned" / "F-numbered" / "added to board" when what you actually did is create a card and nothing else.
- Deferring the plan with "I'll write the plan next turn" — you won't. The context that motivated the plan evaporates within a turn.
- Adding rows to a `FEATURES.md` / `ROADMAP.md` mirror that point at a plan-doc you haven't written.

What IS required:
1. The plan-doc file (`docs/features/F<nn>-<slug>.md`) exists on disk BEFORE the board entry is created via MCP.
2. The plan-doc captures motivation, scope (in + explicit non-goals), architecture sketch, dependencies, and rollout while the conversation context that produced it is still live.
3. If the scope is still fuzzy, write an interim plan-doc with "Open Questions" at the top — don't silently skip the file.
4. The commit that introduces the F-number is the one that introduces the plan-doc.

**Cardmem-board note:** the cardmem board IS the feature index — no `docs/FEATURES.md` table needs to be maintained, the board renders directly from the `cards` table via MCP. `cardmem_create_feature` writes the row; `cardmem_write_plan` writes the markdown. Both must succeed in the same flow.

Audit on 2026-04-23 in the trail repo found 43 feature entries with no plan-doc behind them — the reasoning that justified them was lost forever. Do not repeat it here. The board's `plan_file_path` column is checked against disk by F003.4 webhook reconciliation — orphan F-numbers are visible.

**This rule applies regardless of which LLM model is running (Opus, Sonnet, Qwen, etc.) and regardless of which cc client is used (Claude Code, opencode, Cursor).**

---

# New Feature Proposal: $ARGUMENTS

## Step 1: Check for duplicates

Call `cardmem_search({ q: "<keywords from the idea>", k: 10 })` to find overlap. Read any matching plan-docs via `cardmem_read_md`.

**If the idea IS already covered:**
- Tell the user which F-number(s) cover it ("This is covered by F031 — Cmd+K palette")
- Show the relevant excerpt from the existing plan-doc
- Ask if they want to extend/modify the existing feature
- STOP — do not create a duplicate

**If PARTIALLY covered:**
- Tell which features overlap and how
- Ask if they want to extend or create new
- If new, continue

**If NOT covered:**
- Continue to Step 2

## Step 2: Assign feature number

Call `cardmem_suggest_next_f_number({ project_id })`. Use the `suggested` field. (Sub-stories under an existing epic: pass `parent_card_id`.)

## Step 3: Analyze the feature

Before writing, **read this repo's `CLAUDE.md` — specifically its `## Project layout` section** — and analyze against the listed areas.

- Which areas of the codebase does this touch? Read the `## Project layout` table in CLAUDE.md and pick one or more (server / web / schema / integrations / daemon / infra / etc — the exact set is per-repo). Use the table's `Path` column to ground the plan in real file locations.
- Which existing infrastructure is reusable? Look for prior `F<n>` plan-docs covering related areas via `cardmem_search`.
- Dependencies on other F-numbers (read the board via `cardmem_list_cards`)?
- Right scope — not too broad, not too narrow. Epic vs story:
  - **Epic** if >3 distinct workstreams or >2 days of work
  - **Story** if a single shippable unit (~half a day)
  - **Task / subtask** if a sub-piece of a story

> If the repo's `CLAUDE.md` is missing the `## Project layout` section, STOP. The skill cannot scope work without it. Either add the section first (see cardmem's own CLAUDE.md as the reference impl: a markdown table with `Area | Path | Notes` columns), or fall back to inspecting the file tree directly and propose the section as part of the plan-doc.

## Step 3.5: Discovery reuse check — reuse before you build

> Canonical per **F217**. The fleet's shared `@broberg/*` inventory is the source of truth — a hand-rolled copy of a capability it already covers is drift. Do this **BEFORE** writing the plan, so the plan reflects reuse decisions instead of re-discovering them at code-time.

For every cross-cutting capability the feature needs (mail, auth/session, web-push, LLM/AI, storage, telemetry, cron, design tokens, secret-redaction, fleet comms, browser automation, …):

1. **Search Discovery** (no auth on reads): `GET https://discovery.broberg.ai/api/search?q=<capability>` — spans components + `@broberg/*` packages + infra best-practices. Skim `GET https://discovery.broberg.ai/api/packages` for the full roster if unsure what exists.
2. **Decide reuse-vs-build** per capability: a matching package → consume it (exact-pin prod deps); no match → build it (and tell `components` so it lands for everyone).
3. **Record the outcome in the plan-doc's `## Reuse` section** (in the template below) — one line per capability: the package to reuse, or an explicit "no match — build".

The session-start `discovery_reuse` block (F217.1) already hands you THIS repo's *gap* (shipped packages it hasn't adopted); this step is the per-feature version at plan-time. If Discovery is unreachable, note that in `## Reuse` and proceed — the check is required, but a network outage never blocks a plan.

## Step 4: Write the plan-doc

Create `docs/features/F<nn>-<slug>.md` with this **mandatory** structure. Every section must be present — write "None" / "Not applicable" if a section has no content.

```markdown
# F<nn> — <Feature Name>

> <One-line description. Tier, effort, status.>

## Summary
<1-3 plain sentences: what this feature is and what it delivers, readable on its own. This is the FIRST section and it is MANDATORY — the chat plan-ref drawer (F158) shows exactly this block when someone clicks an F-number in chat, and `extractPlanSummary` reads it as the plan's stored summary (`plans.summary`). Keep it jargon-light and self-contained — no "see below", no F-number cross-refs.>

## Motivation
<What's missing today, why does the user / project need this. Lead with the symptom Christian (or the team) saw, then the underlying gap.>

## Solution
<High-level approach, 2-3 sentences>

## Reuse
<Per F217 — the result of the Discovery reuse check (Step 3.5). One line per cross-cutting capability: the `@broberg/*` package to reuse (with version), OR an explicit "no match in Discovery — build (and notify components)". Write "None — no cross-cutting capabilities" only when the feature is genuinely repo-local.>

## Scope

### In scope
<Bulleted list of what this F-number covers. Be specific — real file paths, real components.>

### Out of scope
<Explicitly NOT in scope. Prevents creep. List even if obvious; "obvious" is often where reviewers disagree.>

## Architecture

### <Key Component 1>
<TypeScript interfaces, file paths, API endpoints, MCP tool names. Real names — no placeholders.>

### <Key Component 2>
<...>

## Stories
- **F<nn>.1** — <one-line>
- **F<nn>.2** — <one-line>
<At least 1; epics typically 3-7. Each story should be shippable in isolation (1 commit, 1 board-move Backlog → Review).>

## Acceptance criteria
1. <Measurable outcome: "X works within Y seconds", "Z metric improves by N%", "Playwright test passes">
2. <...>
<At least 3. "It works" is not measurable; rephrase.>

## Dependencies
- <F-numbers that must exist first>
- "None" if no dependencies

## Rollout
<How to ship incrementally — flags, migration strategy, phased deployment. "Single-phase" if no incremental rollout. Note any rollback path.>

## Open Questions
<Unresolved decisions blocking implementation. List the actual question, not "TBD". "None — all decisions made" if all decided.>

## Effort estimate
**<S | M | L>** — <estimated days>
```

The plan must be specific: real file paths drawn from the repo's `## Project layout` table, real package/module names, real MCP tool names, real schema/table names. Senior-engineer-writing-spec quality.

### Critical rules

0. **`## Summary` is mandatory and comes first** (right after the H1 + status line). 1-3 self-contained sentences — the chat plan-ref drawer (F158) renders exactly this block and `cardmem_write_plan` stores it as `plans.summary`. A plan without a usable `## Summary` shows "no summary yet" in chat. Never skip it.
1. **Every section must exist.** Write "None" if empty. Never omit.
2. **Non-goals are mandatory.** Even if obvious, write them — prevents scope creep during implementation.
3. **Acceptance criteria must be measurable.** Not "it works" — "MCP tool returns in <200ms", "Playwright suite passes".
4. **Stories must be shippable in isolation.** Each story should produce a green commit + a board move from Backlog → Review.
5. **Open Questions must be honest.** If "Electron vs Tauri" is undecided, write it. "I'll decide later" is not a plan.
6. **`## Reuse` is mandatory (F217).** Run the Discovery reuse check (Step 3.5) and record the reuse-vs-build decision per capability. A plan-doc with no `## Reuse` section trips the F217.3 advisory. Write "None — no cross-cutting capabilities" only when the feature is genuinely repo-local.

## Step 5: Create the board entries via MCP

Order matters — plan-doc on disk FIRST, then `cardmem_write_plan` (which commits via GitHub App if available), then board cards.

### 5a. Persist + commit the plan-doc

```
cardmem_write_plan({
  project_id,
  file_path: "docs/features/F<nn>-<slug>.md",
  content: <full markdown body from Step 4>,
  commit_message: "docs(F<nn>): plan — <Feature Name>"
})
```

### 5b. Create the epic card

```
cardmem_create_card({
  project_id,
  kind: "epic",
  f_number: "F<nn>",
  title: "<Feature Name>",
  role: "<workflow / backend / UI / etc.>",
  task: "<short 1-paragraph what this epic delivers>",
  context: "<motivation, links to dependencies>",
  constraints: [<bulleted Christian-CLAUDE.md-style constraints>],
  priority: <"critical" | "high" | "medium" | "low">,
  status_column: "backlog",
  plan_md: { file_path: "docs/features/F<nn>-<slug>.md", content: <body>, commit_message: "..." }
})
```

(If you used `cardmem_write_plan` in 5a, omit `plan_md` from `create_card` — the F003.4 webhook reconciles them by file_path. Otherwise pass `plan_md` to create both in one call.)

### 5c. Create sub-story cards (use `create_cards` for batch)

> **HARD RULE (F104) — an epic MUST have ≥1 story.** An epic is only a plan + a holder; it is NOT a visual card — a human can't see, click or flip an epic, only its stories. A story-less epic is an *invisible delivery*: nothing on the board says it must happen or that it happened. So **never create an epic without at least one story, and never hand an epic to Review/Done story-less** — the server rejects that move with a 422 (F104.1) and the Health Matrix flags it RED (F104.4). Even a one-line feature gets one story. This is non-skippable.

```
cardmem_create_cards({
  project_id,
  parent_card_id: <epic id from 5b>,
  cards: [
    { kind: "story", f_number: "F<nn>.1", title: "...", priority: "high", story_points: 3 },
    { kind: "story", f_number: "F<nn>.2", title: "...", priority: "medium", story_points: 2 },
    ...
  ]
})
```

## Step 6: Commit (if not already via write_plan)

If `cardmem_write_plan` ran with a configured GitHub App, the commit already exists. Otherwise:

```
git add docs/features/F<nn>-<slug>.md
git commit -m "docs(F<nn>): plan — <Feature Name>"
git push
```

## Step 7: Summary back to the user

- F-number + name
- One-sentence summary
- Number of stories created
- Priority + effort estimate
- Link to the plan-doc (relative path) + the cardmem board URL (`https://www.cardmem.com/board` in prod; `http://127.0.0.1:3019/board` if running cardmem locally).

## Reference — Christian's UFRAVIGELIGE conventions (from global CLAUDE.md)

When writing plans, internalize these. They apply at code-time, not skill-time — but the plan should reflect them so the implementing cc doesn't re-discover them.

- **`cb@webhouse.dk` is permanent admin** in every auth table. Never DELETE or demote.
- **Aldrig påstå noget virker uden bevis.** `curl 200` ≠ browser works. Use Chrome DevTools MCP or say "not runtime-verified".
- **Knapper SKAL give feedback.** `:active`, `:hover`, loading >100ms, post-action confirmation, error state.
- **Ingen quick-fixes.** No deprecated APIs, symptom-hides, empty catch blocks. Find root cause.
- **Aldrig native dialogs eller form-controls.** No `window.alert/confirm/prompt`, no `<select>`, no `<input type="date">`. Build custom or reuse from the repo's own UI primitives folder (see `## Project layout` for its path).
- **An epic MUST have ≥1 story (F104).** Only stories are visible/clickable/flippable; a story-less epic is an invisible delivery. The server rejects epic→Review/Done with 0 stories. Story-first, always.
- **ALDRIG hardcoded values.** One source per value — URL/domain → env, secrets → flyctl, fee tiers → central config, theme tokens → CSS vars in `@theme`.
- **HTTP-services: altid auth.** Fjern aldrig auth som workaround.
- **Destruktive commands** (rm -rf, DROP TABLE, force push, fly destroy, DNS-deletion, kill, chmod 777) only on explicit user order.
- **CC udfører ALT manuelt arbejde.** Never ask Christian to run a command, redeploy, copy-paste output, or open a browser to verify something MCP can verify.

Plans that ignore these will be flagged by buddy F47 review.
