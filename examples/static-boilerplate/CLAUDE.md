# Static Site Boilerplate — AI Builder Instructions

This is a **static site** built with webhouse.app CMS. Content is stored as JSON files, and `build.ts` generates static HTML.

## Quick Reference

```bash
npm install           # Install dependencies
npx tsx build.ts      # Build to dist/
```

## Project Structure

```
cms.config.ts         # Collections and field definitions
build.ts              # Static site generator (reads JSON → writes HTML)
content/              # JSON content files
  global/global.json  # Site title, nav links, footer
  pages/*.json        # Pages (blocks + richtext + map)
  posts/*.json        # Blog posts (richtext + tags)
public/uploads/       # Media files (images, PDFs)
dist/                 # Build output — deploy this folder
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
The page with `slug: "home"` is used as the homepage (`dist/index.html`).

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

## Richtext Embeds

In richtext content, you can embed:
- `!!MAP[address|zoom]` — OpenStreetMap embed
- `!!INTERACTIVE[id|title]` — Interactive HTML component
- `!!FILE[filename|label]` — Download link

## SEO

Every document can have `_seo` in its data:
- `metaTitle` — browser tab + Google title (30-60 chars)
- `metaDescription` — Google snippet (120-160 chars)
- `keywords` — target keywords array
- `ogImage` — social sharing image path
- `jsonLd` — custom JSON-LD structured data

## Deployment

Build generates pure static HTML in `dist/`. Deploy to any web server:
- **GitHub Pages** — push dist/ to gh-pages branch
- **Netlify/Vercel** — set build command to `npx tsx build.ts`, publish dir to `dist`
- **Fly.io** — use the CMS admin deploy feature
- **Any web server** — copy dist/ to document root

## Critical Rules

1. **Always set `status: "published"`** — drafts are excluded from build
2. **Slug must match filename** — `hello.json` must have `"slug": "hello"`
3. **`_fieldMeta` is required** — can be empty `{}`
4. **Images go in `public/uploads/`** — referenced as `/uploads/filename.jpg`
5. **No CDN scripts in content** — all CSS is inline in build.ts
