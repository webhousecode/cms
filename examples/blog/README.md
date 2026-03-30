# Simple Blog — Thinking in Pixels

![Screenshot](screenshot.png)

Minimal blog using the CMS CLI directly. Two collections (posts + pages), clean design with tags and cover images.

**Live demo:** [https://thinking-in-pixels.fly.dev/](https://thinking-in-pixels.fly.dev/)

**Documentation:** [docs.webhouse.app/docs/templates](https://docs.webhouse.app/docs/templates)

## Quick Start

```bash
# Clone this example
git clone https://github.com/webhousecode/cms.git
cd cms/examples/blog
npm install

# Start development
npx cms dev

# Build for production
npm run build
```

## Collections

2 collections: `posts` (blog), `pages` (static pages)

## Features

- CMS CLI build (`npx cms build`)
- Posts with title, excerpt, richtext, date, author, tags
- Cover images
- Tag-based navigation
- Clean, minimal design

## Project Structure

```
blog/
  cms.config.ts       → Collection + field definitions
  content/            → JSON content files
  build.ts          → Static site generator
  dist/              → Built output
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
