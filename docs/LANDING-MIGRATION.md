# Landing Page → CMS-managed Example Site

## Goal
Migrate the static `landing.html` to a CMS-managed example site at `examples/landing/`,
proving that @webhouse/cms can manage its own marketing page.

## Status Log

### Phase 1: Plan & Setup ✅
- [x] Define cms.config.ts with collections/blocks for landing page sections
- [x] Create examples/landing/ directory structure
- [x] Seed initial content from current landing.html into JSON files (home.json)
- [x] Copy logo assets to public/

### Phase 2: Schema Design ✅
- [x] `pages` collection with block-based content field
- [x] Block types: hero, stats, features, architecture, mcp, cta
- [x] Each block maps to a section of the current landing page
- [x] Nested arrays for terminal lines, stats items, feature cards, MCP cards
- [x] Content seeded into content/pages/home.json

### Phase 3: Build Pipeline
- [ ] Template that renders blocks → static HTML+CSS (same output as current landing.html)
- [ ] No framework dependency — pure static output
- [ ] Assets (SVGs, fonts) bundled correctly

### Phase 4: Integration
- [ ] Admin can edit landing page content via cms-admin
- [ ] Build produces identical (or better) output to current landing.html
- [ ] Replace static landing.html with CMS-built output

## Decisions & Issues

| Date | Decision/Issue | Outcome |
|------|---------------|---------|
| 2026-03-14 | Started migration | — |
| 2026-03-14 | Schema designed with 6 block types | hero, stats, features, architecture, mcp, cta |
| 2026-03-14 | Content seeded from landing.html | home.json with all sections as blocks |
| 2026-03-14 | Assets copied | eye icon, wordmark, architecture diagram |

## Architecture

```
examples/landing/
├── cms.config.ts          # Schema: pages collection with block types
├── content/
│   └── pages/
│       └── home.json      # Landing page content (hero, features, etc.)
├── templates/
│   └── page.html          # HTML template with block rendering
├── public/
│   ├── webhouse-icon.svg
│   ├── webhouse-wordmark-dark.svg
│   └── architecture-diagram.svg
└── dist/                  # Build output
    └── index.html         # Final static landing page
```
