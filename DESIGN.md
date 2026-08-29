---
name: cms
description: >-
  GENERATED SEED — extracted from packages/cms-admin/src/app/globals.css. Correct it; do not assume it is right.
colors:
  background: "oklch(0.211 0 0)"
  foreground: "oklch(0.985 0 0)"
  card: "oklch(0.239 0 0)"
  card-foreground: "oklch(0.985 0 0)"
  popover: "oklch(0.239 0 0)"
  popover-foreground: "oklch(0.985 0 0)"
  primary: "oklch(0.82 0.17 85)"
  primary-foreground: "oklch(0.1 0 0)"
  secondary: "oklch(0.301 0 0)"
  secondary-foreground: "oklch(0.985 0 0)"
  muted: "oklch(0.260 0 0)"
  muted-foreground: "oklch(0.630 0 0)"
  accent: "oklch(0.301 0 0)"
  accent-foreground: "oklch(0.985 0 0)"
  destructive: "oklch(0.65 0.22 25)"
  border: "oklch(0.301 0 0)"
  input: "oklch(0.260 0 0)"
  ring: "oklch(0.82 0.17 85)"
  sidebar: "oklch(0 0 0)"
  sidebar-foreground: "oklch(0.985 0 0)"
  sidebar-border: "oklch(0.301 0 0)"
  sidebar-header-border: "oklch(0.062 0 0)"
  sidebar-accent: "oklch(0.82 0.17 85 / 15%)"
  sidebar-accent-foreground: "oklch(0.82 0.17 85)"
rounded:
  DEFAULT: "0.5rem"
---
## This file was generated, and it is a starting point

Every value above was read out of `packages/cms-admin/src/app/globals.css` — 24 colour(s) and 1 radius token(s). Nothing here was chosen; it is a description of what this repo already looks like, written
down so there is something to correct.

**What to do with it.** Read the palette and delete what is not really part of it — a generated
list cannot tell a brand colour from a one-off. Then write the parts a stylesheet cannot know:
what the page shell is, which header a new route uses, whether buttons are round or square, and
which of these colours means "action" as opposed to "we happened to use it once".

**What this seed does NOT contain.** The extractor is a heuristic — which declarations
in a stylesheet are *tokens* is a judgement, not a fact — so it reports its own misses rather
than letting them read as absences. These are still in your stylesheet and still work:

- **27** · value is neither a colour nor a length this extractor can express (--color-background, --color-foreground, --color-card, --color-card-foreground, +23 more)

A seed silent about this would look complete, and the next reader would conclude the project
has no shadows rather than that nobody extracted them.

**We picked this file, and we might have picked wrong.** 3 other stylesheet(s) in
this repo also declare colours: examples/nextjs-boilerplate/src/app/globals.css (11 colours), examples/nextjs-github-boilerplate/src/app/globals.css (11 colours), examples/preact-boilerplate/src/styles/globals.css (11 colours). If one of those is the real design
system, point this file at it and re-run — the choice is a judgement, and you are the only one
who can settle it.

## Why this file matters

`DESIGN.md` is the source a cardmem session is handed at start-up, so a rule written here reaches
the next agent without anyone remembering to open a file. It is also what the drift lint measures
against: a raw colour used where a token above exists becomes a finding rather than a
conversation with the owner.

## Overview

_Replace this with what the product actually looks like, in a sentence or two._
