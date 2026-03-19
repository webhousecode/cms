# F36 — Framework Integrations

> First-class integration packages for Next.js, Astro, Remix, Nuxt, SvelteKit, and Vite/Vike — making @webhouse/cms a drop-in content layer for any modern web framework.

## Problem

The CMS currently exports a generic `@webhouse/cms/adapters` module with filesystem-based content loaders (`getCollection`, `getDocument`). These work in any framework, but developers miss framework-specific features: automatic route generation, preview mode, ISR/on-demand revalidation, typed content hooks, and dev server integration. Each framework has its own patterns, and developers expect CMS integrations to follow those patterns — not raw file reads.

## Solution

Create lightweight integration packages (or documented patterns) for the top 6 web frameworks. Each integration wraps the core `@webhouse/cms/adapters` module and adds framework-specific features. Start with enhanced Next.js support (our primary target) and Astro (natural fit for content sites), then add community-contributed patterns for the rest.

## Framework Landscape

| Framework | Build tool | Rendering | Best for | CMS fit |
|-----------|-----------|-----------|----------|---------|
| **Next.js** | Turbopack | SSR, SSG, ISR | Full-stack apps, complex sites | Primary target — already supported |
| **Astro** | Vite | Static-first, islands | Blogs, docs, marketing | Perfect fit — content-first philosophy |
| **Remix** | Vite | SSR, streaming | Dynamic apps, e-commerce | Good fit — loader pattern maps well |
| **Nuxt** | Vite | SSR, SSG | Vue ecosystem | Good fit — content module pattern |
| **SvelteKit** | Vite | SSR, SSG | Modern apps, transitions | Good fit — load function pattern |
| **Vite/Vike** | Vite | SSR, SSG, SPA | Minimal framework overhead | Good fit — plugin-based |

## Technical Design

### Shared Core (already exists)

```typescript
// @webhouse/cms/adapters — works in ALL frameworks
import { getCollection, getDocument, getSingleton, createContentLoader } from '@webhouse/cms/adapters';
```

### Next.js Integration (enhance existing)

```typescript
// @webhouse/cms/adapters/next (or @webhouse/cms-next)

// Dynamic route helpers
export function generateStaticParams(collection: string): Array<{ slug: string }>;

// Metadata helper — auto-generates Next.js Metadata from document fields
export function generateMetadata(collection: string, slug: string): Promise<Metadata>;

// ISR revalidation — webhook handler for on-demand revalidation
export function revalidateHandler(request: Request): Promise<Response>;

// Preview mode — draft content via cookies
export function enablePreview(slug: string, collection: string): void;
export function disablePreview(): void;
export function getPreviewData(): { collection: string; slug: string } | null;

// Content component — renders richtext with auto-linked terms
export function CmsContent({ html, autolinks }: { html: string; autolinks?: AutolinkConfig[] }): JSX.Element;

// Image component — optimized CMS images via next/image
export function CmsImage({ src, alt, ...props }: CmsImageProps): JSX.Element;
```

Usage in Next.js App Router:

```typescript
// app/blog/[slug]/page.tsx
import { getDocument, getCollection } from '@webhouse/cms/adapters';
import { generateMetadata as cmsMetadata } from '@webhouse/cms/adapters/next';

export function generateStaticParams() {
  return getCollection('posts').map(doc => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: Props) {
  return cmsMetadata('posts', params.slug);
}

export default function Post({ params }: Props) {
  const post = getDocument('posts', params.slug);
  if (!post) notFound();
  return <article>{post.data.title}</article>;
}
```

### Astro Integration

```typescript
// @webhouse/cms-astro (Astro integration package)

// astro.config.mjs integration
export default function cmsIntegration(options?: {
  contentDir?: string;
  collections?: string[];  // auto-generate routes for these
}): AstroIntegration;

// Content collections adapter — maps CMS collections to Astro content collections
export function defineAstroCollections(config: CmsConfig): Record<string, AstroCollection>;

// Astro component helpers
export function getEntry(collection: string, slug: string): ContentEntry;
export function getEntries(collection: string): ContentEntry[];
```

Usage in Astro:

