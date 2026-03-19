# F17 — AI-Friendly Content Index

> Machine-readable content index for external AI agents via llms.txt, RSS, and structured data.

## Problem

External AI agents (ChatGPT, Perplexity, research bots) struggle to discover and understand site content. There is no standardized machine-readable index. RSS feeds are not generated. Structured data (JSON-LD) is not automated.

## Solution

Auto-generate `llms.txt` (the emerging standard for AI content discovery), a full-content RSS feed, JSON-LD structured data for every page, and an enhanced sitemap with `lastmod` timestamps.

## Technical Design

### llms.txt Generator

```typescript
// packages/cms/src/build/llms-txt.ts

export function generateLlmsTxt(
  config: CmsConfig,
  documents: Map<string, Document[]>,
  baseUrl: string
): string {
  // Returns content following the llms.txt spec:
  // # Site Title
  // > Site description
  //
  // ## Posts
  // - [Title](url): description
  //
  // ## Pages
  // - [Title](url): description
}

export function generateLlmsFullTxt(
  config: CmsConfig,
  documents: Map<string, Document[]>,
  baseUrl: string
): string {
  // Returns llms-full.txt with complete content inline
}
```

### RSS Feed Generator

```typescript
// packages/cms/src/build/rss.ts

export function generateRssFeed(
  config: CmsConfig,
  documents: Document[],
  options: {
    baseUrl: string;
    title: string;
    description: string;
    collection?: string;      // filter to single collection
    fullContent?: boolean;    // include full content in <content:encoded>
  }
): string {
  // Returns valid RSS 2.0 XML with content:encoded namespace
}

export function generateAtomFeed(/* same args */): string;
export function generateJsonFeed(/* same args */): string;  // JSON Feed 1.1
```

### JSON-LD Generator

```typescript
// packages/cms/src/build/structured-data.ts

export function generateJsonLd(
  doc: Document,
  collection: CollectionConfig,
  baseUrl: string
): Record<string, unknown> {
  // Maps collection/document to appropriate schema.org type:
  // posts -> Article/BlogPosting
  // pages -> WebPage
  // team -> Person
  // work -> CreativeWork
  // Default -> WebPage
}
```

### Sitemap Generator

```typescript
// packages/cms/src/build/sitemap.ts — enhance existing

export function generateSitemap(
  config: CmsConfig,
  documents: Map<string, Document[]>,
  baseUrl: string
): string {
  // XML sitemap with <lastmod> from document.updatedAt
  // <changefreq> based on collection type
  // <priority> based on status and collection
}
```

### Build Integration

All files generated during `cms build`:
- `/llms.txt` — AI content discovery
- `/llms-full.txt` — Full content version
- `/feed.xml` — RSS feed
- `/feed.json` — JSON Feed
- `/sitemap.xml` — Sitemap
- Each page gets `<script type="application/ld+json">` injected

## Impact Analysis

### Files affected
- `packages/cms/src/build/llms-txt.ts` — new llms.txt generator
- `packages/cms/src/build/rss.ts` — new RSS/Atom/JSON Feed generator
- `packages/cms/src/build/structured-data.ts` — new JSON-LD generator
- `packages/cms/src/build/sitemap.ts` — enhance existing sitemap
- `packages/cms/src/build/pipeline.ts` — hook new generators into build

### Blast radius
- Build pipeline gains new output files — must not slow down builds for existing sites
- Sitemap changes could affect SEO if `lastmod` timestamps are wrong

### Breaking changes
- None — new output files are additive

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] `llms.txt` follows the llms.txt spec format
- [ ] RSS feed validates as RSS 2.0
- [ ] JSON-LD uses correct schema.org types per collection
- [ ] Sitemap includes `lastmod` from document `updatedAt`

## Implementation Steps

1. Create `packages/cms/src/build/llms-txt.ts` with `generateLlmsTxt()` and `generateLlmsFullTxt()`
2. Create `packages/cms/src/build/rss.ts` with RSS 2.0 and JSON Feed generators
3. Create `packages/cms/src/build/structured-data.ts` with JSON-LD mapping
4. Enhance `packages/cms/src/build/sitemap.ts` with `lastmod` and `changefreq`
5. Hook all generators into the build pipeline (`cms build`)
6. Add `<link rel="alternate" type="application/rss+xml">` to HTML head template
7. Add `<script type="application/ld+json">` injection to page template
8. Add config options for customizing feed title, description, collections to include
9. Add preview in admin settings showing generated llms.txt and RSS content

## Dependencies

- Existing build system in `packages/cms/src/build/`

## Effort Estimate

**Medium** — 2-3 days
