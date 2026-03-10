# @webhouse/cms — Development Phases

**Last updated:** 2026-03-09
**Status:** Phase 1 complete ✅

---

## Phase 1 — Foundation ✅ COMPLETE

**Milestone:** `npx cms init` → definer en blog-collection → tilføj posts → `npx cms build` → fungerende statisk blog.

### Deliverables
- `@webhouse/cms` core pakke
  - Schema definition system (`defineConfig`, `defineCollection`, `defineBlock`)
  - Zod runtime-validering af config
  - JSON Schema introspection + maskinlæsbar manifest (`GET /api/manifest`)
  - `StorageAdapter` interface (provider-agnostisk)
  - `FilesystemStorageAdapter` — JSON-filer i `content/{collection}/{slug}.json`
  - `SqliteStorageAdapter` — Drizzle ORM + better-sqlite3
  - `ContentService` med lifecycle hooks
  - Hono REST API (`/api/content`, `/api/schema`, `/api/manifest`)
  - Tagged template engine (`html`, `raw`) med auto-escaping
  - Build pipeline: resolve → render → output (Markdown via `marked`)
  - Built-in block renderers: layout, richtext, hero, image
- `@webhouse/cms-cli`
  - `cms init` — scaffold nyt projekt
  - `cms dev` — start API server med file watching
  - `cms build` — generer statisk HTML
  - `cms serve` — server dist/ via HTTP (klikbare links)
  - Config loading via `jiti` (runtime TypeScript transpilation)
- 10/10 tests passer

---

## Phase 2 — AI-integration + Content Hierarchy 🔄 NEXT

**Milestone:** `cms ai generate posts "Skriv 3 posts om sportsskader"` → færdige SEO-optimerede posts → `cms build` → fungerende site.

### Deliverables

#### `@webhouse/cms-ai` — ny pakke
- **Provider registry** — Anthropic (Claude) + OpenAI, let at skifte
- **Content Agent**
  - `generate` — generér nyt content fra intent/prompt
  - `rewrite` — omskriv med ny tone/målgruppe/længde
  - `translate` — oversæt med bevaret struktur
  - `seo-optimize` — omskriv til target keywords + bevaret læsbarhed
  - `expand` — udvid outline/bullets til fuldt content
- **SEO Agent**
  - Auto-generér `<meta title>`, `<meta description>`, Open Graph tags
  - Struktureret data (JSON-LD schema markup)
  - Sitemap.xml generering
- Cost estimation — estimér token-forbrug + pris inden kørsel
- Agent task queue

#### URL-routing forbedringer (i `@webhouse/cms`)
- `urlPrefix` option på `CollectionConfig`
  ```typescript
  defineCollection({
    name: 'pages',
    urlPrefix: '/',  // → /om-os/ i stedet for /pages/om-os/
  })
  ```
- Hierakiske slugs — slug kan indeholde `/` for nested paths
  ```
  slug: 'produkter/jeans/blue'  →  URL: /produkter/jeans/blue/
  ```
- **Parent-child relationer** — dokument har `parent` felt → URL beregnes automatisk
  ```
  Kategori: /produkter/
  Underkategori: /produkter/jeans/
  Produkt: /produkter/jeans/blue-501/
  ```
  Giver automatisk: breadcrumbs, sitemap-hierarki, SEO-struktur

#### CLI udvidelse
- `cms ai generate <collection> "<prompt>"` — generer + gem direkte
- `cms ai rewrite <collection>/<slug> "<instruktion>"` — omskriv eksisterende
- `cms ai cost` — estimér pris for pending operationer
- `cms ai seo` — kør SEO-agent på alle published docs

#### Manifest udvidelse
- `/api/manifest` returnerer også AI-capabilities
  ```json
  {
    "ai": {
      "agents": ["content", "seo"],
      "providers": ["anthropic/claude-sonnet-4-6"],
      "capabilities": ["generate", "rewrite", "translate", "seo-optimize"]
    }
  }
  ```

---

## Phase 3 — Storage Adapters + Deploy ☁️

**Milestone:** Første ægte test-site deployet på Fly.io med SQLite på persistent volume.

### Deliverables

