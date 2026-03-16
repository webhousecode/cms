# F42 — Framework Boilerplates

> Production-ready starter templates (starting with Next.js) in `examples/` that AI site builders clone instead of starting from scratch.

## Problem

The current `npm create @webhouse/cms` scaffolder generates a minimal project: `cms.config.ts`, `CLAUDE.md`, `package.json`, and an empty `content/` directory. There is no working frontend. AI site builders (Claude Code sessions) must reinvent the same patterns every time: `react-markdown` with custom renderers, blocks rendering, theme toggle, revalidation endpoint, content loader, layout, etc.

This leads to inconsistent output. Some sessions forget `remark-gfm`, some use `dangerouslySetInnerHTML` instead of `react-markdown`, some miss the TipTap `title` field parsing for image float/width, and none include light/dark mode or a revalidation endpoint out of the box.

## Relationship to Other Features

| Feature | Scope | How F42 differs |
|---------|-------|-----------------|
| **F32 Template Registry** | Online marketplace of polished, themed templates (portfolio, blog, docs, landing, business) with screenshots and community submissions | F42 is a **single reference boilerplate** per framework — unopinionated, minimal styling, focused on correct CMS patterns. F32 templates are built ON TOP of F42 boilerplates. |
| **F36 Framework Integrations** | Framework-specific adapter packages (`@webhouse/cms-astro`, Nuxt module, Vite plugin, enhanced Next.js helpers) | F36 provides the library/package layer. F42 provides a working example project that uses those libraries. F42 can ship before F36 by using the existing `@webhouse/cms/adapters`. |
| **F41 GitHub Site Auto-Sync** | Dev auto-pull, production webhook revalidation, scaffolded `/api/revalidate` endpoint | F42 includes the revalidation endpoint from F41's spec. When F41 ships, the boilerplate already has the correct receiving side. |
| **F24 AI Playbook** | CLAUDE.md instructions for AI builders | F42's boilerplate includes a CLAUDE.md that references itself as the starting point, reducing the need for AI to read long instruction docs. |

## Solution

A complete, working Next.js project at `examples/nextjs-boilerplate/` that demonstrates every standard CMS pattern. The scaffolder (`npm create @webhouse/cms`) gains a `--boilerplate nextjs` flag (or interactive prompt: "Use Next.js boilerplate?"). AI site builders clone this instead of starting from scratch.

Future: Astro, Remix, and Nuxt boilerplates follow the same structure.

## File Tree

```
examples/nextjs-boilerplate/
├── app/
│   ├── layout.tsx                    # Root layout: html lang, ThemeProvider, Navbar, Footer
│   ├── page.tsx                      # Homepage: reads content/pages/home.json
│   ├── globals.css                   # Tailwind v4 base styles + light/dark CSS variables
│   ├── blog/
│   │   ├── page.tsx                  # Blog listing: getCollection('posts')
│   │   └── [slug]/
│   │       └── page.tsx              # Blog post: getDocument, ArticleBody, generateMetadata
│   ├── [slug]/
│   │   └── page.tsx                  # Dynamic pages with blocks rendering
│   ├── api/
│   │   └── revalidate/
│   │       └── route.ts              # HMAC-signed webhook endpoint (F41-compatible)
│   ├── sitemap.ts                    # Auto-generated sitemap from all collections
│   └── robots.ts                     # robots.txt pointing to sitemap
├── components/
│   ├── article-body.tsx              # react-markdown + remark-gfm with ALL custom renderers
│   ├── block-renderer.tsx            # Switch on _block, renders hero/features/cta/notice
│   ├── navbar.tsx                    # Responsive nav, reads global settings navLinks
│   ├── footer.tsx                    # Footer with site info
│   └── theme-toggle.tsx              # Light/dark mode toggle (localStorage + system pref)
├── lib/
│   ├── content.ts                    # getCollection, getDocument, getSingleton wrappers
│   └── theme-provider.tsx            # ThemeProvider context (class-based dark mode)
├── content/
│   ├── pages/
│   │   └── home.json                 # Sample homepage with blocks (hero + features)
│   ├── posts/
│   │   ├── getting-started.json      # Sample blog post with richtext + images
│   │   └── using-blocks.json         # Sample post demonstrating blocks
│   └── global/
│       └── global.json               # Site title, description, navLinks, footer
├── public/
│   ├── favicon.svg                   # WebHouse favicon
│   └── images/
│       └── placeholder.svg           # Placeholder image for sample content
├── cms.config.ts                     # Full config: pages (blocks), posts, global
├── next.config.ts                    # Image remotePatterns, output config
├── tailwind.config.ts                # Tailwind config with dark mode class strategy
├── tsconfig.json                     # TypeScript config with path aliases
├── package.json                      # Next.js 16+, react-markdown, remark-gfm, @webhouse/cms
├── .env.example                      # REVALIDATE_SECRET, NEXT_PUBLIC_SITE_URL
├── .gitignore                        # Standard Next.js + CMS ignores
├── CLAUDE.md                         # AI builder instructions referencing the boilerplate
└── README.md                         # Human-readable setup instructions
```

