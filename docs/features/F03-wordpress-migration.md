# F03 — WordPress Migration (Content + Design)

> Extract both content AND design from any WordPress site — AI-powered design reverse engineering, REST API content extraction, and guided migration wizard.

## Problem

WordPress is the #1 migration source. Current F03 only covered content (posts, pages, media). But customers also need their **design** migrated — colors, fonts, spacing, layout structure. Today that means a designer manually recreating the look in Tailwind/CSS. With AI + design token extraction, we can automate 80% of it.

## Solution

A 3-phase migration pipeline:

1. **Probe** — given just a URL, detect what the site has (REST API availability, page builder, theme, content counts, design tokens)
2. **Extract Content** — paginate REST API for all posts/pages/media/taxonomies, with HTML scraping fallback for page builder sites
3. **Extract Design** — Dembrandt for design tokens, Playwright for screenshots, AI for Tailwind config generation

Output: `cms.config.ts` + `content/*.json` + `public/uploads/*` + `tailwind.config.ts` + design tokens — a complete webhouse.app site ready to run.

## Research: Extraction Approach Tiers

| Tier | What's needed | Content coverage | Design coverage |
|------|---------------|-----------------|-----------------|
| **1: URL only** | Just the URL | Posts, pages, media, categories, tags via REST API (~80%) | Full via Dembrandt + screenshots |
| **2: XML export** | Site owner exports WXR file | All content + menus, comments, custom fields, drafts (~90%) | Same as Tier 1 |
| **3: App Password** | Site owner creates Application Password | Everything incl. ACF fields, settings, customizer (~98%) | Same + theme metadata |
| **4: FTP/SSH** | Server access | 100% incl. PHP templates, database | 100% incl. theme files |

**REST API is enabled on ~90% of WP sites** (default since WP 4.7, Dec 2016).

### Page Builder Impact

| Builder | REST API | Extraction |
|---------|----------|------------|
| **Gutenberg** (blocks) | Clean HTML in `content.rendered` | Easy |
| **Classic Editor** | Clean HTML | Easy |
| **Elementor** | Usually renders HTML server-side | Medium — fallback to HTML scraping |
| **Divi/WPBakery** | Shortcodes leak as raw text | Hard — **must** scrape rendered HTML instead |

## Technical Design

### Phase 1 — Probe (URL only, ~5 seconds)

```typescript
// packages/cms-admin/src/lib/wp-migration/probe.ts

export interface WpProbeResult {
  url: string;
  restApiAvailable: boolean;
  restApiUrl: string;                    // e.g. "/wp-json/wp/v2"
  wordpressVersion?: string;
  theme: { name: string; slug: string; screenshot?: string };
  pageBuilder: "gutenberg" | "elementor" | "divi" | "wpbakery" | "beaver" | "none";
  contentCounts: {
    posts: number;
    pages: number;
    media: number;
    categories: number;
    tags: number;
    customPostTypes: string[];
  };
  designTokens: DesignTokens;           // from Dembrandt
  screenshots: {
    home: string;                        // path to screenshot
    singlePost?: string;
    archive?: string;
    page?: string;
  };
}

export async function probeWpSite(url: string): Promise<WpProbeResult> {
  // 1. Hit /wp-json/ to check REST API
  // 2. Detect theme from HTML source (wp-content/themes/{name}/)
  // 3. Detect page builder from HTML classes (.elementor-*, .et_pb_*, .vc_*)
  // 4. Count content via REST API headers (X-WP-Total)
  // 5. Run Dembrandt for design tokens
  // 6. Screenshot key page types with Playwright
}
```

### Phase 2 — Content Extraction

```typescript
// packages/cms-admin/src/lib/wp-migration/extract-content.ts

export interface WpContentExtractor {
  /** Paginate all posts/pages/CPTs from REST API */
  extractFromApi(config: WpApiConfig): AsyncGenerator<WpDocument>;

  /** Parse WXR XML export file */
  extractFromXml(filePath: string): AsyncGenerator<WpDocument>;

  /** Scrape rendered HTML as fallback (Divi/WPBakery) */
  extractFromHtml(urls: string[]): AsyncGenerator<WpDocument>;
}

export interface WpDocument {
  type: "post" | "page" | "custom";
  slug: string;
  title: string;
  content: string;                // HTML (rendered)
  excerpt?: string;
  date: string;
  modified: string;
  status: "publish" | "draft" | "private";
  author?: { name: string; email?: string };
  categories?: string[];
  tags?: string[];
  featuredImage?: string;         // URL to download
  customFields?: Record<string, unknown>;  // ACF, meta
  wpUrl: string;                  // original WP URL (for redirect map)
}
```

