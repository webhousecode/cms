# F72 — Website Screenshots

> Playwright-based screenshot tool for capturing all routable pages on the published site — visual QA, client presentations, and documentation.

## Problem

There's no way to see how the published website looks from inside the CMS admin. To do visual QA, you open each page manually in a browser. For client presentations you take manual screenshots. For documentation you hunt for the right page. With 20-50 pages across collections, this is tedious and always out of date.

The CMS already knows every page (collections + slugs + urlPrefix) and has a preview site URL configured. It should be able to capture all of them automatically.

## Solution

A **Website Screenshots** tool in the admin UI that:

1. Builds a route index from all CMS collections with `urlPrefix` (posts → `/blog/`, pages → `/`, etc.)
2. Runs headless Playwright against the preview site to capture each page
3. Stores screenshots in the media library (or a dedicated screenshots dir)
4. Shows a thumbnail grid with last-captured date, click to view full-size
5. Supports re-capture of individual pages or all pages

This also introduces a new **Tools** sidebar group — Link Checker (F16) moves there as a tab alongside Screenshots.

## Technical Design

### 1. Route Index Builder

```typescript
// packages/cms-admin/src/lib/screenshots/route-index.ts

export interface SiteRoute {
  collection: string;       // "posts", "pages", etc.
  slug: string;
  title: string;
  path: string;             // computed: urlPrefix + slug, e.g. "/blog/my-post"
  fullUrl: string;          // previewSiteUrl + path
  lastCapturedAt?: string;  // ISO timestamp of last screenshot
  screenshotUrl?: string;   // path to screenshot in media/uploads
}

/**
 * Build route index from all collections that have urlPrefix.
 * Also includes root "/" and any static paths from config.
 */
export async function buildRouteIndex(
  previewSiteUrl: string,
): Promise<SiteRoute[]> {
  // 1. Load cms.config.ts collections
  // 2. For each collection with urlPrefix, list all documents
  // 3. Compute full URLs: previewSiteUrl + urlPrefix + slug
  // 4. Add root "/" and any configured static routes
  // 5. Load existing screenshot metadata from _data/screenshots.json
  // 6. Return merged list with lastCapturedAt timestamps
}
```

### 2. Screenshot Capture Engine

```typescript
// packages/cms-admin/src/lib/screenshots/capture.ts

import { chromium } from "playwright";
import sharp from "sharp";

export interface CaptureOptions {
  width?: number;       // default: 1440
  height?: number;      // default: 900
  fullPage?: boolean;   // default: false (viewport only)
  delay?: number;       // ms to wait after load, default: 1500
  thumbnailWidth?: number; // for grid view, default: 480
}

export interface CaptureResult {
  route: SiteRoute;
  screenshotPath: string;   // full-size screenshot path
  thumbnailPath: string;    // resized thumbnail path
  capturedAt: string;
  fileSize: number;
}

/**
 * Capture a single page screenshot.
 * Saves full-size + thumbnail to uploads/screenshots/.
 */
export async function capturePage(
  route: SiteRoute,
  options?: CaptureOptions,
): Promise<CaptureResult>;

/**
 * Capture all routes. Reuses a single browser instance.
 * Reports progress via callback.
 */
export async function captureAll(
  routes: SiteRoute[],
  options?: CaptureOptions,
  onProgress?: (completed: number, total: number, current: SiteRoute) => void,
): Promise<CaptureResult[]>;
```

Implementation uses a single Playwright browser instance, navigates to each URL sequentially, waits for `networkidle` + configurable delay, takes viewport screenshot, then generates a Sharp thumbnail at 480px wide.

### 3. Screenshot Metadata Storage

```json
// _data/screenshots.json
{
  "capturedAt": "2026-03-18T14:00:00Z",
  "routes": [
    {
      "collection": "posts",
      "slug": "my-post",
      "path": "/blog/my-post",
      "screenshotUrl": "/uploads/screenshots/posts-my-post.png",
      "thumbnailUrl": "/uploads/screenshots/thumbs/posts-my-post.png",
      "capturedAt": "2026-03-18T14:00:12Z",
      "fileSize": 284000,
      "status": "ok"
    },
    {
      "collection": "pages",
      "slug": "about",
      "path": "/about",
      "screenshotUrl": "/uploads/screenshots/pages-about.png",
      "thumbnailUrl": "/uploads/screenshots/thumbs/pages-about.png",
      "capturedAt": "2026-03-18T14:00:08Z",
      "fileSize": 198000,
      "status": "ok"
    }
  ]
}
```

### 4. API Routes

```
GET    /api/admin/screenshots              → list all routes + screenshot metadata
POST   /api/admin/screenshots/capture      → capture specific routes (body: { routes: string[] })
POST   /api/admin/screenshots/capture-all  → capture all routable pages
GET    /api/admin/screenshots/status       → SSE stream for capture progress
DELETE /api/admin/screenshots/[collection]/[slug]  → delete a screenshot
```

The capture endpoints are long-running — they use SSE (`/status`) to stream progress back to the UI in real-time.

### 5. Admin UI — Tools Page with Tabs

New sidebar group **Tools** replaces the standalone Link Checker item:

```
Sidebar (before):
  ├── ...
  ├── Link checker          ← standalone item
  └── ...

Sidebar (after):
  ├── ...
  ├── Tools                 ← new group
  │   (clicking opens /admin/tools with tabs)
  └── ...

/admin/tools page:
  ┌─────────────────────────────────────────────┐
  │  Tools                                       │
  │  [Link Checker] [Screenshots]               │
  │  ─────────────────────────────────────────── │
  │                                               │
  │  (tab content here)                           │
  └─────────────────────────────────────────────┘
```

