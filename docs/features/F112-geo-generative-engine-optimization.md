# F112 — GEO (Generative Engine Optimization)

**Last updated:** 2026-03-28
**Status:** Draft — ready for cc implementation
**Depends on:** F89 (Post-Build Enrichment), F97 (SEO Module)

---

## Context

GEO (Generative Engine Optimization) is the practice of optimizing content so AI platforms — ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews — cite, recommend, or mention your brand when users ask questions. Research from Princeton/IIT Delhi shows GEO strategies can boost AI visibility by up to 40%.

This plan extends the existing SEO module (F97) with GEO-specific capabilities. The goal is to make @webhouse/cms the first CMS with built-in AI visibility tools — a strong differentiator and sales argument.

### What we already have (F89 + F97)

| Feature | Location | Status |
|---------|----------|--------|
| SEO Panel (editor sidebar) | `cms-admin/src/components/editor/seo-panel.tsx` | ✅ Done |
| SEO Score (13 rules, 0-100) | `cms-admin/src/lib/seo/score.ts` | ✅ Done |
| JSON-LD templates (7 types) | `cms-admin/src/lib/seo/json-ld.ts` | ✅ Done |
| JSON-LD rendered in `<head>` | `cms/src/template/builtins/layout.ts` | ✅ Done |
| AI-powered meta generation | `cms-admin/src/components/editor/seo-panel.tsx` | ✅ Done |
| AI-powered keyword rewrite | `cms-admin/src/components/editor/seo-panel.tsx` | ✅ Done |
| OG image auto-generation | `cms-admin/src/app/api/admin/seo/og-image/route.ts` | ✅ Done |
| SEO Dashboard (scores + keywords) | `cms-admin/src/app/admin/(workspace)/seo/page.tsx` | ✅ Done |
| Bulk SEO optimize (streaming) | `cms-admin/src/app/api/admin/seo/optimize-bulk/route.ts` | ✅ Done |
| Keyword tracker + density | `cms-admin/src/lib/seo/keywords.ts` | ✅ Done |
| SEO export (CSV/JSON) | `cms-admin/src/app/api/admin/seo/export/route.ts` | ✅ Done |
| SEO Agent (cms-ai) | `cms-ai/src/agents/seo.ts` | ✅ Done |
| sitemap.xml (build) | `cms/src/build/sitemap.ts` | ✅ Done |
| llms.txt (build) | `cms/src/build/llms.ts` | ✅ Done |
| ai-plugin.json (build) | `cms/src/build/ai-plugin.ts` | ✅ Done |
| Google/Social preview | `seo-panel.tsx` | ✅ Done |
| OG meta tags in `<head>` | `layout.ts` | ✅ Done |
| Canonical URL + hreflang | `layout.ts` | ✅ Done |
| Autolinks (internal linking) | `cms/src/build/autolink.ts` | ✅ Done |

---

## Phase 1 — robots.txt Generator (G01)

**Priority:** Critical — without this, AI crawlers may be blocked by default
**Size:** S (2-3 hours)
**Package:** `@webhouse/cms` (core build pipeline)

### What

Generate a smart `robots.txt` at build time with separate rules for training bots vs. search/retrieval bots. In 2026, Anthropic has 3 crawlers (ClaudeBot, Claude-SearchBot, Claude-User) and OpenAI has 3 (GPTBot, OAI-SearchBot, ChatGPT-User). Blocking the wrong one kills AI visibility.

### Files

- **New:** `packages/cms/src/build/robots.ts`
- **Edit:** `packages/cms/src/build/pipeline.ts` — add Phase 7 for robots.txt
- **Edit:** `packages/cms/src/schema/types.ts` — add `robots` config to `CmsConfig.build`

### Config schema (cms.config.ts)

