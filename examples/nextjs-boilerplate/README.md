# Next.js Boilerplate

![Screenshot](screenshot.png)

Production-ready Next.js site with App Router, Tailwind CSS v4, dark mode, blog, block-based pages, and SEO metadata. The recommended starting point for most projects.

**Live demo:** [https://nextjs-boilerplate-1x3txthik-webhhouse.vercel.app/](https://nextjs-boilerplate-1x3txthik-webhhouse.vercel.app/)

**Documentation:** [docs.webhouse.app/docs/templates](https://docs.webhouse.app/docs/templates)

## Quick Start

```bash
# Clone this example
git clone https://github.com/webhousecode/cms.git
cd cms/examples/nextjs-boilerplate
npm install

# Start development
npm run dev

# Build for production
npm run build
```

## Collections

3 collections: `global` (site settings), `pages` (block-based), `posts` (blog)

## Features

- Next.js 16+ with App Router and Server Components
- Tailwind CSS v4 with `@theme` CSS variables
- Dark/light mode toggle with localStorage persistence
- `react-markdown` with `remark-gfm` for richtext rendering
- `generateStaticParams` + `generateMetadata` for SEO
- 3 block types: hero, features, CTA
- Blog listing + detail pages
- Map field with Leaflet/OpenStreetMap
- Responsive navbar + footer from global settings
- CLAUDE.md with AI builder instructions

## Project Structure

```
nextjs-boilerplate/
  cms.config.ts       → Collection + field definitions
  content/            → JSON content files
  src/               → Next.js app source
  .next/             → Build output
  public/             → Static assets + uploads
```

## Managing Content

### Option 1: CMS Admin UI

```bash
npx @webhouse/cms-admin-cli
# Opens visual editor at http://localhost:3010
```

### Option 2: Edit JSON directly

Content is stored as JSON files in `content/`. Each file is one document:

```json
{
  "slug": "my-page",
  "status": "published",
  "data": {
    "title": "My Page",
    "content": "Markdown content here..."
  },
  "id": "unique-id",
  "_fieldMeta": {}
}
```

### Option 3: AI via Chat

Open CMS admin → click **Chat** → describe what you want in natural language.

## Deployment

```bash
# Vercel
npx vercel

# GitHub Pages
# Push dist/ to gh-pages branch

# Fly.io
fly deploy
```

See [Deployment docs](https://docs.webhouse.app/docs/deployment) for detailed guides.

## Learn More

- [Templates & Boilerplates](https://docs.webhouse.app/docs/templates) — all available templates
- [Configuration Reference](https://docs.webhouse.app/docs/config-reference) — cms.config.ts options
- [Field Types](https://docs.webhouse.app/docs/field-types) — all 22 field types
- [webhouse.app](https://webhouse.app) — the AI-native CMS

---

Built with [@webhouse/cms](https://github.com/webhousecode/cms)