**Link Checker tab**: Move existing `/admin/link-checker` page content to a tab component. Route becomes `/admin/tools?tab=links` (or default tab).

**Screenshots tab** (`/admin/tools?tab=screenshots`):

```
┌─────────────────────────────────────────────────────┐
│ Screenshots                                          │
│                                                      │
│ [Capture All] [Select Pages ▾]                       │
│ Last full capture: 2 hours ago · 34 pages            │
│                                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│ │  thumb   │ │  thumb   │ │  thumb   │ │ thumb   │ │
│ │          │ │          │ │          │ │         │ │
│ ├──────────┤ ├──────────┤ ├──────────┤ ├─────────┤ │
│ │ Home     │ │ About    │ │ Blog     │ │ Post 1  │ │
│ │ /        │ │ /about   │ │ /blog    │ │ /blog/… │ │
│ │ 2h ago   │ │ 2h ago   │ │ 2h ago   │ │ 2h ago  │ │
│ │ [⟳]      │ │ [⟳]      │ │ [⟳]      │ │ [⟳]     │ │
│ └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│                                                      │
│ Progress: ████████████████░░░░ 28/34                 │
└─────────────────────────────────────────────────────┘
```

Features:
- Thumbnail grid (auto-fill, responsive)
- Click thumbnail → lightbox with full-size screenshot
- Per-page re-capture button (⟳)
- "Capture All" button with progress bar (SSE-driven)
- "Select Pages" dropdown to pick specific collections or individual pages
- Last captured date per page
- Badge showing pages that have changed since last capture (compare document updatedAt vs capturedAt)

### 6. Capture Progress via SSE

```typescript
// packages/cms-admin/src/app/api/admin/screenshots/status/route.ts

// SSE stream that emits:
// { type: "progress", completed: 12, total: 34, current: { slug: "about", path: "/about" } }
// { type: "done", results: [...] }
// { type: "error", route: {...}, error: "timeout" }
```

The UI subscribes to this SSE endpoint when a capture is running, updating the progress bar and flipping thumbnails to new screenshots as they complete.

### 7. File Storage

```
{uploadDir}/screenshots/
  ├── pages-home.png              # full-size (1440×900)
  ├── pages-about.png
  ├── posts-my-post.png
  └── thumbs/
      ├── pages-home.png          # thumbnail (480×300)
      ├── pages-about.png
      └── posts-my-post.png
```

Naming: `{collection}-{slug}.png`. Overwrites on re-capture (no versioning — latest is what matters).

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/screenshots/route-index.ts` — new route index builder
- `packages/cms-admin/src/lib/screenshots/capture.ts` — new Playwright capture engine
- `packages/cms-admin/src/app/api/admin/screenshots/` — new API routes
- `packages/cms-admin/src/app/admin/tools/page.tsx` — new Tools page with tabs
- `packages/cms-admin/src/app/admin/link-checker/page.tsx` — relocated to Tools tab
- `packages/cms-admin/src/components/sidebar.tsx` — replace Link Checker with Tools

### Blast radius
- Sidebar navigation change — "Link Checker" item moves to "Tools"
- Playwright dependency (large) — should be lazy-loaded
- Link Checker page relocation — existing bookmarks/links break

### Breaking changes
- `/admin/link-checker` URL changes to `/admin/tools?tab=links`

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Route index built correctly from all collections
- [ ] Playwright captures screenshots at correct URLs
- [ ] Thumbnail grid displays in admin
- [ ] SSE progress updates during capture
- [ ] Link Checker works as tab in Tools page

## Implementation Steps

### Phase 1 — Core Engine + API (day 1-2)
1. Create `packages/cms-admin/src/lib/screenshots/route-index.ts` — build route index from collections
2. Create `packages/cms-admin/src/lib/screenshots/capture.ts` — Playwright capture + Sharp thumbnails
3. Create `_data/screenshots.json` metadata storage
4. Create API routes: `/api/admin/screenshots`, `/capture`, `/capture-all`, `/status` (SSE)
5. Install `playwright` as optional dependency (lazy-load, don't break installs without it)

### Phase 2 — Admin UI (day 2-3)
6. Create `/admin/tools/page.tsx` with tab system (Link Checker + Screenshots)
7. Move Link Checker page content to tab component
8. Build Screenshots tab: thumbnail grid, capture buttons, progress bar
9. Add lightbox for full-size screenshot viewing
10. Add SSE-driven progress updates during capture
11. Update sidebar: replace "Link checker" item with "Tools" item

### Phase 3 — Polish (day 3)
12. Add "stale" badge for pages changed since last capture
13. Add "Select Pages" multi-select for targeted capture
14. Add error handling for pages that fail to load (timeout, 404, 500)
15. Test with webhouse-site (filesystem) and SproutLake (GitHub)

## Dependencies

- `playwright` — headless browser (already a dev dependency for E2E tests)
- `sharp` — thumbnail generation (already in the project)
- F16 (Link Checker) — Done, gets relocated to Tools tab
- Preview site URL configured in Site Settings

## Effort Estimate

**Medium** — 3-4 days

- Day 1: Route index builder + Playwright capture engine + Sharp thumbnails
- Day 2: API routes + SSE progress + metadata storage
- Day 3: Admin UI — Tools page with tabs, screenshot grid, progress bar
- Day 4: Polish — stale detection, selective capture, error handling, sidebar update