```typescript
build: {
  robots: {
    // "maximum" = allow all AI crawlers (default — best for visibility)
    // "balanced" = allow search bots, block training bots
    // "restrictive" = block all AI crawlers
    // "custom" = user-defined rules
    strategy: "maximum" | "balanced" | "restrictive" | "custom",
    customRules?: string[], // raw robots.txt lines for "custom"
    disallowPaths?: string[], // paths to block for all bots (e.g. /admin/, /api/)
  }
}
```

### Generated output (strategy: "balanced" — recommended)

```
# @webhouse/cms — AI-optimized robots.txt
# Strategy: balanced (search bots allowed, training bots blocked)
# Generated: 2026-03-28

# Traditional search engines
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

# AI search/retrieval bots — ALLOW (these power AI search results)
User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: Applebot
Allow: /

# AI training bots — BLOCK (these collect data for model training)
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Meta-ExternalAgent
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: Applebot-Extended
Disallow: /

# Default
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: https://example.com/sitemap.xml
```

### Acceptance Criteria

- [ ] `robots.ts` generates correct output for all 4 strategies
- [ ] Pipeline Phase 7 writes `robots.txt` to outDir
- [ ] Sitemap URL is injected from `config.build.baseUrl`
- [ ] `disallowPaths` merges with strategy defaults
- [ ] Unit test covers all strategies
- [ ] Default strategy is `"maximum"` (most sites want max visibility)

---

## Phase 2 — GEO Score Extension (G02)

**Priority:** High — extends existing F97 score to cover AI visibility
**Size:** M (4-6 hours)
**Package:** `@webhouse/cms-admin`

### What

Extend `score.ts` with GEO-specific rules. The existing 13 rules remain (classic SEO). Add a separate GEO sub-score with 8 new rules, plus a combined "Visibility Score" that weights both.

### New rules for `score.ts`

| # | Rule | Check | Status |
|---|------|-------|--------|
| G1 | **Answer-first** | First 200 words contain a direct answer (not intro fluff). Heuristic: first paragraph ends with a statement, not a question; contains at least one fact/number. | warn/pass |
| G2 | **Question headers** | At least 30% of H2s are phrased as questions (e.g. "What is…?", "How do you…?") | warn/pass |
| G3 | **Statistics present** | Content contains at least one number/percentage/data point | warn/pass |
| G4 | **Citations/sources** | Content references at least one external source (link or attribution) | warn/pass |
| G5 | **Last updated visible** | Document has `updatedAt` or `dateModified` field, and it's < 90 days old | warn/fail |
| G6 | **JSON-LD configured** | Document has a JSON-LD template selected and populated | warn/pass |
| G7 | **Content freshness** | Document modified within last 90 days (AI has huge recency bias) | warn/fail |
| G8 | **Author attribution** | Document has author field set (E-E-A-T signal) | warn/pass |

### Score calculation

```
SEO Score:  existing 13 rules → 0-100
GEO Score:  8 new rules → 0-100
Combined:   (SEO × 0.5) + (GEO × 0.5) → "Visibility Score"
```

### UI changes to `seo-panel.tsx`

- Show two circular gauges side by side: "SEO 78" | "GEO 62"
- Combined score shown as primary number
- Checks list gets a section divider: "— SEO Checks —" and "— GEO Checks —"
- New checks have a 🤖 icon prefix to distinguish from 🔍 SEO checks

### Files

- **Edit:** `packages/cms-admin/src/lib/seo/score.ts` — add `calculateGeoScore()`, update `SeoScoreResult`
- **Edit:** `packages/cms-admin/src/components/editor/seo-panel.tsx` — dual gauge, grouped checks
- **Edit:** `packages/cms-admin/src/app/admin/(workspace)/seo/page.tsx` — show GEO column in dashboard
- **Edit:** `packages/cms-admin/src/app/api/admin/seo/route.ts` — include GEO scores in overview

### Acceptance Criteria