## Technical Design

### 1. `cms.config.ts` — Standard Collections + Blocks

Three collections that cover the most common patterns:

```typescript
import { defineConfig, defineCollection, defineBlock } from '@webhouse/cms';

export default defineConfig({
  blocks: [
    defineBlock({
      name: 'hero',
      label: 'Hero Section',
      fields: [
        { name: 'tagline', type: 'text', label: 'Tagline', required: true },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'image', type: 'image', label: 'Background Image' },
        { name: 'ctas', type: 'array', label: 'Buttons', fields: [
          { name: 'label', type: 'text', label: 'Label' },
          { name: 'href', type: 'text', label: 'URL' },
          { name: 'variant', type: 'select', options: [
            { label: 'Primary', value: 'primary' },
            { label: 'Secondary', value: 'secondary' },
          ]},
        ]},
      ],
    }),
    defineBlock({
      name: 'features',
      label: 'Features Grid',
      fields: [
        { name: 'title', type: 'text', label: 'Section Title' },
        { name: 'items', type: 'array', label: 'Feature Cards', fields: [
          { name: 'icon', type: 'text', label: 'Icon (emoji or text)' },
          { name: 'title', type: 'text', label: 'Title' },
          { name: 'description', type: 'textarea', label: 'Description' },
        ]},
      ],
    }),
    defineBlock({
      name: 'cta',
      label: 'Call to Action',
      fields: [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'buttonText', type: 'text', label: 'Button Text' },
        { name: 'buttonUrl', type: 'text', label: 'Button URL' },
      ],
    }),
    defineBlock({
      name: 'notice',
      label: 'Notice / Callout',
      fields: [
        { name: 'text', type: 'textarea', label: 'Text' },
        { name: 'variant', type: 'select', label: 'Variant', options: [
          { label: 'Info', value: 'info' },
          { label: 'Warning', value: 'warning' },
          { label: 'Tip', value: 'tip' },
        ]},
      ],
    }),
  ],

  collections: [
    defineCollection({
      name: 'global',
      label: 'Global Settings',
      fields: [
        { name: 'siteTitle', type: 'text', label: 'Site Title', required: true },
        { name: 'siteDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'navLinks', type: 'array', label: 'Navigation', fields: [
          { name: 'label', type: 'text', label: 'Label' },
          { name: 'href', type: 'text', label: 'URL' },
        ]},
        { name: 'footerText', type: 'text', label: 'Footer Text' },
      ],
    }),
    defineCollection({
      name: 'pages',
      label: 'Pages',
      urlPrefix: '/',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'metaDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'sections', type: 'blocks', label: 'Sections',
          blocks: ['hero', 'features', 'cta', 'notice'] },
      ],
    }),
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      urlPrefix: '/blog',
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true,
          ai: { hint: 'Concise, descriptive title under 70 characters', maxLength: 70 } },
        { name: 'excerpt', type: 'textarea', label: 'Excerpt',
          ai: { hint: 'One-paragraph summary', maxLength: 200 } },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'date', type: 'date', label: 'Publish Date' },
        { name: 'author', type: 'text', label: 'Author' },
        { name: 'coverImage', type: 'image', label: 'Cover Image' },
        { name: 'tags', type: 'tags', label: 'Tags' },
      ],
    }),
  ],

  storage: {
    adapter: 'filesystem',
    filesystem: { contentDir: 'content' },
  },
});
```

