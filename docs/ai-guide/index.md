<!-- @webhouse/cms ai-guide v0.4.0 — last updated 2026-04-08 — F127 collection metadata -->
# @webhouse/cms — AI Site Builder Guide

> This is the index. Fetch individual modules as needed — don't load everything at once.

## How to use this guide

You are building a website with @webhouse/cms. This guide is split into focused modules.
**Read the index below, then fetch ONLY the modules relevant to the current task.**

Use your web fetch tool to load modules from:
`https://raw.githubusercontent.com/webhousecode/cms/main/docs/ai-guide/{filename}`

## Module Index

| # | Module | When to fetch |
|---|--------|--------------|
| 01 | **[Getting Started](01-getting-started.md)** | New project, first setup, scaffolding |
| 02 | **[Config Reference](02-config-reference.md)** | defineConfig, defineCollection, collection options |
| 03 | **[Field Types](03-field-types.md)** | Adding or configuring field types (text, richtext, image, blocks, etc.) |
| 04 | **[Blocks](04-blocks.md)** | Block-based content (hero, features, CTA sections) |
| 05 | **[Richtext](05-richtext.md)** | Embedded images/media in richtext, rendering guidance |
| 06 | **[Storage Adapters](06-storage-adapters.md)** | Filesystem, GitHub, or SQLite storage config |
| 07 | **[Content Structure](07-content-structure.md)** | Document JSON format, content directory layout |
| 08 | **[Next.js Patterns](08-nextjs-patterns.md)** | Pages, layouts, generateStaticParams, loader functions |
| 09 | **[CLI Reference](09-cli-reference.md)** | CMS CLI commands, AI commands |
| 10 | **[Config Example](10-config-example.md)** | Full real-world cms.config.ts as reference |
| 11 | **[API Reference](11-api-reference.md)** | Programmatic ContentService usage |
| 12 | **[Admin UI](12-admin-ui.md)** | CMS admin setup, Docker, npx, architecture notes |
| 13 | **[Site Building](13-site-building.md)** | Common mistakes, content file rules, patterns, richtext rendering |
| 14 | **[Relationships](14-relationships.md)** | Content relations, resolving, blog+author pattern |
| 15 | **[SEO](15-seo.md)** | Metadata, JSON-LD, AI SEO, sitemap, robots.txt |
| 16 | **[Images](16-images.md)** | Image handling, next/image, responsive patterns |
| 17 | **[i18n](17-i18n.md)** | Multi-language, locale routing, translation |
| 18 | **[Deployment](18-deployment.md)** | Vercel, Docker, Fly.io deployment checklist |
| 19 | **[Troubleshooting](19-troubleshooting.md)** | Common errors, debugging, FAQ |
| 20 | **[Interactives](20-interactives.md)** | Data-driven interactive content, embedding |

## Quick decisions

Common tasks → which modules to fetch:

- **"Add a blog"** → 02, 03, 08, 13
- **"Add a collection"** → 02, 03, 07
- **"Set up SEO"** → 15
- **"Deploy to Vercel"** → 18
- **"Add i18n"** → 17, 02
- **"Create a product catalog"** → 02, 03, 04, 08
- **"Fix an error"** → 19
- **"Embed interactives"** → 20, 05
- **"Add image gallery"** → 03, 16
- **"Set up block-based pages"** → 04, 03, 08
- **"Content relationships"** → 14, 02
- **"Full config reference"** → 02, 03, 10

## Essential Quick Reference

### Document JSON format
```json
{
  "slug": "my-post",
  "status": "published",
  "data": {
    "title": "My Post",
    "content": "..."
  },
  "id": "unique-id",
  "_fieldMeta": {}
}
```

### Field types (summary)
`text` `textarea` `richtext` `number` `boolean` `date` `image` `image-gallery` `video` `audio` `htmldoc` `file` `interactive` `column-slots` `map` `select` `tags` `relation` `array` `object` `blocks`

### Content architecture tip
**Use `blocks` fields for content-rich pages** (blog posts, articles, landing pages) instead of flat text/textarea fields. Blocks let editors compose content from reusable sections (text, images, quotes, code, videos). Fetch `04-blocks.md` for examples.

### Collection metadata — REQUIRED for AI-friendly sites (F127)
**Every collection you define MUST have `kind` and `description`** so chat, MCP, and scaffolding AI tools know what it's for.

```typescript
defineCollection({
  name: 'team',
  kind: 'data',     // "page" | "snippet" | "data" | "form" | "global"
  description: 'Team members. Rendered on /about and as bylines on posts.',
  fields: [/* ... */],
});
```

Kinds:
- `page` — has URL, SEO, preview (default for blog posts / landing pages)
- `snippet` — reusable fragment embedded via `{{snippet:slug}}`
- `data` — records rendered on OTHER pages (team, FAQ, testimonials)
- `form` — read-only form submissions
- `global` — single-record site-wide config

Fetch `02-config-reference.md` for full examples.

### Static site build rules
1. Read content from `content/{collection}/{slug}.json`
2. Use `BASE_PATH` env var for all internal links: `` const BASE = (process.env.BASE_PATH ?? '').replace(/\/+$/, ''); ``
3. Use `BUILD_OUT_DIR` env var for output: `` const DIST = join(__dirname, process.env.BUILD_OUT_DIR ?? 'dist'); ``
4. Filter by `status === "published"` — skip drafts
5. `image-gallery` values are `{ url, alt }[]` — never plain string arrays