- [ ] All 8 GEO rules implemented with sensible thresholds
- [ ] SEO Panel shows dual score (SEO + GEO)
- [ ] SEO Dashboard table has GEO score column
- [ ] Export includes GEO scores
- [ ] Language-agnostic (works for Danish and English content)
- [ ] Recency check uses document's `updatedAt` field

---

## Phase 3 — llms-full.txt + Markdown Endpoints (G03)

**Priority:** High — extends existing llms.txt
**Size:** S (2-3 hours)
**Package:** `@webhouse/cms` (core build)

### What

1. Generate `/llms-full.txt` — full markdown content of all published documents (the "expanded" version)
2. Generate `.md` versions of every page at the same URL path + `.md` extension
3. Add `Accept: text/markdown` header support in the MCP server

### llms-full.txt format

```markdown
# Site Name

> Site description

## posts/hello-world

Title: Hello World
Published: 2026-03-15
Author: Christian Broberg

Full markdown content of the document goes here...

---

## pages/about

Title: About Us
Published: 2026-01-10

Full markdown content...

---
```

### Files

- **Edit:** `packages/cms/src/build/llms.ts` — add `generateLlmsFullTxt()`
- **Edit:** `packages/cms/src/build/pipeline.ts` — write `llms-full.txt` alongside `llms.txt`
- **New:** `packages/cms/src/build/markdown-pages.ts` — generate `.md` files for each HTML page
- **Edit:** `packages/cms/src/build/pipeline.ts` — add Phase 8 for markdown pages

### Acceptance Criteria

- [ ] `llms-full.txt` contains all published documents in clean markdown
- [ ] Each HTML page has a corresponding `.md` file (e.g. `/posts/hello-world.md`)
- [ ] llms-full.txt strips HTML from rich text fields, keeps markdown
- [ ] Documents sorted by collection then by date (newest first)
- [ ] Frontmatter included (title, date, author) but no raw `_seo` data
- [ ] Pipeline Phase 8 writes all markdown files

---

## Phase 4 — Enhanced JSON-LD (G04)

**Priority:** Medium — extends existing json-ld.ts
**Size:** S (2-3 hours)
**Package:** `@webhouse/cms-admin`

### What

Add missing schema types and `@graph`/`@id` entity linking that helps AI systems understand relationships across the site.

### New templates to add

| Template | Use case |
|----------|----------|
| **HowTo** | Step-by-step guides, tutorials |
| **BreadcrumbList** | Auto-generated from URL path (no user input needed) |
| **WebSite** | Site-level schema with SearchAction (one per site, injected on homepage) |
| **Service** | Service pages for agencies |
| **SoftwareApplication** | App/product pages |

### @graph linking