**REST API pagination:**
```typescript
async function* paginateWpApi(endpoint: string, auth?: string) {
  let page = 1;
  while (true) {
    const res = await fetch(`${endpoint}?per_page=100&page=${page}`, {
      headers: auth ? { Authorization: `Basic ${btoa(auth)}` } : {},
    });
    if (!res.ok) break;
    const items = await res.json();
    if (items.length === 0) break;
    for (const item of items) yield item;
    const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1");
    if (page >= totalPages) break;
    page++;
  }
}
```

**Gutenberg block transformation:**
```typescript
// packages/cms-admin/src/lib/wp-migration/block-transform.ts

// wp:paragraph → <p>
// wp:heading → <h2>
// wp:image → <img> with local path (after media download)
// wp:list → <ul>/<ol>
// wp:code → <pre><code>
// wp:quote → <blockquote>
// Complex/unknown blocks → raw HTML preserved
```

**Media download:**
```typescript
async function downloadMedia(mediaItems: WpMediaItem[], uploadDir: string) {
  // Download all from /wp-content/uploads/
  // Rewrite URLs in content: https://old-site.com/wp-content/uploads/2024/03/photo.jpg
  //                        → /uploads/photo-a1b2.jpg
}
```

### Phase 3 — Design Extraction

```typescript
// packages/cms-admin/src/lib/wp-migration/extract-design.ts

export interface DesignTokens {
  colors: Array<{ name: string; value: string; usage: string }>;
  fonts: Array<{ family: string; weights: number[]; source: string }>;
  spacing: number[];              // detected scale, e.g. [4, 8, 12, 16, 24, 32, 48]
  borderRadius: number[];
  shadows: string[];
  breakpoints: Record<string, number>;
}

export interface DesignExtractionResult {
  tokens: DesignTokens;
  tailwindConfig: string;         // AI-generated tailwind.config.ts
  cssVariables: string;           // AI-generated CSS custom properties
  layoutDescription: string;      // AI-generated description of site layout
  screenshots: Record<string, string>;  // pageType → screenshot path
}

export async function extractDesign(url: string): Promise<DesignExtractionResult> {
  // 1. Run Dembrandt → design tokens (colors, fonts, spacing, shadows)
  // 2. Screenshot key pages with Playwright (home, post, archive, page)
  // 3. Feed tokens + screenshots to AI:
  //    "Generate Tailwind config from these design tokens and screenshots"
  // 4. Return tokens + AI-generated config + screenshots
}
```

**Dembrandt integration:**
```bash
npx dembrandt https://example.com --json-only --dtcg
```

Output: W3C Design Tokens Community Group format — machine-readable JSON with colors, fonts, spacing, etc.

**AI design reverse engineering (via CMS AI agent):**
```typescript
const prompt = `Given these design tokens extracted from a WordPress site:
${JSON.stringify(tokens, null, 2)}

And these screenshots of the site layout: [attached]

Generate:
1. A tailwind.config.ts with color palette, font families, spacing scale
2. CSS custom properties for the design system
3. A description of the site layout (header, hero, content, sidebar, footer)

