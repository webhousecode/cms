# F121 — Next.js CMS Helpers

> Drop-in route handlers and metadata utilities for Next.js sites using @webhouse/cms — sitemap, robots.txt, llms.txt, JSON-LD, OG images, geo meta, SEO metadata — all auto-generated from CMS content and _seo fields. Shipped as `@webhouse/cms/next` sub-path export.

## Problem

CMS has excellent SEO/discoverability infrastructure — sitemap.xml, robots.txt, llms.txt, JSON-LD, OG images, geo meta — but it's **only available in the static build pipeline** (`build.ts`). Next.js sites using `@webhouse/cms` get none of this automatically:

1. **No sitemap** — Next.js boilerplates have no `app/sitemap.ts`. Sites are invisible to search engines.
2. **No robots.txt** — No AI bot management (F112 GEO strategies like "maximum"/"balanced"/"restrictive").
3. **No llms.txt** — AI crawlers can't understand site structure.
4. **No metadata helpers** — Developers must manually wire `_seo` fields to Next.js `generateMetadata()`.
5. **No JSON-LD** — 12 structured data templates exist in CMS admin but rendered output is only used in static builds.
6. **No OG images** — CMS generates Sharp-based OG images but Next.js sites can't serve them.
7. **Boilerplates are bare** — `examples/nextjs-boilerplate` and `examples/nextjs-github-boilerplate` have zero SEO infrastructure.

This means **any Next.js site deployed via CMS gets 0/100 on discoverability** despite the CMS having all the data.

## Solution

Export existing build pipeline functions as **Next.js-compatible route handlers and metadata utilities** from `@webhouse/cms/next`. No new logic needed — reuse `generateSitemap()`, `generateRobotsTxt()`, `generateLlmsTxt()`, JSON-LD templates, and `_seo` field extraction. Package as drop-in handlers that Next.js sites import with one line.

## Technical Design

### 1. Sub-path Export: `@webhouse/cms/next`

```typescript
// packages/cms/src/next/index.ts — re-exports all Next.js helpers
export { cmsSitemap } from './sitemap';
export { cmsRobots } from './robots';
export { cmsLlmsTxt, cmsLlmsFullTxt } from './llms';
export { cmsMetadata } from './metadata';
export { cmsJsonLd } from './json-ld';
export { cmsOgImage } from './og-image';
export { cmsGenerateStaticParams } from './static-params';
export { cmsFeed } from './feed';
```

**package.json exports map:**
```json
{
  "exports": {
    ".": "./dist/index.js",
    "./adapters": "./dist/adapters/index.js",
    "./next": "./dist/next/index.js"
  }
}
```

### 2. Sitemap Handler

```typescript
// packages/cms/src/next/sitemap.ts
import type { MetadataRoute } from 'next';
import { createContentLoader } from '../adapters';

export function cmsSitemap(options: {
  baseUrl: string;
  collections?: string[];       // default: all with urlPrefix
  changefreq?: string;          // default: "weekly"
  defaultPriority?: number;     // default: 0.7
}): () => Promise<MetadataRoute.Sitemap> {
  return async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const loader = createContentLoader();
    // Reuse logic from packages/cms/src/build/sitemap.ts
    // Build entries with hreflang alternates for i18n
    // Return Next.js Sitemap format
  };
}
```

**Usage in site:**
```typescript
// app/sitemap.ts
import { cmsSitemap } from '@webhouse/cms/next';
export default cmsSitemap({ baseUrl: 'https://webhouse.app' });
```

### 3. Robots Handler

```typescript
// packages/cms/src/next/robots.ts
import type { MetadataRoute } from 'next';

export function cmsRobots(options?: {
  baseUrl: string;
  strategy?: 'maximum' | 'balanced' | 'restrictive' | 'custom';
  customRules?: string[];
  disallowPaths?: string[];     // default: ["/admin/", "/api/"]
}): () => MetadataRoute.Robots {
  return function robots(): MetadataRoute.Robots {
    // Reuse logic from packages/cms/src/build/robots.ts
  };
}
```

**Usage:**
```typescript
// app/robots.ts
import { cmsRobots } from '@webhouse/cms/next';
export default cmsRobots({ baseUrl: 'https://webhouse.app', strategy: 'maximum' });
```

### 4. llms.txt Route Handler