When JSON-LD is generated, wrap in a `@graph` array with `@id` references:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://webhouse.dk/#organization",
      "name": "WebHouse ApS",
      "url": "https://webhouse.dk"
    },
    {
      "@type": "Article",
      "@id": "https://webhouse.dk/posts/hello-world/#article",
      "author": { "@id": "https://webhouse.dk/#organization" },
      "publisher": { "@id": "https://webhouse.dk/#organization" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://webhouse.dk/" },
        { "@type": "ListItem", "position": 2, "name": "Posts", "item": "https://webhouse.dk/posts/" },
        { "@type": "ListItem", "position": 3, "name": "Hello World" }
      ]
    }
  ]
}
```

### Site-wide Organization schema

Add to `cms.config.ts`:

```typescript
build: {
  organization: {
    name: "WebHouse ApS",
    url: "https://webhouse.dk",
    logo: "/logo.svg",
    foundingDate: "1995",
    address: { street: "Alexander Foss Gade 13", city: "Aalborg", postalCode: "9000", country: "DK" },
    phone: "+4596303072",
    sameAs: ["https://linkedin.com/company/webhouse", "https://github.com/webhousecode"]
  }
}
```

### Files

- **Edit:** `packages/cms-admin/src/lib/seo/json-ld.ts` — add 5 new templates
- **New:** `packages/cms/src/build/json-ld-graph.ts` — @graph wrapper with BreadcrumbList auto-generation
- **Edit:** `packages/cms/src/template/builtins/layout.ts` — use @graph output
- **Edit:** `packages/cms/src/schema/types.ts` — add `organization` to build config

### Acceptance Criteria

- [ ] 5 new JSON-LD templates available in SEO Panel dropdown
- [ ] BreadcrumbList auto-generated from URL path (no user config needed)
- [ ] Organization schema injected on every page via @graph
- [ ] @id references link Article → Organization → BreadcrumbList
- [ ] Validates clean on Google Rich Results Test

---

## Phase 5 — AI Visibility Monitor (G05)

**Priority:** High — key differentiator for @webhouse/cms
**Size:** L (8-12 hours)
**Package:** `@webhouse/cms-admin` + `@webhouse/cms-ai`

### What

Automated monitoring of how a brand/site appears in AI-generated answers across ChatGPT, Claude, Perplexity, and Google AI Overviews. Runs on a schedule (via cronjobs.webhouse.net or internal scheduler), stores results, shows trends over time.

### Architecture

```
┌─────────────────────────────────────────────┐
│  AI Visibility Monitor                       │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Probe    │  │ Probe    │  │ Probe    │  │
│  │ ChatGPT  │  │ Claude   │  │ Perplxty │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │              │              │        │
│       └──────────┬───┘──────────────┘        │
│                  ▼                            │
│  ┌──────────────────────────────┐            │
│  │  Result Parser + Scorer      │            │
│  │  - brand mentioned? (y/n)    │            │
│  │  - sentiment (pos/neg/neut)  │            │
│  │  - position (1st/2nd/3rd..)  │            │
│  │  - cited with link? (y/n)    │            │
│  │  - competitor comparison     │            │
│  └──────────────┬───────────────┘            │
│                  ▼                            │
│  ┌──────────────────────────────┐            │
│  │  SQLite Store (time-series)  │            │
│  │  visibility_probes table     │            │
│  └──────────────────────────────┘            │
└─────────────────────────────────────────────┘
```

### Probe system

Each probe is a question asked to an AI platform. The admin configures:

1. **Brand queries** — questions a potential customer might ask where the brand should appear
2. **Competitor queries** — compare visibility against named competitors
3. **Category queries** — generic industry questions to monitor

Example probes for WebHouse:
- "Hvad er de bedste webbureauer i Nordjylland?"
- "Which CMS platforms have built-in AI content generation?"
- "Best IoT monitoring platforms for livestock"

### Data model

```typescript
// Stored in site's data directory as JSON (filesystem storage)
// or in SQLite (supabase storage)

interface VisibilityProbe {
  id: string;
  query: string;                    // the question asked
  category: "brand" | "competitor" | "category";
  competitors?: string[];           // brands to track in responses
  schedule: "daily" | "weekly" | "monthly";
  active: boolean;
}

interface VisibilityResult {
  id: string;
  probeId: string;
  timestamp: string;                // ISO date
  platform: "chatgpt" | "claude" | "perplexity" | "gemini";
  brandMentioned: boolean;
  brandSentiment: "positive" | "neutral" | "negative" | null;
  brandPosition: number | null;     // 1st mention, 2nd, etc.
  brandCited: boolean;              // linked as source?
  brandQuoted: boolean;             // directly quoted content?
  competitorsMentioned: string[];   // which competitors appeared
  responseExcerpt: string;          // first 500 chars of AI response
  rawResponse: string;              // full response for analysis
}

