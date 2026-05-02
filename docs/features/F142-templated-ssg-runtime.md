# F142 — Templated SSG Runtime (built-in build server)

**Status:** planned
**Owner:** cms-core
**Priority:** Tier 1 (unblocks "filesystem sites publish from anywhere")
**Estimat:** 7-10 fokuserede dage, splitbar i 5 phases
**Created:** 2026-05-02

## Motivation — det observerede problem

Audit af 20 eksisterende `build.ts` filer på Christians disk (2026-05-02):

| npm-dependency | Antal sites |
|---|---|
| **(ingen, kun node:fs + node:path)** | 11/20 |
| `marked` (markdown→HTML) | 5/20 |
| `@webhouse/cms` (kun trail-eksempel) | 1/20 |
| Tunge/site-specifikke deps | **0/20** |

**Konsekvenser af "hvert site har sin egen build.ts":**

1. Filesystem-adapter sites kan ikke deployes fra remote cms-admin (webhouse.app), fordi `build.ts` + per-site `node_modules` mangler. Beam transporterer kun `content/`. Det kostede 5 timer på trail-landing 2026-05-02 og er det incident der motiverer denne F.
2. Hver build.ts er 400–1800 linjer **næsten identisk** kode (header/footer/post-loop/sitemap) — copy-paste-arket. Et site-design-skift kræver edits i N filer.
3. Per-site `node_modules` koster ~50 MB × N sites på Fly volumen. Skalerer dårligt til 30+ sites.
4. cms-admin's "rocket button" kan kun virke der hvor build-toolchainen tilfældigvis ligger (typisk Christians Mac). Det modsiger CMS-løftet om "én knap, virker overalt".

## Vision

cms-admin har en **indbygget templated SSG-runtime** med en lille pulje af pre-installerede helpers. Sites definerer deres design DECLARATIVT (templates som tagged-template-literal funktioner) i stedet for at skrive en hel build.ts. For 99% af cases trykker du rocket og cms-admin bygger sitet selv — ingen `build.ts`, ingen per-site `node_modules`, ingen Beam-source-transport, ingen GitHub Actions afhængighed.

Custom `build.ts` forbliver **escape hatch** for de få sites der har genuinely custom behov.

## Scope

### IN-scope

1. SSG-runtime i `packages/cms-admin/src/lib/ssg/`
2. Template-DSL: tagged-template-literal funktioner (no JSX compile step)
3. Pre-installerede deps i cms-admin: `marked`, `gray-matter`, `slugify`, `sharp`, `marked-highlight`
4. `helpers` API exposed til templates (markdown, image-resize, dates, slugs, SEO meta, JSON-LD, SVG-load)
5. Templates lever i `templates/`-mappe ved siden af `cms.config.ts`, eller inline i config for små sites
6. Routing baseret på `cms.config.ts` collection's `urlPattern` field
7. Auto-generation af `sitemap.xml`, `robots.txt`, `rss.xml`
8. Layout-wrapping (`templates/layout.tsx` indpakker hver page)
9. "Rocket button" detection: hvis `templates/` mappe findes → brug SSG runtime; ellers fall back til legacy `build.ts`
10. Output skrives til `deploy/`, pushes til samme targets som i dag (gh-pages, Cloudflare Pages, Fly.io static, etc.)
11. Reference-migration: trail-landing fra `build.ts` → templated SSG, som første pilot
12. Updateret `static-boilerplate` så nye sites scaffoldes uden `build.ts`

### OUT-of-scope (kan komme i senere F-nummer)

- Real client-side JavaScript at scale (kun små embedded scripts som inline `<script>`-tags fra templates)
- Server-side rendering (Next.js territory)
- Full Tailwind compile pipeline (sites embedder CSS direkte eller refererer en built CSS-fil)
- Custom plugin/dep ecosystem (fast lukket dep-pulje; bring-your-own-dep = brug build.ts escape hatch)
- Big-bang migration af alle eksisterende sites (sker site-for-site frivilligt, ikke som breaking change)

### Non-goals

- Erstatte Jekyll/Hugo for sites uden CMS — vi er CMS-first, SSG-second
- Visual page builder (det er F30 / Form Engine territory)
- Replikere Astro/Eleventy 1:1 — vi bygger den minimale templated SSG der dækker 99% af eksisterende sites' behov

## Arkitektur

### Data flow

```
cms.config.ts ──┐
content/*.json ─┼─→ cms-admin SSG runtime ─→ deploy/ ─→ host (gh-pages, CF Pages, ...)
templates/*.tsx ┘
```

Alt input lever på cms-admin's disk (filesystem-adapter). Intet i `node_modules` per site. Output `deploy/` pushes via samme path som i dag.

