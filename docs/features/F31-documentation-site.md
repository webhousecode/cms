# F31 — Documentation Site

> Full documentation site built with @webhouse/cms, auto-generated from source code.

## Problem

There is no public documentation site for @webhouse/cms. Documentation lives in CLAUDE.md (optimized for AI, not humans), README.md fragments, and inline code comments. Users cannot browse API references, guides, or examples on the web.

## Solution

A documentation site at `docs.webhouse.app` built with @webhouse/cms itself (dogfooding). Auto-generated API reference from source code and OpenAPI spec. Hand-written guides and tutorials. Versioned docs. Full-text search.

## Technical Design

### Site Structure

```
docs.webhouse.app/
  /                         # Landing page
  /getting-started          # Quick start guide
  /concepts                 # Core concepts (collections, fields, blocks, etc.)
  /guides/                  # How-to guides
    /guides/add-blog
    /guides/deploy-vercel
    /guides/ai-agents
    /guides/i18n
  /api/                     # API reference
    /api/content
    /api/schema
    /api/mcp
  /config/                  # Configuration reference
    /config/collections
    /config/fields
    /config/storage
    /config/ai
  /cli/                     # CLI reference
  /changelog                # Release notes
```

### CMS Config for Docs Site

```typescript
// docs/cms.config.ts

export default defineConfig({
  collections: [
    defineCollection({
      name: 'docs',
      label: 'Documentation Pages',
      urlPrefix: '/',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'textarea' },
        { name: 'content', type: 'richtext' },
        { name: 'category', type: 'select', options: [
          { label: 'Getting Started', value: 'getting-started' },
          { label: 'Guides', value: 'guides' },
          { label: 'API Reference', value: 'api' },
          { label: 'Configuration', value: 'config' },
          { label: 'CLI', value: 'cli' },
        ]},
        { name: 'order', type: 'number', label: 'Sort Order' },
        { name: 'version', type: 'text', label: 'Since Version' },
      ],
    }),
    defineCollection({
      name: 'changelog',
      label: 'Changelog',
      urlPrefix: '/changelog',
      fields: [
        { name: 'version', type: 'text', required: true },
        { name: 'date', type: 'date', required: true },
        { name: 'content', type: 'richtext' },
        { name: 'breaking', type: 'boolean', label: 'Breaking Changes' },
      ],
    }),
  ],
});
```

### Auto-Generation

```typescript
// scripts/generate-api-docs.ts

// 1. Parse all .ts files in packages/cms/src/api/routes/ → extract route definitions
// 2. Parse packages/cms/src/schema/types.ts → extract TypeScript interfaces
// 3. Parse packages/cms-cli/src/commands/ → extract CLI commands and flags
// 4. Generate Markdown content for each API route, type, and command
// 5. Write as CMS documents in docs/content/
```

### Search

Use the existing CMS search API for full-text search across docs. Add a search bar component to the docs site header.

### Next.js Site

```
docs/
  cms.config.ts
  content/
  app/
    layout.tsx              # Docs layout with sidebar nav
    page.tsx                # Landing
    [category]/
      [slug]/
        page.tsx            # Doc page with table of contents
  components/
    Sidebar.tsx             # Auto-generated from collections
    TableOfContents.tsx     # Auto-generated from headings
    SearchBar.tsx
    CodeBlock.tsx            # Syntax highlighting with shiki
```

## Impact Analysis

### Files affected
- `docs/` — new documentation site project at monorepo root
- `scripts/generate-api-docs.ts` — new auto-generation script
- No changes to existing CMS packages

### Blast radius
- None — entirely new standalone project
- Dogfooding @webhouse/cms — any CMS bugs will surface

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Docs site builds and serves correctly
- [ ] Auto-generated API docs match actual API
- [ ] Search works across all docs
- [ ] Deploy to docs.webhouse.app succeeds

## Implementation Steps

1. Create docs project at `docs/` in monorepo root
2. Define `cms.config.ts` with docs and changelog collections
3. Scaffold Next.js site with App Router
4. Build docs layout with sidebar navigation
5. Build table of contents component (parse Markdown headings)
6. Build code block component with syntax highlighting (`shiki`)
7. Create `scripts/generate-api-docs.ts` for auto-generation from source
8. Write core documentation pages manually (getting started, concepts, guides)
9. Set up versioning (docs tagged per npm version)
10. Deploy to `docs.webhouse.app` on Fly.io (region: arn)
11. Add search bar using CMS content API

## Dependencies

- The @webhouse/cms packages (dogfooding)
- Fly.io deployment

## Effort Estimate

**Large** — 7-10 days (including writing content)