interface VisibilitySnapshot {
  date: string;
  platform: string;
  shareOfVoice: number;             // % of probes where brand appeared
  avgPosition: number;              // average mention position
  citationRate: number;             // % of appearances with source link
  sentimentScore: number;           // -1 to +1
}
```

### Implementation — Probe Runners

**Important cost note:** Christian is on Claude Max, not API. The probe runners must use the cheapest possible approach.

#### Option A — Perplexity API (recommended primary)
- Perplexity has a search API ($5/1000 queries on Sonar tier)
- Returns answers WITH citations — perfect for tracking if brand is cited
- Best signal-to-cost ratio for GEO monitoring

#### Option B — Web scraping via headless browser
- Use Playwright to query chatgpt.com, perplexity.ai, claude.ai
- Free but fragile (sites change, rate limits, captchas)
- Best as fallback, not primary

#### Option C — Anthropic API with web search tool
- Claude API + web_search tool — can check what Claude would answer
- Cost: ~$0.01/probe with Haiku
- Good for Claude-specific monitoring

#### Option D — Google Custom Search API + AI Overview detection
- Check if brand appears in Google AI Overviews
- Free tier: 100 queries/day
- Complementary to LLM probes

**Recommended stack:** Perplexity API as primary (cheapest, includes citations). Schedule via cronjobs.webhouse.net webhook endpoint. Store results as JSON files in site data directory.

### API routes

- `GET  /api/admin/geo/visibility` — dashboard data (snapshots + trends)
- `POST /api/admin/geo/visibility/probe` — CRUD for probes
- `POST /api/admin/geo/visibility/run` — manually trigger a probe run
- `GET  /api/admin/geo/visibility/history?probeId=X` — results for a probe

### Webhook for scheduled runs (cronjobs.webhouse.net)

```
POST /api/admin/geo/visibility/scheduled-run
Authorization: Bearer <site-api-key>

Runs all active probes due for execution.
```

### Admin UI — Visibility Dashboard

New page: `/admin/visibility` (or sub-tab of existing `/admin/seo`)

**KPI Cards (top row):**
- Share of Voice: 34% ↑12% — "Your brand appeared in 34% of AI answers"
- Avg Position: 2.1 — "When mentioned, you're typically the 2nd brand cited"
- Citation Rate: 18% — "18% of mentions include a link to your site"
- Sentiment: +0.6 — "AI platforms describe you positively"

**Trend Chart:**
- Line chart (Recharts) showing Share of Voice over time, per platform
- Toggleable lines: ChatGPT / Claude / Perplexity / All

**Probe Results Table:**
| Query | ChatGPT | Claude | Perplexity | Last Run |
|-------|---------|--------|------------|----------|
| "bedste webbureauer nordjylland" | ✅ #2 | ❌ | ✅ #1 🔗 | 2h ago |
| "CMS with AI content" | ❌ | ✅ #3 | ✅ #2 🔗 | 2h ago |

**Competitor Comparison:**
- Bar chart showing Share of Voice: Your Brand vs Competitor A vs Competitor B

### Files

- **New:** `packages/cms-admin/src/app/admin/(workspace)/visibility/page.tsx`
- **New:** `packages/cms-admin/src/app/api/admin/geo/visibility/route.ts`
- **New:** `packages/cms-admin/src/app/api/admin/geo/visibility/probe/route.ts`
- **New:** `packages/cms-admin/src/app/api/admin/geo/visibility/run/route.ts`
- **New:** `packages/cms-admin/src/app/api/admin/geo/visibility/scheduled-run/route.ts`
- **New:** `packages/cms-admin/src/app/api/admin/geo/visibility/history/route.ts`
- **New:** `packages/cms-admin/src/lib/geo/visibility-store.ts` — read/write results
- **New:** `packages/cms-admin/src/lib/geo/probe-runner.ts` — execute probes
- **New:** `packages/cms-admin/src/lib/geo/result-parser.ts` — parse AI responses for brand mentions
- **New:** `packages/cms-admin/src/components/geo/visibility-chart.tsx` — Recharts trends
- **New:** `packages/cms-admin/src/components/geo/probe-table.tsx`
- **New:** `packages/cms-admin/src/components/geo/competitor-chart.tsx`
- **Edit:** `packages/cms-admin/src/components/sidebar.tsx` — add Visibility nav item

### Acceptance Criteria

- [ ] Probe CRUD (add/edit/remove/toggle probes)
- [ ] At least one probe runner working (Perplexity API recommended)
- [ ] Results stored per-site in filesystem/SQLite
- [ ] Dashboard shows KPI cards + trend chart + probe table
- [ ] Competitor comparison chart working
- [ ] Scheduled run endpoint callable from cronjobs.webhouse.net
- [ ] Manual "Run now" button per probe
- [ ] Response parser handles Danish and English
- [ ] Cost estimate shown before running probes

---

## Phase 6 — Search Index Checker (G06)

**Priority:** High — complementary to Visibility Monitor
**Size:** M (6-8 hours)
**Package:** `@webhouse/cms-admin`

### What

Check whether the site/brand exists in the indexes of major search engines AND AI platforms. Different from G05 (which checks if AI *cites* you in answers) — this checks if AI *knows about* you at all.

### Checks to perform

| Check | Method | What it tells you |
|-------|--------|-------------------|
| **Google indexed** | Google Custom Search API or `site:domain.com` | Are your pages in Google's index? |
| **Bing indexed** | Bing Web Search API | Are your pages in Bing (feeds Copilot)? |
| **robots.txt audit** | Fetch `domain.com/robots.txt`, parse rules | Are you blocking AI crawlers? |
| **llms.txt present** | Fetch `domain.com/llms.txt` | Do you have AI discovery file? |
| **ai-plugin.json present** | Fetch `domain.com/.well-known/ai-plugin.json` | Do you have plugin manifest? |
| **sitemap.xml valid** | Fetch + validate | Can crawlers find all pages? |
| **Schema markup detected** | Parse pages for JSON-LD | Is structured data present? |
| **SSL/HTTPS** | Check protocol | AI systems prefer HTTPS |
| **Page speed** | Lighthouse or simple TTFB check | AI crawlers timeout at 1-5 seconds |
| **Core Web Vitals** | CrUX API (free) | Google AI Overviews factor |
| **AI crawler log analysis** | Parse server logs for AI user-agents | Which bots actually visit? |
| **Brand entity in Knowledge Graph** | Google Knowledge Graph API (free) | Does Google "know" you as an entity? |

### Bonus: LLM Brand Recall Test

Ask each major LLM a simple identity question and grade the response:

```
Probe: "What is WebHouse ApS?"

