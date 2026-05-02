<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->
# @webhouse/cms — AI Site Builder Guide

`@webhouse/cms` is a **framework-agnostic** file-based, AI-native CMS engine. You define collections and fields in a `cms.config.ts` file, and the CMS stores content as flat JSON files in a `content/` directory (one file per document, organized by collection). The admin UI is TypeScript/Next.js, but the **content layer is universal** — Next.js, Laravel, Django, Spring Boot, .NET, Rails, Hugo, and any other framework can read the same JSON files. See `examples/consumers/` for working reference apps in Java and .NET.

## Modular Documentation

This guide is split into **20 focused modules**. Fetch only what you need for the current task.

**Base URL:** `https://raw.githubusercontent.com/webhousecode/cms/main/docs/ai-guide/`

| # | Module | When to fetch |
|---|--------|--------------|
| 01 | **Getting Started** | New project, first setup, scaffolding |
| 02 | **Config Reference** | defineConfig, defineCollection, collection options |
| 03 | **Field Types** | Adding or configuring field types (text, richtext, image, blocks, etc.) |
| 04 | **Blocks** | Block-based content (hero, features, CTA sections) |
| 05 | **Richtext** | Embedded images/media in richtext, rendering guidance |
| 06 | **Storage Adapters** | Filesystem, GitHub, or SQLite storage config |
| 07 | **Content Structure** | Document JSON format, content directory layout |
| 08 | **Next.js Patterns** | Pages, layouts, generateStaticParams, loader functions |
| 09 | **CLI Reference** | CMS CLI commands, AI commands |
| 10 | **Config Example** | Full real-world cms.config.ts as reference |
| 11 | **API Reference** | Programmatic ContentService usage |
| 12 | **Admin UI** | CMS admin setup, Docker, npx, architecture notes |
| 13 | **Site Building** | Common mistakes, content file rules, patterns, richtext rendering |
| 14 | **Relationships** | Content relations, resolving, blog+author pattern |
| 15 | **SEO** | Metadata, JSON-LD, AI SEO, sitemap, robots.txt |
| 16 | **Images** | Image handling, next/image, responsive patterns |
| 17 | **i18n** | Multi-language, locale routing, translation |
| 18 | **Deployment** | Vercel, Docker, Fly.io deployment checklist |
| 19 | **Troubleshooting** | Common errors, debugging, FAQ |
| 20 | **Interactives** | Data-driven interactive content, embedding |
| 21 | **Framework Consumers** | Non-TS readers (Java, .NET, PHP, Python, Ruby, Go), schema export rules — **fetch this whenever modifying `cms.config.ts` in a project that has non-TS consumers** |

**Example:** To fetch the field types reference:
```
fetch https://raw.githubusercontent.com/webhousecode/cms/main/docs/ai-guide/03-field-types.md
```

### Quick decisions

- **"Add a blog"** → fetch 02, 03, 08, 13
- **"Add a collection"** → fetch 02, 03, 07
- **"Set up SEO"** → fetch 15
- **"Deploy"** → fetch 18
- **"Add i18n"** → fetch 17, 02
- **"Fix an error"** → fetch 19
- **"Block-based pages"** → fetch 04, 03, 08
- **"Content relationships"** → fetch 14, 02
- **"Interactives"** → fetch 20, 05
- **"Add Java/PHP/Python/Ruby/Go/.NET consumer"** → fetch 21, 02
- **"Modify cms.config.ts in a framework consumer project"** → fetch 21 (mandatory schema re-export rule)
- **"Run schema export"** → fetch 21

---

## Essential Quick Reference

### Quick Start

```bash
npm create @webhouse/cms my-site
cd my-site && npm install
npx cms dev       # Start dev server + admin UI
npx cms build     # Build static site
```

### Document JSON format

Every document in `content/{collection}/{slug}.json`:
```json
{
  "slug": "my-post",
  "status": "published",
  "data": {
    "title": "My Post",
    "content": "..."
  },
  "id": "unique-id",
  "_fieldMeta": {}
}
```

### Field types