### 2. `components/article-body.tsx` — The Canonical Renderer

This is the most critical file. It MUST include:

- `react-markdown` with `remark-gfm`
- Custom `img` component that parses TipTap's `title` field for `float:left|width:300px`
- Custom renderers for headings, paragraphs, links, lists, tables, code, blockquotes
- `clear: "both"` wrapper for floated image cleanup
- `"use client"` directive (react-markdown requires it)

This is copied verbatim from the CLAUDE.md `ArticleBody` reference pattern.

### 3. `components/block-renderer.tsx` — Blocks Support

```typescript
interface Block { _block: string; [key: string]: unknown; }

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block._block) {
          case 'hero': return <HeroBlock key={i} {...block} />;
          case 'features': return <FeaturesBlock key={i} {...block} />;
          case 'cta': return <CtaBlock key={i} {...block} />;
          case 'notice': return <NoticeBlock key={i} {...block} />;
          default: return null;
        }
      })}
    </>
  );
}
```

Each block component is minimal but correct — demonstrating the pattern without heavy styling.

### 4. `components/theme-toggle.tsx` + `lib/theme-provider.tsx` — Light/Dark Mode

Class-based dark mode with:
- `ThemeProvider` using React context + `localStorage` persistence
- System preference detection via `prefers-color-scheme`
- `ThemeToggle` button component (sun/moon icons)
- CSS variables in `globals.css` for light/dark color schemes
- `suppressHydrationWarning` on `<html>` to avoid mismatch

### 5. `app/api/revalidate/route.ts` — Revalidation Endpoint with HMAC-SHA256

The boilerplate ships a fully working revalidation endpoint that:
- Validates `X-CMS-Signature` header using HMAC-SHA256 with `REVALIDATE_SECRET`
- Calls `revalidatePath()` for each path in the payload
- Works safely when `REVALIDATE_SECRET` is not set (local/non-GitHub sites simply skip validation)
- Returns 401 if secret is configured but signature is missing/invalid

```typescript
// app/api/revalidate/route.ts
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

const SECRET = process.env.REVALIDATE_SECRET;

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-cms-signature');
  const body = await request.text();

  // Verify HMAC if secret is configured
  if (SECRET) {
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
    const expected = 'sha256=' + crypto
      .createHmac('sha256', SECRET)
      .update(body)
      .digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }
  // If no SECRET configured (local dev), accept all requests — safe for non-GitHub sites

  const payload = JSON.parse(body);
  const paths: string[] = payload.paths ?? ['/'];

  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ revalidated: true, paths, timestamp: new Date().toISOString() });
}
```

**Key design choice:** When `REVALIDATE_SECRET` is not set, the endpoint accepts all requests without signature validation. This means:
- Local filesystem sites: endpoint exists but is harmless (no external caller, no secret needed)
- GitHub-backed sites: MUST set `REVALIDATE_SECRET` in `.env` and in CMS admin site settings
- The boilerplate `.env.example` includes `REVALIDATE_SECRET=` with instructions to generate via `openssl rand -hex 32`

The `revalidateUrl` and `revalidateSecret` fields are configured in CMS admin → Site Settings → Revalidation section (see F41). The boilerplate CLAUDE.md includes full setup instructions for AI site builders.

### 6. `lib/content.ts` — Content Loader

