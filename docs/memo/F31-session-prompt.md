# F31 Documentation Site — Session Prompt

## Objective

Build `docs.webhouse.app` — a public documentation site for @webhouse/cms, 100% dogfooded on our own CMS. The site must match the quality and UX of [Fumadocs](https://fumadocs.dev) but be built entirely with @webhouse/cms + Next.js App Router. No external docs framework.

## Context

Read these files first:
- `docs/features/F31-documentation-site.md` — complete plan with all decisions
- `docs/features/F116-contextual-help.md` — HelpCard system (source of truth for help content)
- `packages/cms-admin/src/lib/help/articles.ts` — 10 existing help articles to expand into docs
- `packages/cms/CLAUDE.md` — AI builder guide (20 modular docs already written)
- `docs/FEATURES.md` — all features for reference content
- `docs/ROADMAP.md` — current project status

## Design Reference: Fumadocs

Study https://fumadocs.dev and replicate these patterns in our own code:

1. **Layout** — left sidebar (collapsible category tree) + main content area + right-side table of contents (auto-generated from headings). Sticky sidebar and TOC.
2. **Search** — ⌘K command palette with instant full-text search across all docs. Build a search index at build time.
3. **Code blocks** — syntax highlighting (use Shiki), copy button, filename tab, line highlighting, diff view.
4. **Dark/light theme** — dark default (matches CMS admin), light toggle. Use our brand colors: #F7BB2E (gold), #0D0D0D (dark).
5. **Typography** — clean, readable. System fonts. Generous line-height. Good heading hierarchy.
6. **Navigation** — breadcrumbs, prev/next page links at bottom, category grouping in sidebar.
7. **Callouts/admonitions** — tip, warning, info, danger boxes (like our HelpCard but for docs).
8. **Tabs** — for showing code in multiple languages/frameworks.
9. **API reference cards** — method badge (GET/POST), endpoint path, description, params table.
10. **Mobile** — responsive sidebar (hamburger), TOC collapses.

**IMPORTANT:** Do NOT use Fumadocs as a dependency. Build everything from scratch using Next.js App Router + @webhouse/cms. The point is dogfooding.

## Technical Requirements

### CMS Setup
- Create a new site in the monorepo (or separate `webhousecode/docs` repo — decide based on what's cleaner)
- `cms.config.ts` with 3 collections: `docs`, `api-reference`, `changelog`
- Content stored as JSON in `content/` directory (standard CMS filesystem adapter)
- Editable via CMS admin UI at localhost:3010

### Auto-Generation Scripts
Build these scripts in `scripts/`:

1. **`generate-api-docs.ts`** — scan `packages/cms-admin/src/app/api/**/*.ts` and extract:
   - HTTP method + path from route exports (GET, POST, PUT, DELETE)
   - JSDoc comments for descriptions
   - Request/response types
   - Output as `content/api-reference/{endpoint-slug}.json`

2. **`generate-help-docs.ts`** — read `packages/cms-admin/src/lib/help/articles.ts` and expand each HelpArticle into a full doc page with:
   - Article body as intro
   - Actions as "Next Steps" section
   - AI-generated code examples and expanded explanations
   - `helpCardId` field linking back to the in-app article

3. **`generate-config-docs.ts`** — parse `packages/cms/src/schema/types.ts` and generate config reference:
   - Every interface field documented
   - Default values from source
   - Usage examples

4. **`generate-cli-docs.ts`** — parse `packages/cms-cli/src/commands/*.ts` for CLI reference

5. **`seed-guides.ts`** — AI-generate the initial guide content:
   - Getting Started (install, configure, first build)
   - Collections & Fields (all field types with examples)
   - Blocks (block-based content)
   - Storage Adapters (filesystem, GitHub, Supabase)
   - Deployment (Vercel, Netlify, Fly.io, GitHub Pages, Cloudflare)
   - i18n (multi-language setup)
   - AI Agents (content generation, SEO, GEO)
   - SEO & GEO (visibility optimization)
   - Media (image processing, galleries)
   - Interactives (embedded components)
   - Admin UI (setup, Docker, auth)
   - MCP (Claude Desktop/Cursor integration)

### Next.js App Structure
```
app/
  layout.tsx          — DocsLayout with sidebar + TOC + search + theme toggle
  page.tsx            — Landing / getting started redirect
  [category]/
    page.tsx          — Category index
    [slug]/
      page.tsx        — Individual doc page
  api/
    [slug]/
      page.tsx        — API reference page
  changelog/
    page.tsx          — Changelog list
    [slug]/
      page.tsx        — Individual release
  search/
    route.ts          — Search API endpoint
components/
  docs-sidebar.tsx    — Category tree navigation
  docs-toc.tsx        — Table of contents from headings
  docs-search.tsx     — ⌘K search modal
  code-block.tsx      — Shiki syntax highlighting + copy
  callout.tsx         — Tip/warning/info/danger boxes
  api-card.tsx        — Method badge + endpoint + params
  prev-next.tsx       — Previous/next page navigation
  breadcrumbs.tsx     — Breadcrumb trail
```

### Deployment
- Fly.io, region `arn` (Stockholm)
- Domain: `docs.webhouse.app`
- Auto-deploy from main branch (or manual `fly deploy`)

### Markdown API
Expose docs content via API for embedding in CMS admin:
```
GET /api/docs?slug=getting-started → { title, content, category }
GET /api/docs/search?q=robots.txt → [{ slug, title, excerpt }]
GET /api/help/{helpCardId} → { title, body, fullContent }
```

## Content Strategy

- **English primary**, Danish via AI translation (F48 i18n is ready)
- **AI generates 99%** of initial content from source code + existing docs
- **Human adds screenshots** where marked with `<!-- SCREENSHOT: description -->`
- **Refresh agent** updates docs when source code changes

## What NOT to Do

- Do NOT use any external docs framework (Fumadocs, Nextra, Starlight, Docusaurus)
- Do NOT create a separate CMS instance — use the same @webhouse/cms packages
- Do NOT hardcode content — everything goes through CMS collections
- Do NOT skip GEO optimization — the docs site itself should score 90+ on our own Visibility dashboard

## Success Criteria

1. `docs.webhouse.app` serves a beautiful, searchable docs site
2. All API routes are auto-documented
3. All F116 HelpCard articles have expanded docs counterparts
4. `learnMorePath` links in HelpCards resolve to live docs pages
5. Search works with ⌘K
6. Dark/light theme
7. Mobile responsive
8. GEO optimized (robots.txt, llms.txt, sitemap, JSON-LD, RSS)
9. Content editable via CMS admin
