# F75 — AI Site Builder Guide (Modular Docs + AI Builder Site)

> Modular online docs that AI sessions fetch on-demand. Phase 1 (Done): split monolithic CLAUDE.md into 21 module files. Phase 2 (Done): dedicated AI Builder Site at `/ai` on docs.webhouse.app with self-guided walkthrough optimized for any LLM platform (Claude Code, Cursor, Copilot, Gemini, Windsurf).

## Problem

`packages/cms/CLAUDE.md` is **2421 lines** covering everything from Quick Start to i18n to Interactives. When an AI session loads it:

1. **Context waste** — A user asking "add a blog page" doesn't need the 200 lines about i18n or the 100 lines about storage adapters. The AI burns context window on irrelevant sections.
2. **Too big for some tools** — Cursor, Windsurf, and other AI editors have smaller context windows than Claude Code. They can't effectively use a 2400-line reference.
3. **Hard to maintain** — Every change requires editing one massive file. Sections are coupled — moving things around risks breaking internal cross-references.
4. **No selective loading** — The AI gets ALL of it or NONE of it. There's no way to say "fetch me the SEO section" without reading the whole file.

Meanwhile, Claude Code's `WebFetch` tool can pull raw .md files from URLs. If we split the guide into modules and give the AI an index, it can fetch only what it needs.

## Solution

Split CLAUDE.md into **15-20 focused module files** hosted as raw markdown on GitHub (or docs.webhouse.app). A slim **index document** (~80 lines) replaces the monolithic CLAUDE.md — it describes each module with a one-line summary and a fetch URL. The AI reads the index, identifies which modules are relevant to the user's task, and fetches only those.

## Technical Design

### 1. Module Split Map

Current CLAUDE.md sections → modules:

| Module file | Lines from CLAUDE.md | Content |
|---|---|---|
| `01-getting-started.md` | 1-35 | What is @webhouse/cms, Quick Start, scaffolding |
| `02-config-reference.md` | 36-267 | cms.config.ts, defineConfig, defineCollection, defineField |
| `03-field-types.md` | 77-267 | Complete field type reference (text, richtext, tags, select, blocks, etc.) |
| `04-blocks.md` | 268-331 | Block system, defineBlock, block rendering |
| `05-richtext.md` | 332-362 | Richtext embedded media, rendering in Next.js |
| `06-storage-adapters.md` | 363-447 | Filesystem, GitHub, SQLite adapter configs |
| `07-content-structure.md` | 401-599 | Content directory layout, loader functions, reading content |
| `08-nextjs-patterns.md` | 448-631 | Next.js App Router pages, generateStaticParams, metadata |
| `09-cli-reference.md` | 600-631 | CLI commands, AI commands |
| `10-config-example.md` | 632-816 | Complete cms.config.ts example (large real-world config) |
| `11-api-reference.md` | 817-861 | Programmatic usage, ContentService API |
| `12-admin-ui.md` | 862-928 | CMS Admin UI, Docker usage, npx usage |
| `13-site-building.md` | 929-1145 | Common mistakes, site building patterns, App Router structure |
| `14-relationships.md` | 1146-1313 | Content relationships, resolving relations, patterns |
| `15-seo.md` | 1314-1568 | SEO metadata, JSON-LD, sitemap, robots.txt, AI SEO |
| `16-images.md` | 1569-1695 | Image handling, optimization, responsive images |
| `17-i18n.md` | 1696-1857 | Internationalization, locale routing, translation |
| `18-deployment.md` | 1858-1952 | Deployment checklist, Vercel, Docker, Fly.io |
| `19-troubleshooting.md` | 1953-2203 | Common errors, debugging, FAQ |
| `20-interactives.md` | 2204-2421 | Data-driven interactives, embedding, rendering |

### 2. Index Document (replaces monolithic CLAUDE.md)

```markdown
# @webhouse/cms — AI Site Builder Guide

> This is the index. Fetch individual modules as needed — don't load everything at once.

## How to use this guide

You are building a website with @webhouse/cms. This guide is split into focused modules.
**Read the index below, then fetch ONLY the modules relevant to the current task.**

Use your web fetch tool to load modules from:
`https://raw.githubusercontent.com/webhousecode/cms/main/docs/ai-guide/{filename}`

## Module Index