`text` `textarea` `richtext` `number` `boolean` `date` `image` `image-gallery` `video` `audio` `htmldoc` `file` `interactive` `column-slots` `map` `select` `tags` `relation` `array` `object` `blocks`

### Defining a collection

```typescript
import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      urlPrefix: '/blog',
      kind: 'page',                                    // F127 — see below
      description: 'Long-form blog articles. Each post has its own URL and appears in the RSS feed.',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'excerpt', type: 'textarea' },
        { name: 'content', type: 'richtext' },
        { name: 'date', type: 'date' },
        { name: 'heroImage', type: 'image' },
        { name: 'tags', type: 'tags' },
      ],
    }),
  ],
});
```

### Collection Metadata — REQUIRED for AI-friendly sites (F127)

Every collection SHOULD have both `kind` and `description`. Without them, AI
tools (chat, Claude Code, Cursor) have to guess what each collection is for
and may generate content incorrectly — wasting tokens on SEO for collections
that have no URL, showing broken View links, or remapping fields that don't
exist.

**`kind`** — one of five values:

| Kind | When to use | AI behavior |
|------|-------------|-------------|
| `page` | Has its own URL, appears in sitemap (blog posts, landing pages). **Default.** | Full treatment: SEO, View pill, build |
| `snippet` | Reusable fragment embedded via `{{snippet:slug}}`. No standalone URL. | No SEO, no View pill, still builds |
| `data` | Records rendered on OTHER pages via loops (team, testimonials, FAQ, products). | No SEO, no View pill, no body/content remap |
| `form` | Form submissions (contact, lead capture). Read-only from AI. | AI cannot create — users create via frontend |
| `global` | Single-record site-wide configuration. | Treat as settings, no URL |

**`description`** — plain-English prose explaining what the collection is and
how it's consumed. This is the escape hatch for anything `kind` can't capture.

Good descriptions answer:
1. **What is this?** ("Team members.", "Customer testimonials.")
2. **Where does it appear?** ("Rendered on /about.", "Looped on the homepage hero.")
3. **What references it?** ("Referenced by posts.author field.")

**Good examples:**

```typescript
defineCollection({
  name: 'team',
  label: 'Team Members',
  kind: 'data',
  description: 'Team members. Referenced by posts.author field. Rendered on /about and as bylines on posts.',
  fields: [/* ... */],
});

defineCollection({
  name: 'snippets',
  label: 'Snippets',
  kind: 'snippet',
  description: 'Reusable text fragments embedded in posts via `{{snippet:slug}}`. Used for boilerplate disclaimers, CTAs, and author bios.',
  fields: [/* ... */],
});

defineCollection({
  name: 'contact-submissions',
  label: 'Contact Form',
  kind: 'form',
  description: 'Submissions from the /contact form. Created by end users — never by AI or editors. Reviewed by sales team.',
  fields: [/* ... */],
});

defineCollection({
  name: 'site-settings',
  label: 'Site Settings',
  kind: 'global',
  description: 'Site-wide configuration: footer text, social links, analytics IDs. Single record only.',
  fields: [/* ... */],
});
```

**Bad examples:**

```typescript
// ❌ Missing both
defineCollection({ name: 'team', fields: [/* ... */] })

// ❌ Missing description — chat can't tell if team members get rendered
defineCollection({ name: 'team', kind: 'data', fields: [/* ... */] })

// ❌ Description too vague
defineCollection({ name: 'team', kind: 'data', description: 'Team stuff', fields: [/* ... */] })
```

When you scaffold a new site or add a new collection to an existing one,
**always populate both fields**. Backwards compatible: undefined `kind` falls
back to `"page"` behavior, but this is a fallback for legacy code — not a
pattern to copy.

### Custom Build Commands (F126)

By default, CMS admin runs the native TypeScript build pipeline (`npx cms build` / `build.ts`). If your site uses a different framework (Laravel, Hugo, Django, Rails, etc.), configure `build.command` in `cms.config.ts`:

