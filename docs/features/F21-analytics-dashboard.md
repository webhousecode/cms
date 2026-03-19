# F21 — Analytics Dashboard

> Content performance metrics with AI agent leaderboard and autonomy tracking.

## Problem

There are no content performance metrics in the CMS. Editors cannot see which content performs well, which AI agents produce the best content, or what percentage of content is AI-generated vs human-written.

## Solution

An analytics dashboard showing page views, engagement metrics, AI agent performance rankings, content freshness, and the autonomy percentage (AI vs human content ratio). Supports lightweight self-hosted analytics or GA4 integration.

## Technical Design

### Analytics Data Sources

```typescript
// packages/cms-admin/src/lib/analytics/types.ts

export type AnalyticsProvider = 'built-in' | 'ga4' | 'plausible' | 'umami';

export interface AnalyticsConfig {
  provider: AnalyticsProvider;
  ga4?: { propertyId: string; credentialsPath: string };
  plausible?: { siteId: string; apiKey: string; baseUrl?: string };
  umami?: { websiteId: string; apiKey: string; baseUrl: string };
}

export interface PageMetrics {
  path: string;
  collection?: string;
  slug?: string;
  views: number;
  uniqueVisitors: number;
  avgTimeOnPage: number;     // seconds
  bounceRate: number;         // 0-1
  period: string;             // e.g. "2026-03-15"
}
```

### Built-in Analytics

A lightweight tracking script (no cookies, privacy-friendly):

```typescript
// packages/cms/src/build/analytics-script.ts

// Generates a <script> tag that sends a beacon on page load:
// POST /api/analytics/event { path, referrer, screen, timestamp }
// No cookies, no fingerprinting, GDPR-friendly
```

Server-side collection:

```typescript
// packages/cms-admin/src/app/api/analytics/event/route.ts
// Accepts beacon, stores in <dataDir>/analytics/YYYY-MM-DD.jsonl
```

### AI Agent Leaderboard

```typescript
// packages/cms-admin/src/lib/analytics/agent-metrics.ts

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  documentsCreated: number;
  documentsPublished: number;   // that went from AI draft to published
  avgEditDistance: number;       // how much humans changed AI output (0-1)
  totalViews: number;           // views on AI-generated content
  avgViewsPerDocument: number;
  topPerformingDocument: { slug: string; views: number };
}
```

### Autonomy Metric

```typescript
export interface AutonomyMetrics {
  totalDocuments: number;
  aiGenerated: number;          // documents where >50% of fields are AI-generated
  humanAuthored: number;
  autonomyPercentage: number;   // aiGenerated / totalDocuments * 100
  byCollection: Record<string, { ai: number; human: number }>;
}
```

Calculated from `_fieldMeta.aiGenerated` flags on documents.

### Dashboard Components

- **Overview cards**: Total views, unique visitors, top page, bounce rate
- **Content performance table**: Sortable by views, time on page, bounce rate
- **AI Agent leaderboard**: Ranked by views on their content
- **Autonomy gauge**: Visual indicator of AI vs human content ratio
- **Freshness timeline**: Chart showing content age distribution

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/analytics/event` | Record page view (public, rate-limited) |
| `GET` | `/api/admin/analytics/overview` | Dashboard summary |
| `GET` | `/api/admin/analytics/pages` | Per-page metrics |
| `GET` | `/api/admin/analytics/agents` | Agent leaderboard |
| `GET` | `/api/admin/analytics/autonomy` | Autonomy metrics |

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/analytics/types.ts` — new analytics types
- `packages/cms/src/build/analytics-script.ts` — new tracking script
- `packages/cms-admin/src/app/api/analytics/event/route.ts` — new beacon endpoint
- `packages/cms-admin/src/lib/analytics/agent-metrics.ts` — new agent performance module
- `packages/cms-admin/src/app/admin/analytics/page.tsx` — new dashboard page

### Blast radius
- Built-in tracking script injected into site HTML — must not break existing sites
- Agent performance ties into `_fieldMeta` system — changes there would affect metrics

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Tracking script sends beacons on page load
- [ ] JSONL events stored correctly
- [ ] Agent leaderboard calculates from `_fieldMeta` data
- [ ] Autonomy percentage reflects actual AI vs human ratio

## Implementation Steps

1. Create `packages/cms-admin/src/lib/analytics/types.ts`
2. Build lightweight tracking script in `packages/cms/src/build/analytics-script.ts`
3. Create beacon collection endpoint at `/api/analytics/event`
4. Build analytics aggregation (daily rollup from JSONL events)
5. Create GA4 adapter using Google Analytics Data API
6. Create Plausible adapter using Plausible API
7. Build agent performance calculator from `_fieldMeta` + analytics data
8. Build autonomy metrics calculator
9. Create dashboard page at `packages/cms-admin/src/app/admin/analytics/page.tsx`
10. Add analytics config to site settings

## Dependencies

- Existing `_fieldMeta` system for AI provenance tracking
- F10 (AI Learning Loop) — shares edit distance calculations

## Effort Estimate

**Large** — 5-7 days
