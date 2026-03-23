# F98 — Performance Audit (Lighthouse)

> Løbende Lighthouse-scanning af sites fra CMS admin — dashboard med score-historik, scheduled scans, per-page audits med opportunities.

## Problem

Der er ingen måde at se om et site performer godt. Redaktøren deployer content og håber det bedste. Problemer (langsom LCP, dårlig accessibility, manglende SEO tags) opdages først når Google Search Console klager — uger senere.

Vi har brug for:
1. **Løbende scores** synlige på Dashboard — Performance, Accessibility, SEO, Best Practices
2. **Historik** — kan vi se om sitet forbedres over tid?
3. **Per-page audit** — hvilke sider er langsomme, og hvad kan forbedres?
4. **Alerts** — besked når en score falder under threshold

## Solution

Dual-engine Lighthouse audit:

1. **PageSpeed Insights API** (production) — cloud-baseret, ingen dependencies, gratis 25K/dag. Kører mod deployed sites.
2. **npm `lighthouse` + Playwright Chromium** (development) — lokale scans mod localhost, fuld kontrol, ingen rate limits. Kun tilgængelig når Playwright er installeret (dev).

Scores gemmes i `_data/lighthouse/` med historik. Dashboard widget viser aktuelle scores + trend-graf. Scheduler kører ugentlige scans automatisk.

## Research: Engine Comparison