```typescript
export default defineConfig({
  collections: [/* ... */],
  build: {
    command: 'hugo --minify',        // Any CLI command — runs with shell: false
    outDir: 'public',                // Where the build output lands
    workingDir: '.',                  // Relative to cms.config.ts (default: config dir)
    timeout: 300,                    // Seconds (default: 300, max: 900)
    env: { HUGO_ENV: 'production' }, // Allowlisted env vars passed to the command
  },
});
```

**Framework examples:**

| Framework | `command` | `outDir` |
|-----------|-----------|----------|
| Hugo | `hugo --minify` | `public` |
| Laravel | `php artisan build` | `public` |
| Jekyll | `bundle exec jekyll build` | `_site` |
| Django | `python manage.py collectstatic --no-input` | `staticfiles` |
| Astro | `npm run build` | `dist` |
| Eleventy | `npx @11ty/eleventy` | `_site` |
| .NET | `dotnet publish -c Release -o dist` | `dist` |

When `build.command` is set:
- The Deploy button (Fly.io, GitHub Pages) uses your command instead of `npx tsx build.ts`
- `BUILD_OUT_DIR` and `BASE_PATH` are passed as env vars to the command
- The command runs with `shell: false` — no shell injection possible
- If omitted, the native CMS pipeline runs as before (fully backwards compatible)

**Build Profiles** — multiple build targets per site:

```typescript
build: {
  profiles: [
    { name: 'dev', command: 'npm run dev', outDir: 'dist', description: 'Fast local build' },
    { name: 'production', command: 'mvn package -DskipTests', outDir: 'target', description: 'Production JAR' },
  ],
  defaultProfile: 'production',
}
```

When profiles are configured, the Build button shows a dropdown to select which profile to run.

**Docker Mode** — run builds in isolated containers (no framework install needed on host):

```typescript
build: {
  command: 'php artisan build',
  outDir: 'public',
  docker: 'laravel',          // Preset: expands to { image: 'php:8.3-cli', workdir: '/workspace' }
}

// Or full config:
build: {
  command: 'python manage.py collectstatic',
  docker: { image: 'python:3.12-slim', workdir: '/workspace', env: { DJANGO_ENV: 'prod' } },
}
```

Available Docker presets: `php`, `laravel`, `python`, `django`, `ruby`, `rails`, `go`, `hugo`, `node`, `dotnet`.

### CRITICAL: Multilingual sites require translationGroup on EVERY document

**If the site has 2+ languages, every document pair/group MUST share a `translationGroup` UUID.** Omitting this breaks the side-by-side editor, language switcher, AI bulk translate, and hreflang generation. This is the #1 mistake AI builders make on multilingual sites.

```json
// EN variant
{ "slug": "about-us", "locale": "en", "translationGroup": "550e8400-e29b-41d4-a716-446655440000", ... }

// DA variant — SAME translationGroup value
{ "slug": "om-os",    "locale": "da", "translationGroup": "550e8400-e29b-41d4-a716-446655440000", ... }
```

Rules:
- Generate **one UUID per page/post** (not per translation) using `randomUUID()` from `crypto`
- All language variants of the same content share **identical** `translationGroup`
- `translationOf` is **deprecated** — do not use it for new documents
- Every document in a multilingual collection must also have `locale` set (`"en"`, `"da"`, etc.)

Full reference: fetch `17-i18n.md` or read `https://docs.webhouse.app/ai`.

### Critical rules

1. **Always specify `storage` in `cms.config.ts`** — omitting it defaults to SQLite, not filesystem! Static sites MUST use `storage: { adapter: 'filesystem', filesystem: { contentDir: 'content' } }`
2. **`image-gallery` values must be `{ url, alt }[]`** — never plain string arrays
3. **Always filter by `status === "published"`** — skip drafts
4. **Use `BASE_PATH` env var** for all internal links in static builds
5. **Use `BUILD_OUT_DIR` env var** for output directory in static builds
6. **`_fieldMeta` is required** in document JSON (can be empty `{}`)
7. **Slug must match filename** — `hello-world.json` must have `"slug": "hello-world"`
8. **Never use CDN scripts** (Tailwind, Bootstrap, etc.) — static sites must use inline CSS only
9. **Never name a collection `site-settings`, `settings`, `config`, `admin`, `media`, or `interactives`** — these conflict with CMS admin's built-in UI. Use `globals` for site-wide settings.
10. **i18n preview redirects** — for multilingual sites with locale prefixes (`/da/`, `/en/`), output redirect HTML at the CMS-expected slug path (e.g. `/blog/my-post-da/` → `/da/blog/my-post/`) so CMS preview works.