Scoring:
- ✅ Correct: knows it's a Danish web agency, founded 1995
- ⚠️ Partial: knows it exists but details are wrong/incomplete
- ❌ Unknown: "I don't have information about WebHouse ApS"
- 🔴 Wrong: confuses with another entity
```

This is incredibly valuable feedback — if Claude doesn't know you, your GEO strategy needs work.

### Data model

```typescript
interface IndexCheckResult {
  id: string;
  timestamp: string;
  domain: string;

  // Search engine indexing
  googleIndexed: { count: number; lastCrawled?: string } | null;
  bingIndexed: { count: number } | null;

  // AI readiness
  robotsTxt: {
    exists: boolean;
    aiCrawlersAllowed: string[];    // e.g. ["GPTBot", "ClaudeBot"]
    aiCrawlersBlocked: string[];
    issues: string[];               // e.g. "Blocking Claude-SearchBot"
  };
  llmsTxt: { exists: boolean; documentCount: number } | null;
  aiPlugin: { exists: boolean; mcpEndpoint?: string } | null;
  sitemapXml: { exists: boolean; urlCount: number; errors: string[] } | null;
  schemaMarkup: {
    pagesWithSchema: number;
    totalPages: number;
    typesFound: string[];           // e.g. ["Article", "Organization"]
  };

  // Performance
  httpsEnabled: boolean;
  ttfbMs: number | null;