### Template-DSL — tagged template literals

```tsx
// templates/post.tsx
import { html } from '@webhouse/cms/ssg';

export default function PostPage({ data, helpers: h }) {
  return html`
    <article class="post">
      <header>
        <h1>${data.title}</h1>
        <p class="meta">${h.formatDate(data.publishedAt)} · ${h.readTime(data.content)} min</p>
      </header>
      ${h.markdown(data.content)}
    </article>
  `;
}
```

`html` er en tagged template literal der **automatisk HTML-escaper interpolations** (XSS-safe by default). Ræ HTML kan tillades via en `unsafe(s)` helper for cases hvor templates eksplicit ønsker det.

**Hvorfor tagged template literals og ikke ægte JSX:**
- Ingen compiler-step, ingen Babel/SWC dependency
- Ingen JSX-runtime side effects
- Læselig for cc-sessions (som ikke skal lære en transformation)
- Performance: én pass, ingen virtual DOM
- Falder ind i tidens "minimal-deps SSG" trend (Astro container API, html-template-tag)

### Helpers API

```ts
interface SsgHelpers {
  markdown(md: string): string;
  highlight(code: string, lang: string): string;
  formatDate(iso: string, locale?: string): string;
  readTime(content: string): number;
  slug(text: string): string;
  url(doc: { id: string; slug: string; collection?: string }): string;
  image(src: string, opts?: { w?: number; h?: number; format?: 'webp' | 'jpg' | 'avif' }): string;
  svg(name: string): string;
  meta(opts: { title: string; description?: string; image?: string; canonical?: string }): string;
  jsonLd(opts: { type: 'Article' | 'BreadcrumbList' | 'Person' | 'Organization'; data: Record<string, unknown> }): string;
  unsafe(s: string): string; // bypass auto-escape (use sparingly)
  asset(path: string): string; // returns hashed path til static asset
}
```

### Routing

cms.config.ts collection får `template`-field:

```ts
{
  name: 'posts',
  template: 'templates/post.tsx',
  listTemplate: 'templates/post-list.tsx',
  urlPattern: '/blog/:slug',
  // optional: rss feed enabled
  rss: { title: 'My Blog', description: '...' },
}
```

SSG-runtime:
1. Iterér alle collections × alle docs
2. For hver doc: load template, render med `(data, helpers)`, wrap i layout, write til `deploy/{urlPath}/index.html`
3. Generer index page per collection (hvis `listTemplate` sat)
4. Generer global `sitemap.xml`, `robots.txt`, og per-collection `rss.xml`
5. Copy public/ direkte ind i deploy/ output

### Layout wrapping

Alle pages wrapped af `templates/layout.tsx`:

```tsx
export default function Layout({ children, page, site, helpers: h }) {
  return html`
    <!doctype html>
    <html lang="${site.lang ?? 'da'}">
      <head>
        <title>${page.title} · ${site.title}</title>
        ${h.meta(page.seo ?? {})}
        ${h.jsonLd(page.schema ?? {})}
      </head>
      <body>${h.unsafe(children)}</body>
    </html>
  `;
}
```

### Build trigger flow

```
User trykker rocket
  │
  ├─ templates/-dir findes?  → ja → SSG runtime
  │                            │
  │                            └─ child_process: ssg-runner --projectDir
  │                                Logs streames live til Deploy-modal
  │                                Output i deploy/
  │
  ├─ build.ts findes?         → ja → legacy custom build (uændret)
  │
  └─ ingen?                   → error: "site has no template configuration"

Efter build:
  → push deploy/ til konfigureret host (gh-pages / CF Pages / Fly static / S3)
```

### Per-site overhead

| Resource | Med templated SSG | Med build.ts pr site (i dag) |
|---|---|---|
| node_modules pr site | **0 MB** | ~50 MB |
| Build-toolchain pr site | **0 (delt af cms-admin)** | per-site install |
| Beam transport-størrelse | content + templates (~lille) | content + source + node_modules (~50 MB) |
| Build-host | **enhver cms-admin** | kun den med projektet på disken |

## Dependencies på andre F-features

- **F126 (custom build commands)**: templated SSG bliver en tredje "build provider" ved siden af `build.ts` og `build.command`. F126's switch-statement i `runSiteBuild` udvides.
- **F89 (post-build enrichment)**: refactor så SEO/JSON-LD injection bliver del af SSG runtime's `helpers.meta()` og `helpers.jsonLd()`, ikke en separat post-step.
- **F44 (media processing)**: SSG's `helpers.image()` deler `sharp`-instans med F44's media pipeline.
- **F97 (SEO module)**: outputs konsumeres direkte af helpers; ingen dobbeltarbejde.
- **Nyt build-step F142.X**: en dedikeret child_process worker for SSG renders så cms-admin's UI thread ikke blokerer. Builds queue'es med max 2-3 concurrent.

