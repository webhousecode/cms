---
name: feature
description: Propose a new CMS feature — checks for duplicates, creates plan doc, adds to roadmap
argument-hint: "<feature idea in plain text>"
---

# New Feature Proposal: $ARGUMENTS

## Step 1: Check for duplicates

Read `docs/FEATURES.md` and scan all existing features (F01-F34+) to determine if this idea is already covered — fully or partially — by an existing feature.

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

Before writing the plan, analyze the feature idea in context of the CMS:

- How does it relate to existing architecture? (packages, storage adapters, admin UI, CLI, AI agents)
- What existing code/infrastructure can be reused?
- What are the dependencies? (which existing features must be done first)
- What's the right scope? (don't over-engineer, but don't leave gaps)
- Is this a core CMS feature, an admin UI feature, a plugin, or a standalone package?

## Step 4: Write the plan document

Create `docs/features/F{number}-{slug}.md` with this structure:

```markdown
# F{number} — {Feature Name}

> {One-line description}

## Problem
{What's missing today, why does the user need this}

## Solution
{High-level approach, 2-3 sentences}

## Technical Design

### {Key Component 1}
{TypeScript interfaces, file paths, API endpoints}

### {Key Component 2}
{...}

## Impact Analysis

### Files affected
{List every file that will be created, modified, or deleted. Use real paths.}

### Blast radius
{What existing features/systems could break? Check:}
- API routes that other components depend on
- Shared components used across multiple pages
- Type interfaces imported by other files
- Storage/registry format changes (backwards compatibility?)
- CSS/styling changes that affect other pages

### Breaking changes
{Will this change any existing API, interface, component prop, or data format? If yes, list migration steps.}

### Test plan
{How to verify this feature works AND hasn't broken anything:}
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] {Feature-specific test 1}
- [ ] {Feature-specific test 2}
- [ ] {Regression: verify X still works}
- [ ] {Regression: verify Y still works}

## Implementation Steps
1. {Concrete, ordered tasks}
2. {...}

## Dependencies
- {What must exist first, e.g. "F08 RAG Knowledge Base"}

## Effort Estimate
**{Small|Medium|Large}** — {estimated days}
```

The plan must be specific: real file paths in the monorepo, TypeScript interfaces that fit the existing architecture, actual npm packages to use. Think like a senior engineer writing a spec.

**IMPORTANT:** The Impact Analysis section is mandatory. Before writing the plan, search the codebase (using Grep/Glob) to find all files that import from or depend on the files you plan to modify. List them explicitly. This prevents breaking changes that go unnoticed.

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
