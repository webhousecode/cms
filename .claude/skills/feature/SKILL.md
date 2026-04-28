---
name: feature
description: Propose a new trail feature — checks for duplicates, creates plan doc, adds to roadmap
argument-hint: "<feature idea in plain text>"
---

# ⚠️ HARD RULE — READ THIS FIRST ⚠️

**When the user invokes this skill, you MUST write the full plan-doc file to disk in the SAME turn.** No exceptions. No deferrals. No "I'll write the plan next."

What is NOT acceptable:
- Adding a row to `docs/FEATURES.md` with a `[plan](features/F999-x.md)` link that points at a file you haven't written.
- Adding a row to `docs/ROADMAP.md` describing a feature that has no plan-doc behind it.
- Saying "planned" / "added to roadmap" / "F-numbered" when what you actually did is add an index row and nothing else.
- Deferring the plan with "I'll write the plan next" — you won't. The context that motivated the plan evaporates within a turn.

What IS required:
1. The plan-doc file (`docs/features/F<nn>-<slug>.md`) exists on disk BEFORE the `FEATURES.md` / `ROADMAP.md` entries are added.
2. The plan-doc captures the motivation, scope (in + explicit non-goals), architecture sketch, dependencies, and rollout while the conversation context that produced it is still live.
3. If the scope is still fuzzy when the user asks for the plan, write an interim plan-doc that records "open questions" at the top and call it out — don't silently skip the file.
4. The commit that introduces the F-number is the one that introduces the plan-doc. One commit, all three files (plan-doc + FEATURES.md + ROADMAP.md) land together.

Audit on 2026-04-23 found 43 feature entries in the index with no plan-doc behind them — the reasoning that originally justified them was lost forever because the plans were never written. That is the exact cost this rule exists to prevent. Do not repeat it.

Trigger check before committing any change that touches FEATURES.md or ROADMAP.md: does every F-number mentioned in the diff have a corresponding `docs/features/F<nn>-*.md` file? If not, write it now or remove the index row. No "I'll do it next turn." There is no next turn for context.

**This rule applies regardless of which LLM model is running (Opus, Sonnet, Qwen, etc.) and regardless of which cc client is used (Claude Code, opencode, Cursor).**

---

# New Feature Proposal: $ARGUMENTS

## Step 1: Check for duplicates

Read `docs/FEATURES.md` and scan all existing features to determine if this idea is already covered — fully or partially — by an existing feature.

Also scan `docs/features/F*-*.md` plan documents for overlap.

**If the idea IS already covered:**
- Tell the user which feature(s) cover it (e.g. "This is covered by F25 — Storage Buckets")
- Show the relevant section from the existing plan
- Ask if they want to extend/modify the existing feature instead
- STOP here — do not create a duplicate

**If the idea is PARTIALLY covered:**
- Tell the user which feature(s) overlap and how
- Ask if they want to extend the existing feature or create a new one
- If they want a new one, continue to Step 2

**If the idea is NOT covered:**
- Continue to Step 2

## Step 2: Assign feature number

Read `docs/FEATURES.md` to find the highest existing feature number. Assign the next number (e.g. if F34 is the last, the new one is F35).

## Step 3: Analyze the feature

Before writing the plan, analyze the feature idea in context of the codebase:

- How does it relate to existing architecture? (packages, storage adapters, admin UI, CLI, AI agents)
- What existing code/infrastructure can be reused?
- What are the dependencies? (which existing features must be done first)
- What's the right scope? (don't over-engineer, but don't leave gaps)
- Is this a core feature, an admin UI feature, a plugin, or a standalone package?

## Step 4: Write the plan document

Create `docs/features/F{number}-{slug}.md` with this **mandatory** structure. Every section must be present — write "None" or "Not applicable" if a section has no content.