#### `SupabaseStorageAdapter`
- Implementerer `StorageAdapter` interface mod Supabase (PostgreSQL)
- Realtime subscriptions (content updates trigger rebuild)
- Row-level security klar til multi-tenant setups
- Migrations via Drizzle mod PostgreSQL

#### `PostgresStorageAdapter`
- Generisk PostgreSQL adapter (virker med Railway, Neon, self-hosted)
- Connection pooling via `postgres.js`

#### Docker + Fly.io deploy
- `Dockerfile` til CMS-applikation
  - SQLite på persistent Fly.io volume (`/data/content.db`)
  - `fly.toml` med `primary_region = "arn"` (Stockholm)
  - Health check endpoint
- `cms deploy fly` — deploy til Fly.io med ét kald
- `cms deploy docker` — byg og kør lokalt i Docker
- Automatisk `cms build` som del af deploy pipeline

#### Incremental builds
- Checksum-baseret change detection — byg kun ændrede sider
- Build cache i `.cms/cache/`
- Dependency graph: hvilke sider afhænger af hvilket content

---

## Phase 4 — Admin Dashboard 🖥️

**Milestone:** En ikke-udvikler kan logge ind, oprette/redigere content visuelt, bruge AI-assistance, og publicere — uden at røre kode.

### Deliverables

#### `@webhouse/cms-admin` — Next.js + shadcn/ui
- Collection browser + document liste
- Block-baseret content editor med live preview
- Media library (upload + AI-generering)
- AI chat panel — inline assistance
- Build + Deploy kontroller
- Version history

#### Auth system
- Email/password + magic link
- API key management
- Session handling

#### Editor AI-features
- Markér tekst → AI rewrite panel
- Block-forslag baseret på content-type
- Billedgenerering fra editor

---

## Phase 5 — Framework Adapters 🔌

**Milestone:** Claude Code kan scaffold et Next.js projekt med `@webhouse/cms` fuldt integreret på én session.

### Deliverables
- `@webhouse/cms-adapter-next` — App Router, Server Components, ISR, Server Actions
- `@webhouse/cms-adapter-astro` — Content collections, build plugin, island alignment
- `@webhouse/cms-adapter-node` — Express/Fastify middleware

---

## Phase 6 — Design System & Themes 🎨

**Milestone:** Giv systemet en logo + industri-beskrivelse → få et komplet, unikt design system → professionelt udseende site.

### Deliverables
- `@webhouse/cms-themes` — Design token specification + base component library
- **Design Agent** — brand-to-tokens generering, layout-forslag, responsiv tilpasning, a11y audit
- **Infographic Engine** — data → SVG pipeline, chart templates, social media cards
- Typography scale system + color system generator

---

## Phase 7 — Enterprise & Polish 🏢

### Deliverables
- Multi-user + RBAC (admin, editor, viewer)
- Content approval workflows + audit logging
- A/B testing framework
- Content scheduling (publicer på fremtidig dato)
- Multi-language / i18n
- Import fra WordPress, Ghost, Contentful
- Vercel, Cloudflare Pages, Netlify deploy adapters
- Plugin system finalisering

---

## Arkitektoniske beslutninger (løbende noter)

| Beslutning | Valg | Begrundelse |
|---|---|---|
| Data storage model | JSON blob i `data` kolonne | Undgår ALTER TABLE ved schema-ændringer |
| Richtext format | Markdown (Phase 1), PortableText (Phase 3+) | AI-venligt, human-readable |
| API framework | Hono | ~14KB, Edge-kompatibel, TypeScript-first |
| Config loading | jiti | Runtime TS transpilation, ingen build step |
| CLI framework | citty | Lightweight, UnJS ecosystem |
| Template engine | Tagged templates | Full TS expressiveness, ingen parser overhead |
| Document IDs | nanoid (21 chars) | Kortere end UUID, URL-safe |
| Default DB | SQLite + Drizzle | Zero config, embedded, perfekt til standalone + Fly.io |
| Cloud DB | Supabase (Phase 3) | PostgreSQL, realtime, RLS, god DX |
| Fly.io region | `arn` (Stockholm) | Tættest på danske brugere |
| Hierakiske URL'er | Parent-child relation + slash-slugs | SEO-venlig, automatisk breadcrumbs |
| Pages vs. Posts | `urlPrefix: '/'` på collection | Fleksibel routing uden separate koncepter |