  // LLM Brand Recall
  brandRecall: {
    chatgpt: "correct" | "partial" | "unknown" | "wrong";
    claude: "correct" | "partial" | "unknown" | "wrong";
    perplexity: "correct" | "partial" | "unknown" | "wrong";
    gemini: "correct" | "partial" | "unknown" | "wrong";
  } | null;

  // Overall readiness score
  readinessScore: number;           // 0-100
  recommendations: string[];       // actionable items
}
```

### Admin UI — Index Health page

New page: `/admin/index-health` (or sub-tab of Visibility)

**Health Score Card:**
Big circular gauge: "AI Readiness: 72/100"

**Checklist View:**
```
✅ Google: 47 pages indexed
✅ Bing: 43 pages indexed
✅ HTTPS enabled
✅ sitemap.xml: 52 URLs, valid
✅ llms.txt: present, 20 documents listed
✅ ai-plugin.json: present, MCP endpoint configured
⚠️ robots.txt: blocking ClaudeBot (training OK, but check Claude-SearchBot)
⚠️ Schema: 12/47 pages have JSON-LD (25%)
⚠️ Page speed: TTFB 890ms (AI crawlers timeout at 1-5s)
❌ Brand recall: Claude says "I don't have information" — needs more web presence
❌ Google Knowledge Graph: no entity found
```

**Recommendations Panel:**
Actionable cards with "Fix this" buttons where possible:
- "Allow Claude-SearchBot in robots.txt" → link to robots config
- "Add JSON-LD to 35 more pages" → link to bulk SEO optimize
- "Create Google Business Profile" → external link + instructions

### Files

- **New:** `packages/cms-admin/src/app/admin/(workspace)/index-health/page.tsx`
- **New:** `packages/cms-admin/src/app/api/admin/geo/index-check/route.ts`
- **New:** `packages/cms-admin/src/lib/geo/index-checker.ts` — orchestrates all checks
- **New:** `packages/cms-admin/src/lib/geo/crawlers.ts` — known AI crawler user-agents + classification
- **New:** `packages/cms-admin/src/components/geo/health-gauge.tsx`
- **New:** `packages/cms-admin/src/components/geo/checklist-card.tsx`
- **New:** `packages/cms-admin/src/components/geo/recommendations.tsx`
- **Edit:** `packages/cms-admin/src/components/sidebar.tsx` — add nav item

### Acceptance Criteria

- [ ] All non-API checks work without external keys (robots.txt, llms.txt, sitemap, HTTPS, TTFB)
- [ ] Google Custom Search works if API key is configured (optional)
- [ ] robots.txt parser correctly identifies all known AI crawlers
- [ ] Brand recall test works for at least one LLM (Perplexity recommended)
- [ ] Readiness score calculated from weighted checklist
- [ ] Recommendations are specific and actionable
- [ ] Results cached (don't re-run every page load)
- [ ] Manual "Re-scan" button
- [ ] Scheduled weekly re-scan option via cronjobs

---

## Phase 7 — GEO Agent (G07)

**Priority:** Medium — extends existing agent system
**Size:** S (3-4 hours)
**Package:** `@webhouse/cms-ai` + `@webhouse/cms-admin`

### What

Add a "GEO Optimizer" agent alongside the existing SEO Optimizer agent. The GEO agent rewrites content to be more citation-friendly for AI systems, without destroying the human reading experience.

### Agent behavior

The GEO agent performs these transformations:

1. **Answer-first restructure** — moves the key answer/thesis to the first paragraph
2. **Question-header conversion** — rewrites suitable H2s as questions matching search queries
3. **Statistics injection** — suggests where to add specific data points
4. **Source citation** — adds relevant source attributions
5. **Author attribution** — ensures author info is complete
6. **Freshness update** — updates "last modified" timestamps and refreshes stale references

### Agent config (seeds alongside existing agents)

```typescript
{
  id: "geo-optimizer",
  name: "GEO Optimizer",
  role: "geo",
  systemPrompt: `You are a Generative Engine Optimization specialist. Your job is to restructure content so AI platforms (ChatGPT, Claude, Perplexity) are more likely to cite it in answers. Rules:
  
1. The first 200 words MUST directly answer the page's primary question
2. Convert H2 headings to questions that match how users ask AI
3. Add specific statistics, numbers, and data points where possible
4. Cite sources with proper attribution
5. Keep the content natural and readable — no keyword stuffing
6. Preserve the original tone and brand voice
7. Add a "Last updated: YYYY-MM-DD" line if missing`,
  behavior: { temperature: 30, formality: 60, verbosity: 50 },
  tools: { webSearch: true, internalDatabase: true },
  autonomy: "draft",
  targetCollections: [],
  schedule: { enabled: false, frequency: "weekly", time: "09:00", maxPerRun: 5 },
  active: true,
}
```

### Files

- **New:** `packages/cms-ai/src/agents/geo.ts` — GeoAgent class
- **Edit:** `packages/cms-admin/src/lib/agents.ts` — add geo-optimizer to DEFAULT_AGENTS
- **Edit:** `packages/cms-admin/src/lib/ai-prompts.ts` — add GEO-specific prompts

### Acceptance Criteria

- [ ] GEO agent appears in agent list alongside SEO Optimizer
- [ ] Can be run manually on a document from the editor
- [ ] Can be scheduled (weekly recommended for content freshness)
- [ ] Produces a diff/draft (respects AI Lock fields)
- [ ] Works for both Danish and English content

---

## Phase 8 — Admin Settings Panel (G08)

**Priority:** Medium — config UI for G01-G07
**Size:** S (2-3 hours)
**Package:** `@webhouse/cms-admin`

### What

A settings panel under admin settings where users configure:

1. **robots.txt strategy** — dropdown: maximum / balanced / restrictive / custom
2. **Organization schema** — company name, address, logo, social links
3. **AI Visibility API keys** — Perplexity API key, Google Custom Search key (optional)
4. **Probe defaults** — default schedule, max probes per run
5. **GEO scoring weights** — toggle individual GEO rules on/off

### Files

- **New:** `packages/cms-admin/src/components/settings/geo-settings-panel.tsx`
- **Edit:** `packages/cms-admin/src/components/settings/` — add tab/section

### Acceptance Criteria

- [ ] All GEO config editable from admin UI
- [ ] Settings persist to site config
- [ ] API keys stored securely (not in git — env vars or encrypted storage)
- [ ] Preview robots.txt output in settings panel

---

## Implementation Order

```
Phase 1 (G01) robots.txt Generator        [S]  ← do first, biggest quick-win
Phase 3 (G03) llms-full.txt + Markdown     [S]  ← easy, extends existing
Phase 2 (G02) GEO Score Extension          [M]  ← extends existing score.ts
Phase 4 (G04) Enhanced JSON-LD             [S]  ← extends existing json-ld.ts
Phase 7 (G07) GEO Agent                    [S]  ← extends existing agent system
Phase 8 (G08) Admin Settings Panel         [S]  ← config UI
Phase 6 (G06) Search Index Checker         [M]  ← new module, moderate complexity
Phase 5 (G05) AI Visibility Monitor        [L]  ← largest, most complex, most value
```

**Estimated total:** 30-45 hours of cc work

---

## For webhouse.dk Specifically (Immediate Actions)

While the CMS features are being built, do these NOW for webhouse.dk:

1. **Check robots.txt** — verify AI crawlers are not blocked
2. **Create Google Business Profile** if not already done
3. **Post on LinkedIn regularly** — unlinked brand mentions help AI visibility
4. **Publish case studies with statistics** — "1000+ websites since 1995" on public pages
5. **Get mentioned on external sites** — GitHub, directories, partner pages
6. **Add author info** to all blog posts with credentials
7. **Update cornerstone content** — anything older than 90 days needs a refresh
8. **Monitor with KIME or similar** while building our own G05/G06 tools
