# Next.js Boilerplate — AI Builder Instructions

This is a **Next.js site** built with webhouse.app CMS. Content is stored as JSON files, and Next.js reads them at build time via `fs`.

## Quick Reference

```bash
npm install           # Install dependencies
npm run dev           # Start dev server (localhost:3000)
npm run build         # Production build
npm start             # Start production server
```

## Project Structure

```
cms.config.ts         # Collections, blocks, and field definitions
src/
  app/
    layout.tsx        # Root layout (navbar, footer, theme)
    page.tsx          # Homepage (reads pages/home.json)
    blog/
      page.tsx        # Blog listing
      [slug]/page.tsx # Blog post detail
    [slug]/page.tsx   # Dynamic pages (about, contact, etc.)
    sitemap.ts        # Auto-generated sitemap.xml
    robots.ts         # robots.txt
    globals.css       # Tailwind v4 imports + theme + prose
  components/
    article-body.tsx  # Richtext renderer (react-markdown)
    block-renderer.tsx# Hero, Features, CTA blocks
    navbar.tsx        # Responsive navigation + theme toggle
    footer.tsx        # Site footer
    map-embed.tsx     # OpenStreetMap via Leaflet
  lib/
    content.ts        # getCollection(), getDocument(), readGlobal()
content/              # JSON content files
  global/global.json  # Site title, nav links, footer
  pages/*.json        # Pages (blocks + richtext + map)
  posts/*.json        # Blog posts (richtext + tags)
public/uploads/       # Media files (images, PDFs)
```

## Collections

- **global** — site title, description, navigation links, footer text
- **pages** — pages with block sections (hero, features, CTA) + richtext + map field
- **posts** — blog posts with title, excerpt, richtext content, date, author, cover image, tags

## Content Format

Every JSON file in `content/` follows this format:
```json
{
  "slug": "my-page",
  "status": "published",
  "data": {
    "title": "My Page",
    "content": "Richtext content here...",
    "_seo": {
      "metaTitle": "SEO title (30-60 chars)",
      "metaDescription": "Meta description (120-160 chars)",
      "keywords": ["keyword1", "keyword2"],
      "ogImage": "/uploads/image.jpg"
    }
  },
  "id": "unique-id",
  "_fieldMeta": {}
}
```

## Adding Content

### New blog post
Create `content/posts/my-post.json` with slug, status, data (title, excerpt, content, date, author, tags).

### New page
Create `content/pages/my-page.json` with slug, status, data (title, sections/blocks, content, location).

### Homepage
The page with `slug: "home"` is used as the homepage (rendered by `src/app/page.tsx`).

## Blocks

Pages use blocks for structured sections. Available blocks:
- `hero` — tagline, description, CTA buttons
- `features` — section title + grid of icon/title/description cards
- `cta` — title, description, button

## Map Field

Pages have an optional `location` field (type: `map`):
```json
"location": { "lat": 57.048, "lng": 9.919, "address": "Aalborg, Denmark", "zoom": 13 }
```

## SEO

Every document can have `_seo` in its data:
- `metaTitle` — browser tab + Google title (30-60 chars)
- `metaDescription` — Google snippet (120-160 chars)
- `keywords` — target keywords array
- `ogImage` — social sharing image path
- `jsonLd` — custom JSON-LD structured data

Blog posts automatically generate BlogPosting JSON-LD. Pages generate WebPage JSON-LD.

## Styling

- Tailwind CSS v4 with CSS-only config (no tailwind.config.ts)
- Theme variables defined in `src/app/globals.css` using `@theme` directive
- Dark mode via `.dark` class on `<html>` (toggle in navbar)
- Prose styles for richtext content in globals.css

## Key Patterns

- **Server Components by default** — only `"use client"` where needed (navbar, markdown, map)
- **No `dangerouslySetInnerHTML`** — richtext uses react-markdown
- **Content via `fs`** — all reads happen server-side at build/request time
- **generateStaticParams** — blog posts and pages are statically generated
- **generateMetadata** — SEO metadata from content `_seo` fields

## Deployment

Standard Next.js deployment:
- **Vercel** — `npx vercel` (zero config)
- **Netlify** — `npm run build`, publish `.next`
- **Docker** — use `output: "standalone"` in next.config.ts
- **Fly.io** — Dockerfile + fly.toml

## Critical Rules

1. **Always set `status: "published"`** — drafts are excluded from rendering
2. **Slug must match filename** — `hello.json` must have `"slug": "hello"`
3. **`_fieldMeta` is required** — can be empty `{}`
4. **Images go in `public/uploads/`** — referenced as `/uploads/filename.jpg`
5. **Tailwind v4** — no tailwind.config.ts, use `@theme` in CSS for tokens