```markdown
# F{number} — {Feature Name}

> {One-line description. Tier, effort, status.}

## Problem
{What's missing today, why does the user need this}

## Secondary Pain Points
{Related issues this also addresses — scope expansion justification. "None" if no secondary benefits.}

## Solution
{High-level approach, 2-3 sentences}

## Non-Goals
{What this explicitly does NOT do — prevents scope creep. List even if obvious.}

## Technical Design

### {Key Component 1}
{TypeScript interfaces, file paths, API endpoints}

### {Key Component 2}
{...}

## Interface
{Public API contracts: endpoints, types, events, config format. "Internal only — no public interface" if applicable.}

## Rollout
{How to ship incrementally — feature flags, migration strategy, phased deployment. "Single-phase deploy" if no incremental rollout needed.}

## Success Criteria
{Measurable outcomes: "X works within Y seconds", "Z metric improves by N%". At least 2 criteria.}

## Impact Analysis

### Files created (new)
{List every new file with full path from repo root}

### Files modified
{List every modified file with full path from repo root}

### Downstream dependents
{For EACH file listed in "Files modified" that already exists, use Grep to find ALL files that import from it. List them with exact import count and a note on whether they need changes or are unaffected. Format:

`apps/server/src/routes/uploads.ts` is imported by 7 files:
- `apps/server/src/app.ts` (1 ref) — mounts route, unaffected
- `apps/server/src/routes/documents.ts` (1 ref) — references upload types, unaffected
- ...

If a modified file has 0 downstream dependents (leaf file), note "No downstream dependents."
}

### Blast radius
{What existing features/systems could break? Check:}
- API routes that other components depend on
- Shared components used across multiple pages
- Type interfaces imported by other files
- Storage/registry format changes (backwards compatibility?)
- CSS/styling changes that affect other pages
- Edge cases: stale cookies, concurrent users, cache invalidation, large payloads

### Breaking changes
{Will this change any existing API, interface, component prop, or data format? If yes, list migration steps. "None — all changes are additive" if no breaking changes.}

### Test plan
{How to verify this feature works AND hasn't broken anything. At least 5 items:}
- [ ] TypeScript compiles: `pnpm typecheck`
- [ ] Unit: {specific test case}
- [ ] Unit: {specific test case}
- [ ] Integration: {specific test case}
- [ ] Integration: {specific test case}
- [ ] Manual: {specific verification step}
- [ ] Regression: {verify existing feature X still works}
- [ ] Regression: {verify existing feature Y still works}

## Implementation Steps
1. {Concrete, ordered task — completable in isolation}
2. {...}
{At least 5 steps, each specific enough to be a PR description}

## Dependencies
- {What must exist first, e.g. "F08 RAG Knowledge Base"}
- {"None" if no dependencies}

## Open Questions
{Unresolved decisions that block implementation. "None — all decisions made" if no open questions.}

## Related Features
{Cross-references to other F-numbers. Both dependencies ("depends on F08") and future extensions ("enables F76"). "None" if no related features.}

## Effort Estimate
**{Small|Medium|Large}** — {estimated days}
{Optional: breakdown by day/phase}
```

The plan must be specific: real file paths in the monorepo, TypeScript interfaces that fit the existing architecture, actual npm packages to use. Think like a senior engineer writing a spec.

**CRITICAL RULES:**

1. **Every section must exist.** Write "None", "Not applicable", or "Internal only" if a section has no content. Never omit a section.

2. **Downstream dependents must be grep-verified.** Before writing the Impact Analysis:
   - Use `rg` or `grep` to find ALL imports of each modified file
   - Count exact references per consumer
   - Note whether each consumer needs changes or is unaffected
   - Never estimate — always verify against actual code

3. **Non-Goals are mandatory.** Even if the feature seems narrow, explicitly state what it does NOT do. This prevents scope creep during implementation.

4. **Success criteria must be measurable.** Not "it works" — "300-Neuron KB generates output in ~100ms", "95% of cases handled automatically".

5. **Test plan must include regressions.** Every plan must verify that existing features still work after the change.

6. **Open Questions must be honest.** If there's a decision that hasn't been made (e.g., "Electron vs Tauri"), write it down. "I'll decide later" is not a plan.

## Step 5: Update FEATURES.md

Add the new feature to `docs/FEATURES.md`:

1. Add a row to the features table with the new number, name, status ("Planned" or "Idea"), and link to the plan doc
2. Add a description section at the bottom (same format as existing features)

## Step 6: Update ROADMAP.md

Add the feature to the Feature roadmap table in `docs/ROADMAP.md`.

## Step 7: Commit

```
git add docs/features/F{number}-*.md docs/FEATURES.md docs/ROADMAP.md
git commit -m "feat: add F{number} {Feature Name} to feature roadmap"
git push
```

## Step 8: Summary

Tell the user:
- Feature number and name
- One-sentence summary
- Key dependencies
- Effort estimate
- Link to the plan doc