| | PSI API (cloud) | npm lighthouse (local) |
|---|---|---|
| **Kræver Chrome** | Nej | Ja (Playwright's Chromium) |
| **Kan scanne localhost** | Nej | Ja |
| **Production-ready** | Ja | Kun i dev (`@playwright/test` er devDependency) |
| **Gratis** | 25.000 req/dag | Ubegrænset |
| **Latency** | 10-30 sek | 15-30 sek |
| **npm packages** | Ingen (bare `fetch`) | `lighthouse` (~50 MB) |
| **Data** | Scores + audits + CrUX field data | Scores + audits (ingen field data) |

**Strategi:** PSI API som primary (virker overalt, ingen deps). Lighthouse npm som optional fallback (development, localhost scans). Auto-detect: hvis `lighthouse` og Chromium er tilgængelige, brug dem; ellers PSI API.

## Technical Design

### 1. Audit Engine Interface

```typescript
// packages/cms-admin/src/lib/lighthouse/types.ts

export interface LighthouseScore {
  performance: number;        // 0-100
  accessibility: number;      // 0-100
  seo: number;                // 0-100
  bestPractices: number;      // 0-100
}

export interface LighthouseAudit {
  id: string;                 // e.g. "largest-contentful-paint"
  title: string;              // e.g. "Largest Contentful Paint"
  score: number | null;       // 0-1, null if not applicable
  displayValue?: string;      // e.g. "2.4 s"
  description: string;
  category: "performance" | "accessibility" | "seo" | "best-practices";
}

export interface LighthouseResult {
  url: string;
  timestamp: string;
  strategy: "mobile" | "desktop";
  scores: LighthouseScore;
  audits: LighthouseAudit[];
  opportunities: LighthouseOpportunity[];  // "Serve images in next-gen formats"
  diagnostics: LighthouseDiagnostic[];     // "Avoid enormous network payloads"
  coreWebVitals?: {
    lcp: number;              // Largest Contentful Paint (ms)
    cls: number;              // Cumulative Layout Shift
    inp: number;              // Interaction to Next Paint (ms)
    fcp: number;              // First Contentful Paint (ms)
    ttfb: number;             // Time to First Byte (ms)
  };
  fieldData?: {               // Real user data from CrUX (PSI only)
    lcp: { p75: number; category: "FAST" | "AVERAGE" | "SLOW" };
    cls: { p75: number; category: "FAST" | "AVERAGE" | "SLOW" };
    inp: { p75: number; category: "FAST" | "AVERAGE" | "SLOW" };
  };
  engine: "psi" | "lighthouse-local";
}

export interface LighthouseOpportunity {
  id: string;
  title: string;
  description: string;
  savings?: { ms?: number; bytes?: number };
}

export interface LighthouseDiagnostic {
  id: string;
  title: string;
  description: string;
  displayValue?: string;
}
```

### 2. PSI API Engine (production — always available)

```typescript
// packages/cms-admin/src/lib/lighthouse/psi-engine.ts

const PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export async function runPsiAudit(
  url: string,
  strategy: "mobile" | "desktop" = "mobile",
): Promise<LighthouseResult> {
  const apiKey = process.env.GOOGLE_PSI_API_KEY;
  const params = new URLSearchParams({
    url,
    strategy,
    category: "performance",
    // Multiple categories in separate params
  });
  ["performance", "accessibility", "seo", "best-practices"].forEach(c =>
    params.append("category", c)
  );
  if (apiKey) params.set("key", apiKey);

  const res = await fetch(`${PSI_URL}?${params}`);
  if (!res.ok) throw new Error(`PSI API error: ${res.status}`);

  const data = await res.json();
  return parsePsiResponse(data);
}

function parsePsiResponse(data: any): LighthouseResult {
  const lhr = data.lighthouseResult;
  return {
    url: lhr.finalUrl,
    timestamp: new Date().toISOString(),
    strategy: lhr.configSettings.formFactor,
    scores: {
      performance: Math.round(lhr.categories.performance.score * 100),
      accessibility: Math.round(lhr.categories.accessibility.score * 100),
      seo: Math.round(lhr.categories.seo.score * 100),
      bestPractices: Math.round(lhr.categories["best-practices"].score * 100),
    },
    audits: Object.values(lhr.audits).map(/* ... */),
    opportunities: /* ... */,
    diagnostics: /* ... */,
    coreWebVitals: /* extract from audits */,
    fieldData: data.loadingExperience?.metrics ? /* parse CrUX */ : undefined,
    engine: "psi",
  };
}
```

### 3. Local Lighthouse Engine (development — optional)

```typescript
// packages/cms-admin/src/lib/lighthouse/local-engine.ts

export async function runLocalAudit(
  url: string,
  strategy: "mobile" | "desktop" = "mobile",
): Promise<LighthouseResult> {
  // Dynamic import — only loads if lighthouse + chromium available
  const lighthouse = await import("lighthouse").catch(() => null);
  if (!lighthouse) throw new Error("lighthouse npm package not installed");

  const chromeLauncher = await import("chrome-launcher").catch(() => null);
  if (!chromeLauncher) throw new Error("chrome-launcher not available");

  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--no-sandbox"],
  });

  try {
    const result = await lighthouse.default(url, {
      port: chrome.port,
      output: "json",
      onlyCategories: ["performance", "accessibility", "seo", "best-practices"],
      formFactor: strategy === "mobile" ? "mobile" : "desktop",
      screenEmulation: strategy === "mobile"
        ? { mobile: true, width: 412, height: 823 }
        : { mobile: false, width: 1350, height: 940 },
    });

    return parseLighthouseResult(result.lhr);
  } finally {
    await chrome.kill();
  }
}

export async function isLocalEngineAvailable(): Promise<boolean> {
  try {
    await import("lighthouse");
    await import("chrome-launcher");
    return true;
  } catch {
    return false;
  }
}
```

### 4. Unified Audit Runner

```typescript
// packages/cms-admin/src/lib/lighthouse/runner.ts

export async function runAudit(
  url: string,
  options?: { strategy?: "mobile" | "desktop"; preferLocal?: boolean },
): Promise<LighthouseResult> {
  const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");

  // Localhost → must use local engine
  if (isLocalhost) {
    if (await isLocalEngineAvailable()) {
      return runLocalAudit(url, options?.strategy);
    }
    throw new Error("Cannot audit localhost without local Lighthouse. Install: pnpm add -D lighthouse chrome-launcher");
  }

  // Remote URL → PSI API (always available), local as option
  if (options?.preferLocal && await isLocalEngineAvailable()) {
    return runLocalAudit(url, options.strategy);
  }

  return runPsiAudit(url, options?.strategy);
}
```

### 5. Score History Storage

```typescript
// _data/lighthouse/
//   {siteId}/
//     history.json          — score history (appended per scan)
//     latest.json           — most recent full result
//     pages/
//       {slug-hash}.json    — per-page audit details

export interface ScoreHistoryEntry {
  timestamp: string;
  url: string;
  strategy: "mobile" | "desktop";
  scores: LighthouseScore;
  engine: "psi" | "lighthouse-local";
}

// history.json: ScoreHistoryEntry[] (max 365 entries, oldest pruned)
```

### 6. Dashboard Widget

On the main Dashboard page (`/admin`), add a Lighthouse widget:

```
┌─────────────────────────────────────────────────────┐
│ Site Health — maurseth.dk                    [⟳ Run] │
│                                                      │
│ Performance   Accessibility   SEO    Best Practices  │
│    87 🟢          94 🟢       72 🟡      100 🟢     │
│                                                      │
│ Trend (last 30 days)                                 │
│ 100┤                         ╭──●                    │
│  80┤    ●──────●────●───●──●╯                       │
│  60┤                                                 │
│  40┤                                                 │
│    └─────────────────────────────────────────        │
│     Mar 1   Mar 8   Mar 15  Mar 22                   │
│                                                      │
│ ⚠️ SEO dropped 8 points since last scan              │
│ Last scanned: 2 hours ago                            │
│ [View full audit →]                                  │
└─────────────────────────────────────────────────────┘
```

Score colors: 🟢 90-100, 🟡 50-89, 🔴 0-49 (Google's official thresholds).

### 7. Full Audit Page

New page at `/admin/tools?tab=lighthouse` (in Tools, alongside Link Checker and Screenshots):

```
Lighthouse Audit
┌─────────────────────────────────────────────────────┐
│ [Scan All Pages]  [Scan Homepage]  Strategy: [Mobile ▾]│
│                                                      │
│ OVERALL SCORES (homepage)                            │
│ ┌──────────┐┌──────────┐┌──────────┐┌──────────┐   │
│ │Perf   87 ││Access 94 ││SEO    72 ││Best  100 │   │
│ │   🟢     ││   🟢     ││   🟡     ││   🟢     │   │
│ └──────────┘└──────────┘└──────────┘└──────────┘   │
│                                                      │
│ CORE WEB VITALS                                      │
│ LCP: 2.4s 🟡  |  CLS: 0.05 🟢  |  INP: 120ms 🟢   │
│                                                      │
│ TOP OPPORTUNITIES                                    │
│ 🔴 Serve images in next-gen formats     — save 1.2s  │
│ 🟡 Eliminate render-blocking resources  — save 0.4s  │
│ 🟡 Reduce unused JavaScript             — save 0.3s  │
│                                                      │
│ PER-PAGE SCORES                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Page             │ Perf │ Access │ SEO │ Best   │ │
│ │ / (home)         │ 87   │ 94     │ 72  │ 100    │ │
│ │ /blog            │ 91   │ 96     │ 85  │ 100    │ │
│ │ /about           │ 78   │ 88     │ 68  │ 92     │ │
│ │ /contact         │ 95   │ 100    │ 90  │ 100    │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ SCORE HISTORY                                        │
│ [chart — last 90 days, 4 lines for each category]   │
└─────────────────────────────────────────────────────┘
```

### 8. Scheduled Scans

Add to the existing scheduler (`scheduler.ts`):

```typescript
// In scheduler tick — after agent runs, before backup
if (shouldRunLighthouse(state)) {
  const previewUrl = siteConfig.previewSiteUrl;
  if (previewUrl) {
    const result = await runAudit(previewUrl);
    await appendHistory(siteId, result);

    // Alert if score dropped
    const prev = await getLatestScore(siteId);
    if (prev && result.scores.performance < prev.performance - 10) {
      // Trigger notification via F64 toast / F13 notification channels
    }
  }
}
```

Default schedule: weekly (Sunday night). Configurable in Site Settings → Performance tab.

### 9. API Endpoints

```
POST /api/admin/lighthouse/scan           → run audit (body: { url?, strategy?, pages? })
GET  /api/admin/lighthouse/latest         → latest scores for active site
GET  /api/admin/lighthouse/history        → score history (last 90 days)
GET  /api/admin/lighthouse/pages          → per-page scores
GET  /api/admin/lighthouse/audit/[hash]   → full audit detail for a specific page
GET  /api/admin/lighthouse/engine         → which engine is available (psi/local/both)
```

### 10. Settings

In Site Settings → Performance tab:

```
LIGHTHOUSE SCANNING

Schedule: [Weekly (Sunday) ▾]
Strategy: [Mobile ▾]
Google PSI API Key: [●●●●●●●●●●●] (optional — 25K/day free)

Alerts:
☑ Notify when Performance drops below [80]
☑ Notify when SEO drops below [70]
☐ Notify when Accessibility drops below [90]

Scan pages:
(●) Homepage only (fast)
( ) All pages (uses route index from F72)
( ) Custom list: [________________]
```

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/lighthouse/types.ts` — **new** types
- `packages/cms-admin/src/lib/lighthouse/psi-engine.ts` — **new** PSI API engine
- `packages/cms-admin/src/lib/lighthouse/local-engine.ts` — **new** local Lighthouse engine
- `packages/cms-admin/src/lib/lighthouse/runner.ts` — **new** unified runner
- `packages/cms-admin/src/lib/lighthouse/history.ts` — **new** score history storage
- `packages/cms-admin/src/app/api/admin/lighthouse/` — **new** API routes
- `packages/cms-admin/src/app/admin/(workspace)/page.tsx` — **modified** (add Dashboard widget)
- `packages/cms-admin/src/app/admin/(workspace)/tools/` — **modified** (add Lighthouse tab)
- `packages/cms-admin/src/lib/scheduler.ts` — **modified** (add scheduled scan hook)
- `packages/cms-admin/src/components/settings/general-settings-panel.tsx` — **modified** (add Performance settings section)

### Downstream dependents

`scheduler.ts` is imported by:
- `instrumentation.ts` (1 ref) — unaffected, calls `runScheduledAgents()` which we extend

`page.tsx` (Dashboard) — leaf page component, no downstream dependents.

`general-settings-panel.tsx` — leaf component used by account/settings pages, no importers outside those routes.

### Blast radius
- PSI API calls take 10-30 seconds — must run async, never block page load
- Scheduled scans add load to scheduler tick — run after agents/backups, with timeout
- `lighthouse` npm is ~50 MB — only install as devDependency, dynamically imported
- Score history files grow over time — prune at 365 entries
- Dashboard widget fetches `/api/admin/lighthouse/latest` — must handle "no scans yet" gracefully

### Breaking changes
- None — all new files, Dashboard widget is additive, scheduler hook is additive

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] PSI API returns valid scores for a public URL
- [ ] Local engine runs against localhost (when Playwright available)
- [ ] Engine auto-detection picks PSI for remote, local for localhost
- [ ] Score history appends correctly and prunes old entries
- [ ] Dashboard widget renders scores with correct colors
- [ ] Dashboard widget shows "No scans yet" when empty
- [ ] Scheduled scan runs on configured schedule
- [ ] Alert fires when score drops below threshold
- [ ] Full audit page shows opportunities and diagnostics
- [ ] Per-page scan works with route index from F72
- [ ] Settings save PSI API key and schedule

## Implementation Steps

### Phase 1 — Engines + API (days 1-3)
1. Create `lib/lighthouse/types.ts` — all type definitions
2. Create `lib/lighthouse/psi-engine.ts` — PSI API wrapper with response parsing
3. Create `lib/lighthouse/local-engine.ts` — optional npm lighthouse wrapper
4. Create `lib/lighthouse/runner.ts` — unified runner with auto-detection
5. Create `lib/lighthouse/history.ts` — score history read/write/prune
6. Create API routes (`/api/admin/lighthouse/*`)

### Phase 2 — Dashboard + UI (days 3-5)
7. Build Dashboard widget (scores, trend chart, alert banner)
8. Build full audit page in Tools → Lighthouse tab
9. Build per-page score table
10. Build opportunities/diagnostics list with severity icons
11. Build score history chart (last 90 days, 4 category lines)

### Phase 3 — Scheduler + Settings (days 5-6)
12. Add Lighthouse scan hook to `scheduler.ts`
13. Add Performance settings section (schedule, API key, thresholds)
14. Implement alert logic (score drop detection → toast/notification)
15. Integrate with F72 route index for "scan all pages" mode

## Dependencies

- Google PageSpeed Insights API — free, 25K/day (API key optional but recommended)
- `lighthouse` npm — **optional** devDependency for local scans
- `@playwright/test` — already installed, provides Chromium for local engine
- F72 (Website Screenshots) — shares route index for "scan all pages"
- F97 (SEO Module) — SEO score from Lighthouse complements F97's content-based SEO score
- F64 (Toast Notifications) — for score drop alerts
- Existing scheduler infrastructure in `scheduler.ts`

## Effort Estimate

**Medium** — 5-6 days

- Days 1-3: PSI engine + local engine + unified runner + API routes + history storage
- Days 3-5: Dashboard widget + full audit page + per-page table + chart
- Days 5-6: Scheduler integration + settings + alerts + testing with real sites