### Reading content in Next.js

```typescript
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const CONTENT = join(process.cwd(), 'content');

function getCollection(name: string) {
  const dir = join(CONTENT, name);
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')))
    .filter(d => d.status === 'published');
}

function getDocument(collection: string, slug: string) {
  return JSON.parse(readFileSync(join(CONTENT, collection, `${slug}.json`), 'utf-8'));
}
```

### Live content updates: Instant Content Deployment (ICD)

**For Next.js sites with a persistent filesystem (Fly.io with volumes, self-hosted Docker, etc.) — bake this in from day one.** ICD pushes content edits from CMS admin to the deployed site via a signed webhook. New article goes live in ~2 seconds; no Docker rebuild for every word change.

Drop-in route at `app/api/revalidate/route.ts`:

```ts
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const SECRET = process.env.REVALIDATE_SECRET;
const CONTENT_DIR = process.env.CONTENT_DIR ?? join(process.cwd(), "content");

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-cms-signature");
  if (SECRET) {
    if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    const expected = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }
  const payload = JSON.parse(body) as { collection?: string; slug?: string; action?: string; document?: unknown };

  // 1. Persist the change on disk so the next request reads fresh content.
  if (payload.collection && payload.slug) {
    const filePath = join(CONTENT_DIR, payload.collection, `${payload.slug}.json`);
    if (payload.action === "deleted") {
      if (existsSync(filePath)) unlinkSync(filePath);
    } else if (payload.document) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(payload.document, null, 2), "utf-8");
    }
  }

  // 2. Invalidate the ACTUAL routes your app renders (not the cms collection
  //    paths). cms-admin sends paths like "/posts/my-post" but your routes
  //    are likely "/[locale]/blog/[slug]" — map collection→route here.
  if (payload.collection === "posts") {
    for (const locale of ["da", "en"]) {
      revalidatePath(`/${locale}/blog`);
      if (payload.slug) revalidatePath(`/${locale}/blog/${payload.slug}`);
    }
  }
  // (repeat per collection / route shape)

  return NextResponse.json({ ok: true });
}
```

**Wiring** (one-time):

1. Generate secret: `openssl rand -hex 32`
2. Set on hosting: `flyctl secrets set REVALIDATE_SECRET=<secret>` (or platform equivalent)
3. In CMS admin → Site Settings → General: paste the same secret + set Revalidate URL to `https://your-site.tld/api/revalidate`
4. **Mount a volume at `CONTENT_DIR`** (e.g. `/app/content`) so writes survive container restarts. Without this, ICD writes go to the overlay layer and disappear on next deploy.
5. **Seed the volume on first boot** in `docker-entrypoint.sh` — copy baked content from the image into the empty volume so existing articles aren't hidden by the mount.

The header in CMS admin shows an `ICD · auto` pill once configured. Editors save → site updates in ~2s, no rebuild.

### Next.js SEO helpers: `@webhouse/cms/next`

Drop-in sitemap, robots, metadata, JSON-LD, RSS, llms.txt:

```typescript
// app/sitemap.ts
import { cmsSitemap } from '@webhouse/cms/next';
export default cmsSitemap({ baseUrl: 'https://example.com', collections: [{ name: 'posts', urlPrefix: '/blog' }] });

// app/robots.ts
import { cmsRobots } from '@webhouse/cms/next';
export default cmsRobots({ baseUrl: 'https://example.com', strategy: 'maximum' });

// In generateMetadata():
import { cmsMetadata } from '@webhouse/cms/next';
return cmsMetadata({ baseUrl: 'https://example.com', siteName: 'My Site', doc, urlPrefix: '/blog' });
```

Full reference: `docs/ai-guide/15-seo.md`
