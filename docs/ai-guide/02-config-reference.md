<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Config Reference

## cms.config.ts Reference

The config file uses helper functions for type safety. All are identity functions that return their input:

```typescript
import { defineConfig, defineCollection, defineBlock, defineField } from '@webhouse/cms';

export default defineConfig({
  collections: [ /* ... */ ],
  blocks: [ /* ... */ ],
  defaultLocale: 'en',           // Optional: default locale for <html lang="">
  locales: ['en', 'da'],         // Optional: supported locales for AI translation
  autolinks: [ /* ... */ ],      // Optional: automatic internal linking rules
  storage: { /* ... */ },        // REQUIRED — defaults to SQLite if omitted! Use 'filesystem' for static sites
  build: { outDir: 'dist', baseUrl: '/' },
  api: { port: 3000 },
});
```

### Collection Config

```typescript
defineCollection({
  name: 'posts',                 // Required: unique identifier, used as directory name
  label: 'Blog Posts',           // Optional: human-readable label for admin UI
  slug: 'posts',                 // Optional: URL slug override
  urlPrefix: '/blog',            // Optional: URL prefix for generated pages
  kind: 'page',                  // Optional (F127): "page" | "snippet" | "data" | "form" | "global". Default "page".
  description: 'Long-form blog articles. Each post has its own URL and appears in the RSS feed.', // Optional (F127): plain-English purpose for AI tools
  previewable: true,             // Optional: whether individual docs have preview pages. Default true.
  sourceLocale: 'en',            // Optional: primary authoring locale
  locales: ['en', 'da'],         // Optional: translatable locales
  fields: [ /* ... */ ],         // Required: array of FieldConfig
  hooks: {                       // Optional: lifecycle hooks
    beforeCreate: 'path/to/hook.js',
    afterCreate: 'path/to/hook.js',
    beforeUpdate: 'path/to/hook.js',
    afterUpdate: 'path/to/hook.js',
    beforeDelete: 'path/to/hook.js',
    afterDelete: 'path/to/hook.js',
  },
})
```

### Collection `kind` — tell AI tools what the collection is FOR (F127)

Every collection SHOULD have `kind` and `description`. They drive how chat,
MCP, and scaffolding AI tools treat the collection:

| Kind | Use for | AI behavior |
|------|---------|-------------|
| `page` | Blog posts, landing pages, docs — anything with its own URL. **Default.** | Full treatment: SEO, View pill, build |
| `snippet` | Reusable fragments embedded via `{{snippet:slug}}` (no standalone URL) | No SEO, no View pill, still builds |
| `data` | Records rendered on OTHER pages (team, testimonials, FAQ, products) | No SEO, no View pill, no body/content remap |
| `form` | Form submissions (contact, lead capture). Read-only from AI. | AI cannot create |
| `global` | Single-record site-wide config (footer, social links, settings) | Treated as settings |

**Always populate both fields on new collections.** Without them, AI tools
have to guess what each collection is for — and often guess wrong (wasted
SEO tokens, broken View links, field remapping errors).

**`description`** should answer:
1. What is this? ("Team members.", "Customer testimonials.")
2. Where does it appear? ("Rendered on /about.", "Looped on homepage hero.")
3. What references it? ("Referenced by posts.author field.")

Examples by kind:

```typescript
// PAGE — has URL
defineCollection({
  name: 'posts',
  kind: 'page',
  urlPrefix: '/blog',
  description: 'Long-form blog articles. Each post has its own URL and appears in the RSS feed.',
  fields: [/* ... */],
});

// SNIPPET — embedded in other content
defineCollection({
  name: 'snippets',
  kind: 'snippet',
  description: 'Reusable text fragments embedded in posts via `{{snippet:slug}}`. Used for disclaimers, CTAs, author bios.',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'content', type: 'richtext', required: true },
  ],
});

// DATA — rendered on other pages
defineCollection({
  name: 'team',
  kind: 'data',
  description: 'Team members. Referenced by posts.author field. Rendered on /about and as bylines on posts.',
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'role', type: 'text' },
    { name: 'bio', type: 'textarea' },
    { name: 'photo', type: 'image' },
  ],
});

// FORM — read-only, created by visitors
defineCollection({
  name: 'contact-submissions',
  kind: 'form',
  description: 'Submissions from the /contact form. Created by visitors. Reviewed by sales team.',
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'email', type: 'text', required: true },
    { name: 'message', type: 'textarea', required: true },
  ],
});

// GLOBAL — site-wide configuration
defineCollection({
  name: 'globals',
  kind: 'global',
  description: 'Site-wide configuration: footer text, social links, analytics IDs. Single record only.',
  fields: [/* ... */],
});
```

Full reference: `docs.webhouse.app/docs/collection-metadata`