| Module | When to fetch | URL |
|--------|--------------|-----|
| **Getting Started** | New project, first setup | `01-getting-started.md` |
| **Config Reference** | Defining collections, fields, config options | `02-config-reference.md` |
| **Field Types** | Adding or configuring specific field types | `03-field-types.md` |
| **Blocks** | Working with block-based content (hero, features, CTA) | `04-blocks.md` |
| **Richtext** | Embedded images/media in richtext, rendering | `05-richtext.md` |
| **Storage Adapters** | Configuring filesystem, GitHub, or SQLite storage | `06-storage-adapters.md` |
| **Content Structure** | Understanding content directory, loader functions | `07-content-structure.md` |
| **Next.js Patterns** | Pages, layouts, generateStaticParams, metadata | `08-nextjs-patterns.md` |
| **CLI Reference** | CMS CLI commands, AI commands | `09-cli-reference.md` |
| **Config Example** | Full real-world cms.config.ts as reference | `10-config-example.md` |
| **API Reference** | Programmatic ContentService usage | `11-api-reference.md` |
| **Admin UI** | CMS admin setup, Docker, npx | `12-admin-ui.md` |
| **Site Building** | Common patterns, App Router structure, mistakes to avoid | `13-site-building.md` |
| **Relationships** | Content relations, resolving, reverse lookups | `14-relationships.md` |
| **SEO** | Metadata, JSON-LD, sitemap, robots.txt, AI SEO | `15-seo.md` |
| **Images** | Image optimization, responsive, srcset | `16-images.md` |
| **i18n** | Multi-language, locale routing, translation | `17-i18n.md` |
| **Deployment** | Vercel, Docker, Fly.io deployment checklist | `18-deployment.md` |
| **Troubleshooting** | Common errors, debugging, FAQ | `19-troubleshooting.md` |
| **Interactives** | Data-driven interactive content, embedding | `20-interactives.md` |

## Quick decisions

- **"Add a blog"** → fetch 01, 02, 08, 13
- **"Set up SEO"** → fetch 15
- **"Deploy to Vercel"** → fetch 18
- **"Add i18n"** → fetch 17, 02
- **"Create a product catalog"** → fetch 02, 03, 04, 08
- **"Fix an error"** → fetch 19
- **"Embed interactives"** → fetch 20, 05
```

### 3. File Structure in Repo

```
docs/
  ai-guide/
    index.md                    # The slim index (replaces monolithic CLAUDE.md)
    01-getting-started.md
    02-config-reference.md
    03-field-types.md
    04-blocks.md
    05-richtext.md
    06-storage-adapters.md
    07-content-structure.md
    08-nextjs-patterns.md
    09-cli-reference.md
    10-config-example.md
    11-api-reference.md
    12-admin-ui.md
    13-site-building.md
    14-relationships.md
    15-seo.md
    16-images.md
    17-i18n.md
    18-deployment.md
    19-troubleshooting.md
    20-interactives.md
```

### 4. CLAUDE.md Replacement Strategy

The monolithic `packages/cms/CLAUDE.md` gets replaced with the slim index. Two options:

**Option A — Index in CLAUDE.md (recommended):**
```markdown
# @webhouse/cms — AI Site Builder Guide

[80-line index with module descriptions + URLs]

## Essential Quick Reference
[~100 lines of the most critical info: defineConfig, field types table, Quick Start]
```

Total: ~180 lines instead of 2421. The AI always has the index + essentials loaded, and fetches modules as needed.

**Option B — CLAUDE.md points to external index:**
```markdown
# @webhouse/cms
Fetch the AI Site Builder Guide index:
https://raw.githubusercontent.com/webhousecode/cms/main/docs/ai-guide/index.md
```

Option A is better because the AI always has the index without an extra fetch.

### 5. Scaffolded Project Integration

When `npm create @webhouse/cms` scaffolds a new project, the generated project CLAUDE.md includes:

```markdown
## CMS Documentation

This project uses @webhouse/cms. The full AI builder guide is split into modules.
Fetch the index to see all available documentation:

https://raw.githubusercontent.com/webhousecode/cms/main/docs/ai-guide/index.md