Use the brand colors from the tokens. Map to Tailwind's naming convention.`;
```

### Phase 4 — Migration Wizard UI

4-step wizard at `/admin/tools?tab=wp-migrate`:

```
Step 1: Connect
┌─────────────────────────────────────────────────┐
│ WordPress Migration                              │
│                                                  │
│ Enter WordPress site URL:                        │
│ [https://old-site.com              ] [Probe →]  │
│                                                  │
│ Or upload WXR export file:                       │
│ [Choose file...]                                 │
│                                                  │
│ Optional: Authentication                         │
│ Username: [________________]                     │
│ App Password: [●●●●●●●●●●●]                    │
└─────────────────────────────────────────────────┘

Step 2: Review (after probe)
┌─────────────────────────────────────────────────┐
│ Site Analysis                                    │
│                                                  │
│ Theme: flavor-flavor   Builder: Elementor        │
│ REST API: ✅ Available                           │
│                                                  │
│ CONTENT                     DESIGN               │
│ ☑ 47 Posts → posts         Colors: 8 detected    │
│ ☑ 12 Pages → pages         Fonts: Inter, Merri   │
│ ☑ 156 Media files          Spacing: 4px scale    │
│ ☑ 8 Categories             Layout: header, hero,  │
│ ☑ 23 Tags                  sidebar, footer       │
│ ☐ 3 Custom Post Types      [Preview design →]    │
│                                                  │
│ [← Back]                    [Start migration →]  │
└─────────────────────────────────────────────────┘

Step 3: Progress
┌─────────────────────────────────────────────────┐
│ Migrating...                                     │
│                                                  │
│ Content:  ████████████████░░░░ 38/47 posts       │
│ Media:    ████████░░░░░░░░░░░ 62/156 files       │
│ Design:   ████████████████████ Complete           │
│                                                  │
│ ⚡ Extracting design tokens...                   │
│ ⚡ Generating Tailwind config via AI...          │
│ ✅ 38 posts imported                             │
│ ⚠️ 2 posts had Divi shortcodes (HTML fallback)   │
└─────────────────────────────────────────────────┘

Step 4: Done
┌─────────────────────────────────────────────────┐
│ Migration Complete ✅                            │
│                                                  │
│ 47 posts, 12 pages, 156 media files imported     │
│ Design tokens + Tailwind config generated        │
│                                                  │
│ [Download redirect map (JSON)]                   │
│ [Download Tailwind config]                       │
│ [View imported content →]                        │
└─────────────────────────────────────────────────┘
```

### Output Files

```
content/
  posts/
    my-first-post.json
    ...
  pages/
    about.json
    ...
public/uploads/
  photo-a1b2.jpg
  ...
_data/
  wp-migration/
    probe-result.json
    redirect-map.json        # old WP URLs → new CMS URLs
    design-tokens.json       # Dembrandt output
    tailwind-config.ts       # AI-generated
    screenshots/
      home.png
      single-post.png
      archive.png
```

### API Endpoints

```
POST /api/admin/wp-migrate/probe         → probe site (URL only, fast)
POST /api/admin/wp-migrate/start         → begin full migration
GET  /api/admin/wp-migrate/status/[id]   → SSE progress stream
POST /api/admin/wp-migrate/upload-wxr    → upload WXR XML file
GET  /api/admin/wp-migrate/result/[id]   → get migration results + downloads
```

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/wp-migration/probe.ts` — **new** site probe
- `packages/cms-admin/src/lib/wp-migration/extract-content.ts` — **new** content extractor
- `packages/cms-admin/src/lib/wp-migration/extract-design.ts` — **new** design extractor
- `packages/cms-admin/src/lib/wp-migration/block-transform.ts` — **new** Gutenberg parser
- `packages/cms-admin/src/app/api/admin/wp-migrate/` — **new** API routes
- `packages/cms-admin/src/app/admin/(workspace)/tools/` — **modified** (add WP Migration tab)
- `packages/cms-admin/package.json` — add `fast-xml-parser`, `dembrandt`

### Downstream dependents

Tools page (`admin/tools/`) — gains new tab, no breaking changes to existing Link Checker tab.

### Blast radius
- Dembrandt requires Playwright (already a dev dependency)
- Batch document creation could overwhelm filesystem on large WP sites (1000+ posts)
- Media download could fill disk — need disk space check before starting
- AI design generation uses AI tokens — show estimated cost before starting

### Breaking changes
- None — entirely new system

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Probe detects REST API on a test WP site
- [ ] Probe detects page builder (Elementor, Gutenberg)
- [ ] Dembrandt extracts design tokens from WP site
- [ ] REST API pagination fetches all posts (>100)
- [ ] Gutenberg blocks transform to clean HTML
- [ ] Media files downloaded and URLs rewritten
- [ ] WXR XML parser extracts posts, pages, menus
- [ ] HTML scraping fallback works for Divi/WPBakery
- [ ] AI generates valid Tailwind config from tokens
- [ ] Redirect map correctly maps old→new URLs
- [ ] Wizard UI shows progress via SSE

## Implementation Steps

### Phase 1 — Probe + Content (days 1-4)
1. Create `wp-migration/probe.ts` — REST API detection, theme/builder detection, content counts
2. Create `wp-migration/block-transform.ts` — Gutenberg block → HTML/Markdown
3. Create `wp-migration/extract-content.ts` — REST API paginator + WXR parser + HTML scraper
4. Create media downloader with URL rewriting
5. Create API routes (probe, start, status SSE)
6. Build redirect map generator (old WP URLs → new CMS slugs)

### Phase 2 — Design Extraction (days 4-6)
7. Integrate Dembrandt for design token extraction
8. Add Playwright screenshots of key page types
9. Create AI prompt for Tailwind config generation from tokens + screenshots
10. Build `extract-design.ts` pipeline (Dembrandt → screenshots → AI → config)

### Phase 3 — Wizard UI (days 6-8)
11. Build 4-step wizard in Tools → WP Migration tab
12. Step 1: URL input + WXR upload + optional auth
13. Step 2: Probe results with content/design preview
14. Step 3: SSE-driven progress (content + media + design)
15. Step 4: Results with download links (redirects, Tailwind config)

## Dependencies

- F02 (Import Engine) — shares batch import pattern, can build independently
- `fast-xml-parser` — WXR XML parsing
- `dembrandt` — design token extraction (uses Playwright internally)
- Playwright — already a dev dependency
- AI provider — for design reverse engineering (Tailwind config generation)

## Effort Estimate

**Large** — 7-8 days

- Days 1-4: Probe + content extraction (REST API, WXR, block transform, media)
- Days 4-6: Design extraction (Dembrandt, screenshots, AI Tailwind generation)
- Days 6-8: Wizard UI + SSE progress + testing against real WP sites
