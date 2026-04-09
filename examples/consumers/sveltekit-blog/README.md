# sveltekit-blog — @webhouse/cms consumer example

SvelteKit + Svelte 5 reading @webhouse/cms JSON content via server `load` functions.

**Stack:** SvelteKit 2 · Svelte 5 (runes) · TypeScript · Node adapter

## Quick start

```bash
cd examples/consumers/sveltekit-blog
npm install
npm run dev
```

Open http://localhost:5173 (EN) or http://localhost:5173/da/ (DA).

## How it works

```
content/                       ← @webhouse/cms JSON files
src/lib/webhouse.ts            ← reader (~110 LOC)
src/routes/
  +layout.server.ts            ← loads globals once for every page
  +layout.svelte               ← shared layout with nav + footer
  +page.server.ts              ← loads English posts
  +page.svelte                 ← /
  da/+page.svelte              ← /da/
  blog/[slug]/+page.svelte     ← /blog/{slug}
```

The `cms` singleton runs in SvelteKit's server context. Each `+page.server.ts` calls `cms.collection()` or `cms.document()` and the typed result reaches the `.svelte` component as `data` prop.

## Production

```bash
npm run build
node build/index.js
```

## Related

- **F125** — Framework-Agnostic Content Platform