Uses `@webhouse/cms/adapters` directly:

```typescript
import { getCollection, getDocument, getSingleton } from '@webhouse/cms/adapters';
export { getCollection, getDocument, getSingleton };
```

This thin wrapper exists so the boilerplate works whether `@webhouse/cms` is installed (uses the adapter) or not (can fall back to local fs reads).

### 7. `CLAUDE.md` — AI Builder Instructions

Tells AI sessions:
- This is a boilerplate project — modify freely, do not start from scratch
- Points to `components/article-body.tsx` as the canonical richtext renderer
- Points to `components/block-renderer.tsx` for the block pattern
- Explains how to add new collections (add to `cms.config.ts`, create `content/<name>/`, add route)
- Explains how to add new block types (add to `cms.config.ts` blocks array, add case to `block-renderer.tsx`)
- References the admin UI options

### 8. Sample Content

`content/pages/home.json` — A homepage with hero + features blocks, demonstrating the blocks data format.

`content/posts/getting-started.json` — A blog post with markdown content including headings, images (one with float/width in title), a table, a code block, and a blockquote.

`content/posts/using-blocks.json` — A post explaining the block system.

`content/global/global.json` — Site title, description, nav links, footer text.

## CLI Integration

### Scaffolder Enhancement

Update `packages/create-cms/src/index.ts` to support boilerplate mode:

```bash
# Interactive prompt adds option:
npm create @webhouse/cms my-site
# → "Would you like to use a framework boilerplate?"
#   ❯ No — minimal project (current behavior)
#     Next.js boilerplate (recommended)

# Or via flag:
npm create @webhouse/cms my-site --boilerplate nextjs
```

When boilerplate mode is selected:
1. Copy `examples/nextjs-boilerplate/` to the project directory
2. Update `package.json` name to the project name
3. Update `CLAUDE.md` with the project name
4. Run `npm install`

### Future Boilerplates

```
examples/
  nextjs-boilerplate/     # F42 Phase 1 (this feature)
  astro-boilerplate/      # F42 Phase 2 (future)
  remix-boilerplate/      # F42 Phase 3 (future)
  nuxt-boilerplate/       # F42 Phase 4 (future)
```

## Implementation Steps

1. **Create `examples/nextjs-boilerplate/` directory structure** — all files listed in the file tree above
2. **Implement `components/article-body.tsx`** — the canonical react-markdown renderer from CLAUDE.md
3. **Implement `components/block-renderer.tsx`** — hero, features, cta, notice block components
4. **Implement `components/theme-toggle.tsx` + `lib/theme-provider.tsx`** — light/dark mode
5. **Implement `app/api/revalidate/route.ts`** — HMAC webhook endpoint
6. **Create `cms.config.ts`** — global, pages (blocks), posts collections
7. **Create sample content** — home page, 2 blog posts, global settings
8. **Create `app/` routes** — layout, homepage, blog listing, blog post, dynamic page
9. **Create `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `package.json`**
10. **Write `CLAUDE.md`** — AI builder instructions
11. **Write `README.md`** — human setup instructions
12. **Update `packages/create-cms/src/index.ts`** — add `--boilerplate` flag and interactive prompt
13. **Test** — `cd examples/nextjs-boilerplate && npm install && npm run dev` must work
14. **Update `examples/` in root `package.json` / turbo config** if needed

## Dependencies

- **@webhouse/cms/adapters** — core content loaders (Done, existing)
- **F41 GitHub Site Auto-Sync** — the revalidation endpoint is included proactively; works standalone

## Effort Estimate

**Medium** — 3-4 days

- Day 1: Project structure, cms.config.ts, content loader, sample content, Next.js config
- Day 2: ArticleBody, BlockRenderer, theme system, layout + pages
- Day 3: Revalidation endpoint, sitemap, robots, CLAUDE.md, README
- Day 4: Scaffolder integration (`--boilerplate` flag), testing, polish