```typescript
// packages/cms/src/next/llms.ts
import { NextResponse } from 'next/server';

export function cmsLlmsTxt(options: {
  baseUrl: string;
  siteTitle: string;
  siteDescription?: string;
}): () => Promise<NextResponse> {
  return async function GET() {
    // Reuse generateLlmsTxt() from packages/cms/src/build/llms.ts
    return new NextResponse(text, { headers: { 'Content-Type': 'text/plain' } });
  };
}
```

**Usage:**
```typescript
// app/llms.txt/route.ts
import { cmsLlmsTxt } from '@webhouse/cms/next';
export const GET = cmsLlmsTxt({ baseUrl: 'https://webhouse.app', siteTitle: 'WebHouse' });
```

### 5. Metadata Helper

```typescript
// packages/cms/src/next/metadata.ts
import type { Metadata } from 'next';

export function cmsMetadata(options: {
  baseUrl: string;
  siteName: string;
  doc: { data: Record<string, unknown>; slug: string };
  collection?: string;
  urlPrefix?: string;
}): Metadata {
  const seo = doc.data._seo as SeoFields | undefined;
  return {
    title: seo?.metaTitle || String(doc.data.title ?? doc.slug),
    description: seo?.metaDescription || String(doc.data.excerpt ?? ''),
    keywords: seo?.keywords,
    openGraph: {
      title: seo?.metaTitle || String(doc.data.title ?? ''),
      description: seo?.metaDescription || '',
      images: seo?.ogImage ? [{ url: `${baseUrl}${seo.ogImage}` }] : [],
      siteName: options.siteName,
      type: 'article',
      url: `${baseUrl}${urlPrefix}/${doc.slug}`,
    },
    alternates: {
      canonical: seo?.canonical || `${baseUrl}${urlPrefix}/${doc.slug}`,
    },
    robots: seo?.robots || 'index,follow',
    // Geo meta from map fields
    other: buildGeoMeta(doc),
  };
}
```

**Usage:**
```typescript
// app/blog/[slug]/page.tsx
import { cmsMetadata } from '@webhouse/cms/next';

export async function generateMetadata({ params }) {
  const doc = getDocument('posts', params.slug);
  return cmsMetadata({ baseUrl: 'https://webhouse.app', siteName: 'WebHouse', doc, urlPrefix: '/blog' });
}
```

### 6. JSON-LD Component

```typescript
// packages/cms/src/next/json-ld.ts
export function cmsJsonLd(doc: { data: Record<string, unknown> }): string | null {
  const seo = doc.data._seo as SeoFields | undefined;
  if (!seo?.jsonLd) return null;
  return JSON.stringify(seo.jsonLd);
}
```

**Usage:**
```tsx
// In page component
const jsonLd = cmsJsonLd(doc);
{jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}
```

### 7. generateStaticParams Helper

```typescript
// packages/cms/src/next/static-params.ts
export function cmsGenerateStaticParams(options: {
  collection: string;
  paramName?: string;   // default: "slug"
  status?: string;      // default: "published"
}): () => Promise<Array<Record<string, string>>> {
  return async function generateStaticParams() {
    const loader = createContentLoader();
    const docs = await loader.getCollection(options.collection);
    return docs
      .filter(d => d.status === (options.status ?? 'published'))
      .map(d => ({ [options.paramName ?? 'slug']: d.slug }));
  };
}
```

### 8. RSS Feed Handler

```typescript
// packages/cms/src/next/feed.ts
export function cmsFeed(options: {
  baseUrl: string;
  title: string;
  description: string;
  collection: string;
}): () => Promise<NextResponse> {
  // Reuse generateRssFeed() from packages/cms/src/build/rss.ts
}
```

## Impact Analysis

### Files affected

**Created:**
- `packages/cms/src/next/index.ts` — re-exports
- `packages/cms/src/next/sitemap.ts` — sitemap handler factory
- `packages/cms/src/next/robots.ts` — robots handler factory
- `packages/cms/src/next/llms.ts` — llms.txt route handler factory
- `packages/cms/src/next/metadata.ts` — metadata builder
- `packages/cms/src/next/json-ld.ts` — JSON-LD extractor
- `packages/cms/src/next/og-image.ts` — OG image helper
- `packages/cms/src/next/static-params.ts` — generateStaticParams helper
- `packages/cms/src/next/feed.ts` — RSS feed handler

**Modified:**
- `packages/cms/package.json` — add `"./next"` to exports map
- `packages/cms/tsup.config.ts` — add `src/next/index.ts` as entry point
- `examples/nextjs-boilerplate/` — add sitemap.ts, robots.ts, llms.txt, metadata, JSON-LD
- `examples/nextjs-github-boilerplate/` — same as above