```astro
---
// src/pages/blog/[slug].astro
import { getCollection, getDocument } from '@webhouse/cms/adapters';

export function getStaticPaths() {
  return getCollection('posts').map(post => ({
    params: { slug: post.slug },
    props: { post },
  }));
}

const { post } = Astro.props;
---

<article>
  <h1>{post.data.title}</h1>
  <div set:html={post.data.content} />
</article>
```

### Remix Integration

```typescript
// @webhouse/cms-remix or documented pattern

// Loader helper — returns typed CMS data for a route
export function cmsLoader<T>(collection: string, slug: string): TypedResponse<T>;

// Collection loader — list with pagination
export function cmsCollectionLoader(collection: string, options?: QueryOptions): TypedResponse;
```

Usage in Remix:

```typescript
// app/routes/blog.$slug.tsx
import { getDocument } from '@webhouse/cms/adapters';
import type { LoaderFunctionArgs } from '@remix-run/node';

export function loader({ params }: LoaderFunctionArgs) {
  const post = getDocument('posts', params.slug!);
  if (!post) throw new Response('Not Found', { status: 404 });
  return post;
}
```

### Nuxt Integration

```typescript
// @webhouse/cms-nuxt (Nuxt module)

// nuxt.config.ts module
export default defineNuxtConfig({
  modules: ['@webhouse/cms-nuxt'],
  cms: {
    contentDir: 'content',
  },
});

// Auto-imported composables
export function useCmsCollection(collection: string): Ref<Document[]>;
export function useCmsDocument(collection: string, slug: string): Ref<Document | null>;
```

### SvelteKit Integration

```typescript
// Documented pattern — SvelteKit load functions

// src/routes/blog/[slug]/+page.server.ts
import { getDocument } from '@webhouse/cms/adapters';

export function load({ params }) {
  const post = getDocument('posts', params.slug);
  if (!post) throw error(404);
  return { post };
}
```

### Vite/Vike Integration

```typescript
// vite-plugin-cms — Vite plugin that watches content/ and triggers HMR

export default function cmsPlugin(options?: {
  contentDir?: string;
  watch?: boolean;       // HMR on content changes (dev only)
}): VitePlugin;
```

## Impact Analysis

### Files affected
- `packages/cms/src/adapters/next.ts` — enhance Next.js helpers (generateStaticParams, generateMetadata)
- `packages/cms-astro/` — new Astro integration package
- `packages/cms-nuxt/` — new Nuxt module
- `packages/cms/CLAUDE.md` — add framework-specific examples

### Blast radius
- Adapter API is consumed by all site projects — changes must be backwards-compatible
- CLAUDE.md changes affect all AI builder sessions

### Breaking changes
- None — new helpers are additive

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] `generateStaticParams` returns correct slugs
- [ ] `generateMetadata` produces valid Next.js Metadata
- [ ] Astro integration maps CMS collections correctly
- [ ] Revalidation handler accepts webhook payloads

## Implementation Steps

1. **Enhance `@webhouse/cms/adapters/next`** — add `generateStaticParams`, `generateMetadata`, `CmsContent`, `CmsImage` helpers
2. **Add revalidation webhook handler** — `POST /api/revalidate` that calls `revalidatePath()` on content changes
3. **Add preview mode helpers** — draft content preview via cookies
4. **Create `@webhouse/cms-astro`** — Astro integration with content collection mapping
5. **Document Remix pattern** — no package needed, just a guide with loader examples
6. **Document SvelteKit pattern** — load function examples
7. **Create `@webhouse/cms-nuxt`** — Nuxt module with auto-imported composables
8. **Create Vite plugin** — HMR on content changes during dev
9. **Update CLAUDE.md** — add framework-specific examples for each integration
10. **Create example projects** — one per framework in `examples/`

## Dependencies

- **#24 Framework adapters** — core `getCollection`/`getDocument` (Done)
- **F35 Webhooks** — for ISR revalidation triggers

## Effort Estimate

**Large** — 8-10 days (2 days per framework for top 3, 1 day each for documented patterns)

## Priority Order

1. **Next.js** — enhance existing (most users)
2. **Astro** — natural content-site fit
3. **Remix** — documented pattern
4. **Nuxt** — module if Vue demand exists
5. **SvelteKit** — documented pattern
6. **Vite/Vike** — plugin for HMR
