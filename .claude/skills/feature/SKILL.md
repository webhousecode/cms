---
name: feature
description: Implement a CMS feature from its plan document
argument-hint: "<feature-code> e.g. F25"
---

# Implement Feature $ARGUMENTS

## Step 1: Read the plan

Read the feature plan from `docs/features/`. The feature code is the first argument (e.g. F25).

Find the matching file:
```
docs/features/F*-*.md
```

Match on the feature code prefix (F01, F02, ..., F34). Read the full plan document — it contains:
- Problem statement
- Solution approach
- Technical design with TypeScript interfaces
- Implementation steps (ordered)
- Dependencies
- Effort estimate

## Step 2: Check dependencies

Before implementing, verify that all dependencies listed in the plan are met. If a dependency is not yet implemented, tell the user and suggest implementing that first.

## Step 3: Update status

In `docs/FEATURES.md`, find the feature entry and change its status from "Planned" or "Idea" to "In progress".

In `docs/ROADMAP.md`, add the feature to the "In progress" section if not already there.

## Step 4: Implement

Follow the implementation steps from the plan document:

1. Create files at the paths specified in the technical design
2. Follow existing code patterns in the codebase
3. Use the TypeScript interfaces defined in the plan
4. Build and type-check after each major step
5. Commit frequently with descriptive messages

**Important conventions:**
- Use `CustomSelect` instead of native `<select>` in admin UI
- Use inline styles with CSS variables (`var(--border)`, `var(--card)`, etc.) for editor components
- Use Tailwind classes for admin pages
- Deploy region: always `arn` (Stockholm) for Fly.io/Supabase
- Never hardcode secrets — use env vars or `_data/` config files

## Step 5: Test

- Run `npx tsc --noEmit -p packages/cms-admin/tsconfig.json` for type checking
- Build the relevant package(s) with `npx tsup`
- Test manually if applicable

## Step 6: Mark complete

1. Update `docs/FEATURES.md` — change status to "Done"
2. Update `docs/ROADMAP.md` — move to Done section with today's date
3. Final commit: `feat: implement $ARGUMENTS`
4. Push to main

## Step 7: Publish (if applicable)

If the feature changes a publishable npm package (`@webhouse/cms`, `@webhouse/cms-cli`, etc.), trigger a patch release:

```bash
gh workflow run publish.yml -f version=patch
```
