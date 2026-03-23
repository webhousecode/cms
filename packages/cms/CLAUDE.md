<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->
# @webhouse/cms — AI Site Builder Guide

`@webhouse/cms` is a file-based, AI-native CMS engine for TypeScript projects. You define collections and fields in a `cms.config.ts` file, and the CMS stores content as flat JSON files in a `content/` directory (one file per document, organized by collection).

## Modular Documentation

This guide is split into **20 focused modules**. Fetch only what you need for the current task.

**Base URL:** `https://raw.githubusercontent.com/webhousecode/cms/main/docs/ai-guide/`

| # | Module | When to fetch |
|---|--------|--------------|
| 01 | **Getting Started** | New project, first setup, scaffolding |
| 02 | **Config Reference** | defineConfig, defineCollection, collection options |
| 03 | **Field Types** | Adding or configuring field types (text, richtext, image, blocks, etc.) |
| 04 | **Blocks** | Block-based content (hero, features, CTA sections) |
| 05 | **Richtext** | Embedded images/media in richtext, rendering guidance |
| 06 | **Storage Adapters** | Filesystem, GitHub, or SQLite storage config |
| 07 | **Content Structure** | Document JSON format, content directory layout |
| 08 | **Next.js Patterns** | Pages, layouts, generateStaticParams, loader functions |
| 09 | **CLI Reference** | CMS CLI commands, AI commands |
| 10 | **Config Example** | Full real-world cms.config.ts as reference |
| 11 | **API Reference** | Programmatic ContentService usage |
| 12 | **Admin UI** | CMS admin setup, Docker, npx, architecture notes |
| 13 | **Site Building** | Common mistakes, content file rules, patterns, richtext rendering |
| 14 | **Relationships** | Content relations, resolving, blog+author pattern |
| 15 | **SEO** | Metadata, JSON-LD, AI SEO, sitemap, robots.txt |
| 16 | **Images** | Image handling, next/image, responsive patterns |
| 17 | **i18n** | Multi-language, locale routing, translation |
| 18 | **Deployment** | Vercel, Docker, Fly.io deployment checklist |
| 19 | **Troubleshooting** | Common errors, debugging, FAQ |
| 20 | **Interactives** | Data-driven interactive content, embedding |

**Example:** To fetch the field types reference:
```
fetch https://raw.githubusercontent.com/webhousecode/cms/main/docs/ai-guide/03-field-types.md
```

### Quick decisions

- **"Add a blog"** → fetch 02, 03, 08, 13
- **"Add a collection"** → fetch 02, 03, 07
- **"Set up SEO"** → fetch 15
- **"Deploy"** → fetch 18
- **"Add i18n"** → fetch 17, 02
- **"Fix an error"** → fetch 19
- **"Block-based pages"** → fetch 04, 03, 08
- **"Content relationships"** → fetch 14, 02
- **"Interactives"** → fetch 20, 05

---

## Essential Quick Reference

### Quick Start

```bash
npm create @webhouse/cms my-site
cd my-site && npm install
npx cms dev       # Start dev server + admin UI
npx cms build     # Build static site
```

### Document JSON format

Every document in `content/{collection}/{slug}.json`:
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

### Field types

`text` `textarea` `richtext` `number` `boolean` `date` `image` `image-gallery` `video` `audio` `htmldoc` `file` `interactive` `column-slots` `select` `tags` `relation` `array` `object` `blocks`

### Defining a collection

```typescript
import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      urlPrefix: '/blog',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'excerpt', type: 'textarea' },
        { name: 'content', type: 'richtext' },
        { name: 'date', type: 'date' },
        { name: 'heroImage', type: 'image' },
        { name: 'tags', type: 'tags' },
      ],
    }),
  ],
});
```

### Critical rules

1. **`image-gallery` values must be `{ url, alt }[]`** — never plain string arrays
2. **Always filter by `status === "published"`** — skip drafts
3. **Use `BASE_PATH` env var** for all internal links in static builds
4. **Use `BUILD_OUT_DIR` env var** for output directory in static builds
5. **`_fieldMeta` is required** in document JSON (can be empty `{}`)
6. **Slug must match filename** — `hello-world.json` must have `"slug": "hello-world"`

### Reading content in Next.js

```typescript
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const CONTENT = join(process.cwd(), 'content');

function getCollection(name: string) {
  const dir = join(CONTENT, name);
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')))
    .filter(d => d.status === 'published');
}

function getDocument(collection: string, slug: string) {
  return JSON.parse(readFileSync(join(CONTENT, collection, `${slug}.json`), 'utf-8'));
}
```
