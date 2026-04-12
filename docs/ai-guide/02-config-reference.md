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
  build: {
    outDir: 'dist',                  // Output directory for build (default: 'dist')
    baseUrl: '/',                    // Base URL for links
    command: 'hugo --minify',        // Optional (F126): custom build command — omit for native CMS pipeline
    workingDir: '.',                 // Optional (F126): working dir relative to config (default: config dir)
    timeout: 300,                    // Optional (F126): build timeout in seconds (default: 300, max: 900)
    env: { HUGO_ENV: 'production' }, // Optional (F126): env vars passed to command (allowlisted)
  },
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

### Build Config (F126)

The `build` key in `defineConfig()` controls how the site is built. By default, the native CMS pipeline runs (`npx cms build`). Set `build.command` to use any framework's CLI instead.

```typescript
build: {
  // ── Standard fields ──
  outDir: 'dist',              // Output directory (default: 'dist')
  baseUrl: '/',                // Base URL for all generated links

  // ── F126: Custom build command ──
  command: 'php artisan build', // Shell command (parsed into argv, NO shell interpretation)
  workingDir: '.',              // Working directory, relative to cms.config.ts (default: config dir)
  timeout: 300,                 // Seconds before SIGTERM (default: 300, max: 900)
  env: {                        // Env vars passed to the command (allowlisted keys only)
    APP_ENV: 'production',
  },

  // ── Standard fields (always available) ──
  rss: { title: 'My Blog', collections: ['posts'] },
  robots: { strategy: 'maximum' },
}
```

**Allowed env var keys:** `APP_ENV`, `NODE_ENV`, `RAILS_ENV`, `DJANGO_SETTINGS_MODULE`, `HUGO_ENV`, `JEKYLL_ENV`, `BASE_URL`, `BASE_PATH`, `BUILD_OUT_DIR`, `PUBLIC_URL`, `DOTNET_ENVIRONMENT`, `GOPATH`, `GOFLAGS`, `MIX_ENV`.

**Blocked env var keys:** `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES`, `DYLD_LIBRARY_PATH` (security).

When `build.command` is omitted, the native CMS build pipeline runs — fully backwards compatible.

#### Build Profiles

Multiple named build targets per site:

```typescript
build: {
  profiles: [
    { name: 'dev', command: 'npm run dev', outDir: 'dist', description: 'Local dev build' },
    { name: 'prod', command: 'mvn package -DskipTests', outDir: 'target', description: 'Production' },
  ],
  defaultProfile: 'prod',
}
```

Profile fields: `name` (required), `command` (required), `outDir` (required), `workingDir`, `env`, `description`, `timeout`, `previewUrl`, `docker`.

#### Docker Mode

Run builds in isolated containers — no framework install needed on host:

```typescript
// Preset shorthand (expands to a known image):
build: { command: 'php artisan build', docker: 'laravel' }

// Full config:
build: {
  command: 'python manage.py collectstatic',
  docker: { image: 'python:3.12-slim', workdir: '/workspace' },
}
```

Presets: `php`, `laravel`, `python`, `django`, `ruby`, `rails`, `go`, `hugo`, `node`, `dotnet`.

Docker wraps the command: `docker run --rm -v project:/workspace -w /workspace image command args`.