For common tasks:
- Adding pages/collections: fetch 02-config-reference.md + 08-nextjs-patterns.md
- SEO setup: fetch 15-seo.md
- Deployment: fetch 18-deployment.md
```

### 6. Hosting Options

| Option | URL pattern | Pros | Cons |
|--------|------------|------|------|
| **GitHub raw** | `raw.githubusercontent.com/webhousecode/cms/main/docs/ai-guide/*.md` | Free, auto-updates on push | Rate-limited (60 req/hr unauthenticated) |
| **docs.webhouse.app** | `docs.webhouse.app/ai-guide/*.md` | No rate limit, custom domain | Needs hosting, deploy pipeline |
| **npm package** | Bundled in `@webhouse/cms` | Works offline, no fetch needed | Stale until `npm update` |

**Recommendation:** Start with GitHub raw (zero setup). Move to docs.webhouse.app when F31 (Documentation Site) ships. Keep a bundled copy in npm package as offline fallback.

### 7. Version Tagging

Each module includes a version comment at the top:

```markdown
<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-18 -->
# Getting Started
...
```

The index includes the version so the AI can check if it has an outdated cached version.

## Impact Analysis

### Files affected
- `docs/ai-guide/` — new directory with 20 module files
- `packages/cms/CLAUDE.md` — replace monolithic file with slim index (~180 lines)
- `packages/create-cms/src/index.ts` — update scaffolder to reference module URLs

### Blast radius
- CLAUDE.md replacement affects all existing AI builder sessions
- Module URLs must remain stable — changing paths breaks cached references
- Scaffolder template changes affect new project creation

### Breaking changes
- `packages/cms/CLAUDE.md` shrinks from 2421 to ~180 lines — AI sessions must adapt to on-demand fetch

### Test plan
- [ ] All 20 module files are complete and accurate
- [ ] Index covers all modules with correct URLs
- [ ] Fresh Claude Code session can fetch modules via WebFetch
- [ ] Scaffolded project CLAUDE.md references correct module URLs

## Implementation Steps

1. Create `docs/ai-guide/` directory
2. Split `packages/cms/CLAUDE.md` into 20 module files following the split map above
3. Write `docs/ai-guide/index.md` — the slim index with module descriptions and fetch URLs
4. Replace `packages/cms/CLAUDE.md` with slim version (index + essential quick ref, ~180 lines)
5. Update `packages/create-cms/` scaffolder to reference module URLs in generated project CLAUDE.md
6. Add "Quick decisions" section to index mapping common tasks to module combos
7. Add version tags to each module header
8. Test with fresh Claude Code session: does it correctly fetch only relevant modules?
9. Test with Cursor/Windsurf: can smaller-context AI tools use the index effectively?
10. Update project CLAUDE.md to reference the modular guide


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- F24 (AI Playbook) — Done. This evolves the existing CLAUDE.md approach.
- F31 (Documentation Site) — Done. Hosts the AI Builder Site at `/ai`.
- No code dependencies — pure documentation restructuring + one Next.js route group.

## Effort Estimate

**Small** — 2 days

- Day 1: Split CLAUDE.md into 20 modules, write index, replace monolithic file
- Day 2: Update scaffolder, test with fresh AI sessions, polish module boundaries

---

# Phase 2 — AI Builder Site (`/ai` on docs.webhouse.app)

> Phase 1 shipped the modular docs on GitHub raw. Phase 2 makes them discoverable and
> consumable from a single canonical URL any AI coding platform can fetch — no GitHub API,
> no path juggling, no monolithic dump.

## Problem (Phase 2)

Phase 1 uses GitHub raw URLs (`raw.githubusercontent.com/.../docs/ai-guide/*.md`). That's
fine for Claude Code which can fetch them, but:

1. **Discoverability** — There's no one URL to give to an AI. "Fetch raw.githubusercontent.com
   paths" is too much setup friction.
2. **Rate limiting** — GitHub raw throttles at 60 req/hr unauthenticated. A fresh Claude Code
   session that fetches 5 modules + re-fetches index blows through that on a bad day.
3. **Platform variance** — Copilot, Gemini, Cursor chat, Windsurf — not all have ergonomic
   URL-fetch tooling for deep GitHub paths, but basically all of them can fetch a pretty
   URL like `ai.webhouse.app`.
4. **No self-guided entry point** — The existing `index.md` is a module index. It assumes
   the AI already knows what @webhouse/cms is. A blank AI session landed at index.md still
   needs to be told "you are an AI, follow these steps, if you're stuck fetch X."
5. **No machine-readable endpoints** — AI platforms increasingly expect `llms.txt`,
   structured manifest JSON, and versioning. GitHub raw markdown doesn't provide any of that.

## Solution (Phase 2)

Ship a dedicated AI Builder Site as a route group on docs.webhouse.app (which is already
built with @webhouse/cms — dogfooding). No new infra, no new domain to manage.

- **`/ai`** — Self-contained walkthrough: "You are an AI. Step 0... Step 1... If X then Y."
  Returned as `text/markdown` so browsers display the raw source and AIs get it verbatim.
- **`/ai/{slug}`** — All 21 deep-dive modules, one URL per module.
- **`/ai/llms.txt`** — llms.txt standard (for LLM site crawlers).
- **`/ai/manifest.json`** — JSON manifest with all modules + descriptions + endpoints.
- **`/ai/index.json`** — Minimal ordered module list.

Subdomain `ai.webhouse.app` points to the same origin via DNS CNAME + optional host rewrite
(so both `docs.webhouse.app/ai` and `ai.webhouse.app` work). The subdomain is marketing —
the `/ai` path is the canonical implementation.

All responses set `X-Robots-Tag: noindex` so the AI site doesn't bleed into search indexes
for humans. Cache headers: `public, s-maxage=300, stale-while-revalidate=86400` for CDN
friendliness.

## Technical Design (Phase 2)

### Route structure

```
cms-docs/src/app/ai/
  _lib.ts                       // shared readFile / response helpers
  route.ts                      // GET /ai → _walkthrough.md
  [slug]/route.ts               // GET /ai/{slug} → {slug}.md
  llms.txt/route.ts             // GET /ai/llms.txt
  manifest.json/route.ts        // GET /ai/manifest.json
  index.json/route.ts           // GET /ai/index.json
```

All routes use `export const dynamic = "force-static"` so they're pre-rendered at build
time. The `[slug]/route.ts` implements `generateStaticParams()` to enumerate all 21
modules. Unknown slugs return 404. Slugs starting with `_` are rejected (the walkthrough
file is internal).

### Source files

```
cms-docs/src/ai-guide/
  _walkthrough.md               // owned by cms-docs (the Step 0-9 guide)
  index.md                      // mirror of canonical docs/ai-guide/index.md
  01-getting-started.md
  02-config-reference.md
  ...
  21-framework-consumers.md
```

Files prefixed `_` are only reachable by the main `/ai` route (not by `/ai/[slug]`).
Non-prefixed files are served at their slug.

### Content strategy — the walkthrough

The walkthrough (`_walkthrough.md`) is the critical new content. It's structured as a
**procedure**, not a reference:

```markdown
## Step 0 — Verify environment
Check node >= 20, ask about project directory.

## Step 1 — Scaffold
npm create @webhouse/cms@latest ...

## Step 2 — Understand the model
[JSON format, cms.config.ts basics, field types, where to fetch more]

## Step 3 — Plan with user
[5 questions, collection mapping, wait for confirmation]

... Steps 4-9 ...

## Troubleshooting — first-pass fixes
[Error → Fix table]

## Deep-dive module index
[Links to /ai/01-..21-]

## Non-negotiable rules
[8 rules from CLAUDE.md critical rules section]
```

The AI can complete a basic build end-to-end without fetching any module. Modules are for
depth when the user asks for something specific (i18n, complex SEO, non-TS backend).

### Machine-readable endpoints

**`/ai/manifest.json`** (structured for programmatic use):

```json
{
  "name": "@webhouse/cms AI Builder Site",
  "version": "0.1.0",
  "entry": "https://ai.webhouse.app/ai",
  "canonical_source": "https://raw.githubusercontent.com/...",
  "package": { "name": "@webhouse/cms", "npm": "...", "repo": "..." },
  "modules": [
    { "slug": "01-getting-started", "url": "...", "description": "New project, first setup..." },
    ...
  ],
  "endpoints": { "walkthrough": "...", "llms_txt": "...", "manifest": "...", "index": "..." }
}
```

**`/ai/llms.txt`** — Standard llms.txt format with grouped sections (Main entry, Modules,
Machine-readable endpoints, Canonical source, Optional).

### Build integration

`next.config.ts` adds `outputFileTracingIncludes` so `src/ai-guide/**/*.md` ships with
the standalone build:

```typescript
outputFileTracingIncludes: {
  "/ai": ["./src/ai-guide/**/*.md"],
  "/ai/[slug]": ["./src/ai-guide/**/*.md"],
  "/ai/llms.txt": ["./src/ai-guide/**/*.md"],
  "/ai/manifest.json": ["./src/ai-guide/**/*.md"],
  "/ai/index.json": ["./src/ai-guide/**/*.md"],
}
```

### Keeping modules in sync

`cms-docs/scripts/sync-ai-guide.ts` copies `../cms/docs/ai-guide/*.md` → `src/ai-guide/`
(skipping `_`-prefixed files). Run manually after upstream docs change. No automatic
cron — module content is versioned and should be deliberately re-synced when CLAUDE.md
gets an update. The canonical source is always the cms monorepo; cms-docs holds a
snapshot.

## Impact Analysis (Phase 2)

### Files created
- `cms-docs/src/app/ai/_lib.ts` — shared helpers (readAiFile, listAiModules, responses)
- `cms-docs/src/app/ai/route.ts` — main walkthrough
- `cms-docs/src/app/ai/[slug]/route.ts` — module dispatcher
- `cms-docs/src/app/ai/llms.txt/route.ts`
- `cms-docs/src/app/ai/manifest.json/route.ts`
- `cms-docs/src/app/ai/index.json/route.ts`
- `cms-docs/src/ai-guide/_walkthrough.md` — the Step 0-9 procedure (owned here)
- `cms-docs/src/ai-guide/*.md` — synced copies of 21 modules + index
- `cms-docs/scripts/sync-ai-guide.ts` — sync script

### Files modified
- `cms-docs/next.config.ts` — add `outputFileTracingIncludes` for `src/ai-guide/**/*.md`

### Blast radius (Phase 2)
- New route group `/ai/*` — isolated from the existing `/docs/*` tree, zero risk to
  human-facing docs.
- No changes to `/api/*`, search index, or existing layout.
- `outputFileTracingIncludes` change only adds files to the standalone bundle — pure
  addition.

### Breaking changes (Phase 2)
None. Phase 2 is purely additive.

### Test plan (Phase 2)
- [x] TypeScript compiles: `npx tsc --noEmit` in cms-docs
- [x] `npm run build` completes, prerenders all 21 modules + /ai + 3 machine endpoints
- [x] Standalone output includes `src/ai-guide/*.md`
- [x] `curl http://localhost:3036/ai` returns 200 + text/markdown
- [x] `curl http://localhost:3036/ai/01-getting-started` returns 200 + module content
- [x] `curl http://localhost:3036/ai/nonexistent` returns 404
- [x] `curl http://localhost:3036/ai/_walkthrough` returns 404 (underscore-prefixed files protected)
- [x] `/ai/llms.txt` emits valid llms.txt with all 21 module links
- [x] `/ai/manifest.json` emits valid JSON with modules array + endpoints
- [ ] Fresh Claude Code session fetches `/ai` and completes Step 1-9 successfully
- [ ] Cursor + Copilot + Gemini sessions can each fetch and parse `/ai`
- [ ] After prod deploy: `https://docs.webhouse.app/ai` resolves

## Implementation Steps (Phase 2)

1. ✅ Sync `docs/ai-guide/*.md` from cms repo → `cms-docs/src/ai-guide/`
2. ✅ Write `_walkthrough.md` — the Step 0-9 self-contained build procedure
3. ✅ Build `_lib.ts` helpers (readAiFile, listAiModules, response constructors)
4. ✅ Wire `/ai/route.ts`, `/ai/[slug]/route.ts`, `/ai/llms.txt`, `/ai/manifest.json`, `/ai/index.json`
5. ✅ Add `outputFileTracingIncludes` in `next.config.ts`
6. ✅ `sync-ai-guide.ts` script for future upstream updates
7. ✅ Verify: type-check, prod build, all routes return expected content
8. ⏳ Deploy cms-docs (Fly.io auto-deploy on push to main)
9. ⏳ Point `ai.webhouse.app` DNS CNAME at cms-docs origin (optional, marketing only)
10. ⏳ Test with a clean-slate Claude Code session — build a site from `/ai` alone

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