## Rollout — 5 phases

### Phase 1 — Foundation (1-2 dage)
- Add 5 deps til `packages/cms-admin/package.json`: marked, gray-matter, slugify, sharp, marked-highlight
- Implement `html` tagged template literal med auto-escape i `packages/cms-admin/src/lib/ssg/html.ts`
- Implement `helpers` runtime i `packages/cms-admin/src/lib/ssg/helpers.ts`
- Implement template-loader via jiti (samme pattern som cms.config.ts loading)
- Tests: render-isolation, escape correctness, helpers behavior

### Phase 2 — SSG core runtime (2-3 dage)
- Implement collection-iterator + doc-renderer i `packages/cms-admin/src/lib/ssg/runtime.ts`
- Implement routing (urlPattern resolution, output-path computation)
- Implement layout-wrapping
- Implement auto sitemap.xml + robots.txt + RSS pr collection
- Implement `public/` copy
- Hook into rocket button: detect `templates/` → branch til SSG runtime
- Live build-log streaming til Deploy-modal

### Phase 3 — First pilot: trail-landing (1 dag)
- Konverter trail-landing's build.ts til `templates/`-mappe (post.tsx, post-list.tsx, page.tsx, layout.tsx, ~5 components)
- Verificer at lokal output matcher det eksisterende build.ts output (diff på rendered HTML)
- Verificer at deploy fra webhouse.app virker — rocket-knappen bygger inde i cms-admin
- Slet build.ts + node_modules fra trail-landing repo

### Phase 4 — Boilerplate + AI Builder Guide (1 dag)
- Update `examples/static-boilerplate/` til templated SSG (no build.ts)
- Update `create-cms` scaffolder så nye projekter får `templates/`-mappe automatisk
- Update `packages/cms/CLAUDE.md` (AI builder guide) med templated-SSG som default
- Eksempel-templates dokumenteret i ai-guide

### Phase 5 — Optional migration tool (2 dage, kan udskydes)
- CLI: `pnpm cms migrate-to-templated <site-dir>`
- Best-effort: detekterer header/footer/post-loop patterns i build.ts, emits draft `templates/`
- Manuel review forventet — værktøjet sparer ~70% af arbejdet, ikke 100%

## Risici + afbødning

| Risiko | Sandsynlighed | Afbødning |
|---|---|---|
| Sites med eksotiske custom build behov passer ikke i SSG | Lav (audit viste 0/20) | Custom build.ts forbliver escape hatch |
| Tagged template literals giver dårlig DX vs JSX | Mellem | Mitigér med god dokumentation + helpers; tilføj senere `@webhouse/cms-ssg` typer for IntelliSense |
| Sharp dep er stor (~30 MB) | Lav | Det er én engangs-cost i cms-admin, ikke per site. Net-besparelse: enorm. |
| Build-output ændrer sig ved migration → SEO-regression | Mellem | Phase 3 inkluderer HTML-diff verifikation før migration godkendes |
| Templated SSG dækker ikke 99% efter alt | Lav-mellem | Audit viste 11/20 = 0 deps. Resten = marked. Hvis der dukker en exotic case op: legacy build.ts virker fortsat |

## Acceptance criteria (Phase 3 = first pilot done)

1. `templates/` directory pattern dokumenteret i AI Builder Guide
2. trail-landing kører på templated SSG i prod (rocket fra webhouse.app virker)
3. Lokal og remote rocket-knap producerer **identisk** HTML output
4. Ingen `build.ts` eller `node_modules` i `/data/cms-admin/beam-sites/trail/` på Fly volumen
5. Build-tid <5 sec pr deploy af trail-landing (~10 posts)

## Relateret incident

2026-05-02: trail-landing publish failed på webhouse.app med "No build.ts found". Beam-import havde transporteret content men ikke source. Hot-fix var at sftp build.ts + package.json + node_modules op til Fly volumen. **F142 er den varige løsning der gør hot-fixet permanent unødvendigt for fremtidige sites.**

## Referencer

- Hard rule i `cms/CLAUDE.md`: "Live sites are authored + deployed from a remote CMS server, NOT from localhost" (commit 6fe10112)
- Sister rule i `trail/CLAUDE.md`: "trail-landing content goes to webhouse.app, NOT localhost" (commit e192f81)
- F126 (custom build.command): den eksisterende escape-hatch som F142 koeksisterer med
- F89 (post-build enrichment): refactores som del af helpers
