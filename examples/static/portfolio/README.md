# Elena Vasquez — Visual Portfolio

![Screenshot](screenshot.png)

Full-screen image grid portfolio with about page and contact. Dark theme, minimal UI, maximum visual impact.

**Documentation:** [docs.webhouse.app/docs/templates](https://docs.webhouse.app/docs/templates)

## Quick Start

```bash
# Clone this example
git clone https://github.com/webhousecode/cms.git
cd cms/examples/static/portfolio
npm install

# Start development
npx cms dev

# Build for production
npx tsx build.ts
```

## Collections

Collections: `projects`, `pages`

## Features

- Full-screen image grid (2x4)
- Dark theme with minimal chrome
- Project detail pages
- About + Contact pages
- Responsive grid layout

## Project Structure

```
static/portfolio/
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
