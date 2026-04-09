# astro-blog — @webhouse/cms consumer example

Astro 5 reading @webhouse/cms JSON content. Astro's content-first philosophy aligns precisely with @webhouse/cms — both believe content should be portable, readable, and version-controlled.

**Stack:** Astro 5 · TypeScript · Node fs APIs · zero runtime dependencies beyond Astro

## Quick start

```bash
cd examples/consumers/astro-blog
npm install
npm run dev
```

Open http://localhost:4321 (EN) or http://localhost:4321/da/ (DA).

## How it works

```
content/                       ← @webhouse/cms JSON files
src/lib/webhouse.ts            ← reader (~110 LOC)
src/lib/markdown.ts            ← tiny markdown renderer
src/layouts/Layout.astro       ← shared layout (reads globals)
src/pages/
  index.astro                  ← /
  da/index.astro               ← /da/
  blog/[slug].astro            ← /blog/{slug}
```

```typescript
import { cms, getString } from '../lib/webhouse';

const posts = cms.collection('posts', 'en');
const post  = cms.document('posts', 'hello-world');
const trans = cms.findTranslation(post, 'posts');
```

## Production

```bash
npm run build         # builds to ./dist
npm run preview       # serves the build
```

For static-only output, change `output: 'server'` to `output: 'static'` in `astro.config.mjs`.

## Related

- **F125** — Framework-Agnostic Content Platform
