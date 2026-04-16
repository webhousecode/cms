# Preact Boilerplate — AI Builder Instructions

This is a **Preact site** built with webhouse.app CMS. Bun drives the dev process, Vite builds and prerenders, Preact renders, preact-iso routes, Tailwind v4 styles, content comes from JSON files bundled via `import.meta.glob`.

## Quick Reference

```bash
bun install           # Install dependencies
bun run dev           # Start Vite dev server (localhost:5173)
bun run build         # Vite build + prerender all routes to static HTML
bun run preview       # Serve dist/ locally
bun run typecheck     # TypeScript check
```

## Project Structure

```
cms.config.ts         # Collections, blocks, and field definitions
index.html            # Vite entry (has `prerender` attribute on module script)
vite.config.ts        # Preact preset + Tailwind v4 + prerender config
src/
  main.tsx            # hydrate() + prerender() exports
  app.tsx             # preact-iso Router wiring
  styles/
    globals.css       # Tailwind v4 imports + @theme tokens + prose
  pages/
    home.tsx          # Homepage (reads pages/home.json)
    page.tsx          # Dynamic /:slug pages
    blog-list.tsx     # /blog listing
    blog-post.tsx     # /blog/:slug detail
    not-found.tsx     # 404
  components/
    navbar.tsx        # Site nav + theme toggle (hand-drawn SVG icons)
    footer.tsx        # Footer with dangerouslySetInnerHTML for HTML footerText
    block-renderer.tsx# Hero / Features / CTA
    article-body.tsx  # Richtext renderer via marked
  lib/
    content.ts        # import.meta.glob loader — bundles all JSON at build time
content/              # JSON content files
  global/global.json  # Site title, nav links, footer
  pages/*.json        # Pages (blocks + richtext)
  posts/*.json        # Blog posts (richtext + tags)
public/uploads/       # Media files (images, PDFs)
```

## Stack

| Layer | Choice |
|-------|--------|
| Runtime/build | Bun (dev process) + Vite 5.4 (dev server + prod bundler) |
| Framework | Preact 10.23 (React-compatible, 3kb) |
| Routing | preact-iso |
| Styling | Tailwind v4 (CSS-first via `@tailwindcss/vite`) |
| Components | shadcn-style (hand-rolled with utility classes) |
| Icons | Inline SVG (hand-drawn) |

**React compat:** `tsconfig.json` aliases `react` and `react-dom` to `preact/compat`, so you can drop in most React libraries directly. Vite's `@preact/preset-vite` does the runtime alias automatically.

## Content Loading

Content is loaded at build time via Vite's `import.meta.glob({ eager: true })`. All JSON files under `content/` are bundled into the JS output — no runtime filesystem access, no fetch. This works identically in dev, prod, and prerender.

```typescript
// src/lib/content.ts
const pageFiles = import.meta.glob<Document>("~content/pages/*.json", {
  eager: true,
  import: "default",
});
```

When you add a new JSON file in `content/`, restart `bun run dev` to pick it up (or just hot-reload — Vite usually catches glob adds).

## Prerendering

`@preact/preset-vite` includes a prerender plugin. It's enabled with:

1. `prerender` attribute on the entry script tag in `index.html`
2. `main.tsx` exports a `prerender` function
3. `vite.config.ts` has `preact({ prerender: { enabled: true, renderTarget: "#app" } })`

Each route in the preact-iso `<Router>` is discovered by following `<a href>` from the homepage and prerendered to its own `index.html`. The dev server remains a SPA; only `bun run build` produces the static HTML.

Current output: 6 routes prerendered (`/`, `/blog`, `/about`, `/contact`, `/blog/getting-started`, `/blog/using-blocks`).

## Collections

- **global** — site title, description, navigation links, footer text
- **pages** — pages with block sections (hero, features, CTA) + richtext
- **posts** — blog posts with title, excerpt, richtext content, date, author, cover image, tags

## Content Format

Every JSON file in `content/` follows:

```json
{
  "slug": "my-page",
  "status": "published",
  "data": {
    "title": "My Page",
    "content": "Richtext content...",
    "_seo": { "metaTitle": "...", "metaDescription": "..." }
  },
  "id": "unique-id",
  "_fieldMeta": {}
}
```

## Blocks

Pages use blocks for structured sections:

- `hero` — tagline, description, CTA buttons
- `features` — section title + 4-column grid of icon/title/description cards
- `cta` — title, description, single button

Add new block types in `cms.config.ts` and a case in `block-renderer.tsx`.

## Styling

Tailwind v4 CSS-first config (no `tailwind.config.ts`). Design tokens in `src/styles/globals.css` via the `@theme` directive:

```css
@theme {
  --color-primary: #2563eb;
  --color-foreground: #0f172a;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}
```

Dark mode via `.dark` class on `<html>`. A script in `index.html` sets it from `localStorage` before paint to avoid flash. Theme toggle in `navbar.tsx` flips the class.

The `@variant dark (&:where(.dark, .dark *))` rule makes `dark:` variants work with class-based dark mode.

## Key Patterns

- **Preact JSX uses `class` not `className`** — already applied throughout
- **Inline SVG icons** — no icon library. Hand-drawn paths in components
- **React compat via alias** — most React libs work (tested: `marked`)
- **Content bundled at build** — no runtime fetch, no server needed for static deploy
- **Dev = SPA, build = static HTML** — prerender runs only during `bun run build`

## Deployment

Because the output in `dist/` is pure static HTML/CSS/JS, you can deploy anywhere:

- **GitHub Pages** — `bun run build` → push `dist/` to gh-pages branch
- **Netlify** — build command `bun run build`, publish `dist`
- **Vercel** — framework preset "Vite", no config needed
- **Cloudflare Pages** — build command `bun run build`, output `dist`
- **Fly.io** — serve `dist/` with any static server (nginx, sirv, caddy)
- **CMS Admin Deploy tab** — auto-detects Vite output

## Critical Rules

1. **Always set `status: "published"`** — drafts are filtered out by `readGlobal()`, `getPages()`, `getPosts()`
2. **Slug must match filename** — `hello.json` must have `"slug": "hello"`
3. **`_fieldMeta` is required** — can be empty `{}`
4. **Images go in `public/uploads/`** — referenced as `/uploads/filename.jpg`
5. **Add a new page** — create `content/pages/<slug>.json`, restart dev server. It's auto-routed via `<Route path="/:slug" component={PageView} />`
6. **Tailwind v4** — no `tailwind.config.ts`, use `@theme` in CSS for tokens
7. **Preact uses `class` attribute** — not `className`. Same for `stroke-width`, `stroke-linecap`, etc. on SVG
