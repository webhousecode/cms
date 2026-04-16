# Preact Boilerplate

Bun + Vite + Preact + preact-iso + Tailwind v4. Static-prerendered from webhouse.app CMS content. Same design language as the other boilerplates.

## Quick Start

```bash
bun install
bun run dev          # → http://localhost:5173
bun run build        # prerender all routes → dist/
bun run preview      # serve dist/ locally
```

See [CLAUDE.md](./CLAUDE.md) for the full AI-builder guide.

## Stack

| Layer | Choice |
|-------|--------|
| Runtime/build | Bun (dev process) + Vite 5.4 (dev server + prod bundler) |
| Framework | Preact 10.23 (React-compatible, 3 kB) |
| Routing | preact-iso |
| Styling | Tailwind v4 (CSS-first via `@tailwindcss/vite`) |
| Components | shadcn-style — hand-rolled with utility classes |
| Icons | Inline SVG, hand-drawn |

## What's inside

- Homepage with hero + features blocks
- Dynamic `/:slug` pages (about, contact)
- `/blog` listing + `/blog/:slug` detail
- Light/dark theme with no-flash loader
- `marked`-powered richtext rendering
- Content bundled via `import.meta.glob` — zero runtime fetches

## Deploy

The `dist/` folder is pure static HTML — drop it on GitHub Pages, Netlify, Vercel, Cloudflare Pages, Fly.io, or any static host. Or use the CMS admin's Deploy tab.

## Content

Edit JSON in `content/{global,pages,posts}/*.json` or use the webhouse.app CMS admin (`localhost:3010` when running locally).
