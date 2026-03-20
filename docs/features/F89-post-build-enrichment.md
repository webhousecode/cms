# F89 — Post-Build Enrichment

> CMS-level post-processing of dist/ that injects SEO, favicon, manifest, sitemap, robots.txt, llms.txt, structured data, and AI discoverability — regardless of what the site builder produced.

## Problem

Static sites built by `build.ts` (whether hand-written or AI-generated) have minimal `<head>` markup: just charset, viewport, title, description. They're missing OpenGraph tags, JSON-LD structured data, canonical URLs, favicons, manifests, robots.txt, and AI discoverability files. CMS core already generates `sitemap.xml`, `llms.txt`, and `ai-plugin.json` in the build pipeline — but the static site templates don't use them.

The result: sites rank poorly on Google, look bad when shared on social media, and are invisible to AI agents.

This is the CMS's responsibility — not the user's or the AI builder's. Every site published through WebHouse should be SEO-optimized and AI-discoverable by default.

## Solution

Add a post-build enrichment step to the deploy service that runs after `build.ts` but before pushing to GitHub Pages. It processes every HTML file in `dist/`, injects missing metadata, and generates auxiliary files. Uses content from `globals/site.json` and per-document data to build rich metadata. No manual configuration needed — it "just works."

## Technical Design

### Post-Build Enrichment Module

```typescript
// packages/cms-admin/src/lib/post-build-enrich.ts

export interface EnrichmentConfig {
  baseUrl: string;         // e.g. "https://boutique.webhouse.app"
  basePath: string;        // e.g. "" or "/boutique-site"
  siteName: string;        // from globals/site.json
  siteDescription: string; // from globals/site.json or tagline
  siteImage?: string;      // OG default image
  favicon?: string;        // URL or path to favicon
  themeColor?: string;     // for manifest + meta
  lang?: string;           // default "en"
  generator?: string;      // "webhouse.app"
}

export async function enrichDist(distDir: string, config: EnrichmentConfig): Promise<void>;
```

### What It Does

#### 1. HTML Head Injection (every `.html` file in dist/)

For each HTML file, parse `<head>` and inject/upgrade:

- **`<meta name="generator">`** — `webhouse.app`
- **`<link rel="canonical">`** — `baseUrl + path`
- **OpenGraph tags** (if missing):
  - `og:title` — from `<title>` or `siteName`
  - `og:description` — from `<meta name="description">` or `siteDescription`
  - `og:image` — from first `<img>` on page or `siteImage`
  - `og:url` — canonical URL
  - `og:type` — `website` (homepage) or `article` (subpages)
  - `og:site_name` — `siteName`
- **Twitter Card** — `twitter:card=summary_large_image`, mirrors OG tags
- **Favicon links** (if missing):
  - `<link rel="icon" href="/favicon.ico">`
  - `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`
- **Manifest** — `<link rel="manifest" href="/manifest.json">`
- **Theme color** — `<meta name="theme-color" content="#...">`

Rules:
- **Never overwrite** existing tags — only inject if missing
- Use regex-based injection (no DOM parser needed for simple head injection)
- Insert before `</head>`

#### 2. JSON-LD Structured Data

Inject a `<script type="application/ld+json">` block before `</body>`:

- **Homepage** → `Organization` schema with name, url, logo, description
- **Product pages** (if collection has `price` field) → `Product` schema
- **Article/post pages** → `Article` schema with author, datePublished, image
- **Other pages** → `WebPage` schema

Detection: infer page type from URL path and content fields.

#### 3. Generated Files (in dist/ root)

| File | Content | Source |
|------|---------|--------|
| `favicon.ico` | Site favicon | Copy from project root or generate placeholder |
| `manifest.json` | PWA manifest | siteName, themeColor, icons |
| `robots.txt` | Crawl directives | Allow all, sitemap ref |
| `sitemap.xml` | URL list with lastmod | Scan all `.html` files in dist/ |
| `llms.txt` | AI content index | Site name, description, page list with summaries |
| `.well-known/ai-plugin.json` | AI plugin manifest | Site metadata |

### Integration Point

In `deploy-service.ts`, after `execSync("npx tsx build.ts")` and before `collectFiles(distDir)`:

```typescript
// After build, before collect
const { enrichDist } = await import("./post-build-enrich");
await enrichDist(distDir, {
  baseUrl: customDomain ? `https://${customDomain}` : `https://${repo.split("/")[0]}.github.io/${repo.split("/")[1]}`,
  basePath,
  siteName: siteSettings?.data?.siteName ?? siteEntry.name,
  siteDescription: siteSettings?.data?.tagline ?? siteSettings?.data?.siteDescription ?? "",
  siteImage: siteSettings?.data?.heroImage ?? siteSettings?.data?.ogImage,
  themeColor: siteSettings?.data?.themeColor ?? "#000000",
  lang: siteSettings?.data?.lang ?? "en",
});
```

### Reading Site Content

The enrichment module reads `globals/site.json` directly from the project's `content/` directory to extract site-level metadata. No API calls needed — it's a file read.

## Impact Analysis

### Files affected

| Action | File |
|--------|------|
| **Create** | `packages/cms-admin/src/lib/post-build-enrich.ts` |
| **Modify** | `packages/cms-admin/src/lib/deploy-service.ts` — add enrichDist() call after build |

### Downstream dependents

`packages/cms-admin/src/lib/deploy-service.ts` is imported by:
- `packages/cms-admin/src/app/api/admin/deploy/route.ts` (2 refs) — unaffected, calls triggerDeploy()
- `packages/cms-admin/src/app/api/cms/[collection]/[slug]/route.ts` (1 ref) — unaffected, calls triggerDeploy()

### Blast radius

- **Low risk** — post-build enrichment is additive only (never removes content)
- **Never overwrites** existing tags — only injects if missing
- Deploy timing: enrichment adds ~100ms to build, negligible vs 7s deploy
- No API changes, no config format changes, no UI changes

### Breaking changes

None. Pure additive post-processing.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Build boutique locally, verify `<head>` has OG tags, canonical, favicon, manifest link
- [ ] Deploy boutique, verify `robots.txt` exists at root
- [ ] Deploy boutique, verify `sitemap.xml` lists all pages
- [ ] Deploy boutique, verify `llms.txt` has page summaries
- [ ] Share deployed URL on Discord/Slack — preview card shows title, description, image
- [ ] Google Rich Results Test — verify JSON-LD schema is valid
- [ ] Existing tags NOT overwritten: add custom OG title in build.ts, verify enrichment preserves it
- [ ] Regression: deploy still succeeds for GitHub-backed sites (SproutLake)

## Implementation Steps

1. Create `post-build-enrich.ts` with `enrichDist()` function
2. Implement HTML head scanner (regex: find existing meta/link tags)
3. Implement head injection (OG, Twitter, favicon, manifest, canonical, theme-color, generator)
4. Implement JSON-LD generation (Organization, Product, Article, WebPage)
5. Implement file generators (robots.txt, sitemap.xml, llms.txt, ai-plugin.json, manifest.json)
6. Wire into `deploy-service.ts` — call enrichDist() after build, before collectFiles
7. Read `globals/site.json` for site-level metadata
8. Test with boutique site end-to-end
9. Verify social media preview cards work
10. Update `packages/cms/CLAUDE.md` with enrichment documentation

## Dependencies

- **F12 One-Click Deploy** (done) — enrichment hooks into the deploy pipeline

## Effort Estimate

**Medium** — 2-3 days. Core logic is straightforward string processing. Most time goes to getting JSON-LD schemas right and testing social media previews.