### Downstream dependents

`packages/cms/package.json` — all packages depend on this, but only exports map changes. No existing imports break.

`packages/cms/tsup.config.ts` — build config, no downstream dependents.

`examples/nextjs-boilerplate/` — standalone example, no dependents.

### Blast radius

- **Zero risk to existing sites** — all new code is in a new `src/next/` directory with a new export path. No existing exports change.
- **Static build pipeline unchanged** — `src/build/` functions are called by new helpers but not modified.
- **Adapters unchanged** — `src/adapters/` is read-only consumed.
- **CMS admin unchanged** — no admin UI changes.

### Breaking changes

None. New sub-path export, new files only.

### Test plan

- [ ] TypeScript compiles: `cd packages/cms && npx tsc --noEmit`
- [ ] Existing tests pass: `cd packages/cms && npx vitest run`
- [ ] `import { cmsSitemap } from '@webhouse/cms/next'` resolves correctly
- [ ] Sitemap generates valid XML with correct URLs for all published docs
- [ ] Sitemap includes hreflang alternates for multi-locale sites
- [ ] Robots.txt respects strategy setting (maximum/balanced/restrictive)
- [ ] llms.txt includes site description, collections, recent docs
- [ ] cmsMetadata returns valid Next.js Metadata with _seo fields
- [ ] cmsJsonLd extracts JSON-LD from _seo field
- [ ] cmsGenerateStaticParams returns correct slugs for collection
- [ ] nextjs-boilerplate builds with all helpers: `cd examples/nextjs-boilerplate && pnpm build`
- [ ] Regression: static site build still works (build.ts unchanged)
- [ ] Regression: `@webhouse/cms/adapters` still works

## Implementation Steps

### Phase 1: Core Helpers (Day 1)
1. Create `packages/cms/src/next/` directory
2. Implement `sitemap.ts` — wrap `generateSitemap()` in Next.js MetadataRoute format
3. Implement `robots.ts` — wrap `generateRobotsTxt()` in Next.js MetadataRoute format
4. Implement `llms.ts` — wrap `generateLlmsTxt()` + `generateLlmsFullTxt()` as route handlers
5. Implement `metadata.ts` — extract `_seo` fields into Next.js `Metadata` object
6. Implement `json-ld.ts` — extract and format JSON-LD from `_seo`
7. Implement `static-params.ts` — generateStaticParams factory
8. Implement `feed.ts` — RSS feed route handler
9. Create `index.ts` re-export
10. Update `package.json` exports + `tsup.config.ts`

### Phase 2: Boilerplate Updates (Day 2)
11. Update `examples/nextjs-boilerplate/` with all helpers
12. Update `examples/nextjs-github-boilerplate/` with all helpers
13. Add `app/sitemap.ts`, `app/robots.ts`, `app/llms.txt/route.ts`, `app/feed.xml/route.ts`
14. Update all page components to use `cmsMetadata()` in `generateMetadata()`
15. Add JSON-LD rendering in layout or page components

### Phase 3: Fly.io Deploy for Next.js (Day 2-3)
16. Update `deploy-service.ts` — detect Dockerfile, run `fly deploy` directly (skip build.ts)
17. Auto-generate `fly.toml` if missing (app name, region arn, port 3000)
18. Test deploy of webhouse.dk site

### Phase 4: Documentation (Day 3)
19. Update `docs/ai-guide/15-seo.md` with Next.js helper usage
20. Update `docs/ai-guide/08-nextjs-patterns.md` with metadata/sitemap patterns
21. Update `packages/cms/CLAUDE.md` with `@webhouse/cms/next` quick reference

> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- `@webhouse/cms` build pipeline functions (sitemap.ts, robots.ts, llms.ts, render.ts) — already exist
- `@webhouse/cms/adapters` — already exported, used to load content
- Next.js 15+ types (`MetadataRoute`, `Metadata`) — peer dependency
- F97 SEO Module — `_seo` field structure (already implemented)
- F96 Maps — geo meta tags (already implemented)
- F112 GEO — robots.txt strategies (already implemented)

## Effort Estimate

**Medium** — 3 days

- Day 1: Core helpers (sitemap, robots, llms, metadata, json-ld, static-params, feed)
- Day 2: Boilerplate updates + Fly.io deploy for Next.js
- Day 3: Documentation + testing + webhouse.dk deploy
