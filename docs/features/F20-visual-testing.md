# F20 — Visual Testing & Screenshots

> Playwright-based automated visual testing with screenshot capture and regression detection.

## Problem

There is no automated way to verify that admin UI changes do not break existing pages. Content previews lack thumbnail generation. Documentation has no screenshots.

## Solution

A Playwright-based visual testing system that captures screenshots of all admin pages and rendered site pages, detects visual regressions, generates thumbnails for content previews, and produces screenshots for documentation.

## Technical Design

### Test Runner

```typescript
// packages/cms-admin/e2e/visual.config.ts

export interface VisualTestConfig {
  adminUrl: string;           // e.g. http://localhost:3010
  siteUrl?: string;           // e.g. http://localhost:3000
  outputDir: string;          // e.g. e2e/screenshots
  baselineDir: string;        // e.g. e2e/baselines
  diffThreshold: number;      // 0-1, default 0.01 (1%)
  viewports: Array<{ width: number; height: number; name: string }>;
}
```

### Visual Test Suite

```typescript
// packages/cms-admin/e2e/visual/admin-pages.spec.ts

import { test, expect } from '@playwright/test';

const ADMIN_PAGES = [
  { path: '/admin', name: 'dashboard' },
  { path: '/admin/posts', name: 'collection-list' },
  { path: '/admin/posts/hello-world', name: 'document-edit' },
  { path: '/admin/agents', name: 'agents-list' },
  { path: '/admin/settings', name: 'settings' },
  { path: '/admin/curation', name: 'curation' },
  { path: '/admin/link-checker', name: 'link-checker' },
  // ... all admin pages
];

for (const page of ADMIN_PAGES) {
  test(`visual: ${page.name}`, async ({ page: p }) => {
    await p.goto(page.path);
    await expect(p).toHaveScreenshot(`${page.name}.png`, {
      threshold: 0.01,
    });
  });
}
```

### Thumbnail Generator

```typescript
// packages/cms-admin/src/lib/thumbnails.ts

export class ThumbnailGenerator {
  private browser: Browser;

  async generateThumbnail(url: string, options?: {
    width?: number;     // default: 1200
    height?: number;    // default: 630 (OG image ratio)
  }): Promise<Buffer>;

  async generateForDocument(
    collection: string,
    slug: string,
    siteUrl: string
  ): Promise<string>;  // returns path to saved thumbnail
}
```

### CI Integration

```yaml
# .github/workflows/visual-test.yml
# Runs on PR, compares screenshots against baseline on main
# Uploads diff report as PR comment
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/screenshots/capture` | Capture screenshot of a URL |
| `GET` | `/api/admin/screenshots/[collection]/[slug]` | Get document thumbnail |
| `POST` | `/api/admin/screenshots/regenerate` | Regenerate all thumbnails |

## Impact Analysis

### Files affected
- `packages/cms-admin/e2e/visual/` — new visual test specs
- `packages/cms-admin/playwright.config.ts` — new Playwright config
- `packages/cms-admin/src/lib/thumbnails.ts` — new thumbnail generator
- `.github/workflows/visual-test.yml` — new CI workflow

### Blast radius
- Playwright dependency adds significant install time
- Thumbnail generation on publish adds processing time

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Visual test suite captures screenshots of all admin pages
- [ ] Thumbnail generation creates OG image-sized screenshots
- [ ] CI workflow runs and reports diffs as PR comments

## Implementation Steps

1. Add Playwright as dev dependency to `packages/cms-admin`
2. Create Playwright config at `packages/cms-admin/playwright.config.ts`
3. Create visual test specs for all admin pages
4. Create baseline screenshots for initial comparison
5. Create `packages/cms-admin/src/lib/thumbnails.ts` with Playwright-based capture
6. Add thumbnail generation on document publish
7. Display thumbnails in collection list view
8. Create GitHub Actions workflow for visual regression on PRs
9. Add screenshot comparison report as PR comment via `playwright-report`
10. Add "Capture Screenshots" admin action for documentation purposes

## Dependencies

- `playwright` npm package (dev dependency)

## Effort Estimate

**Medium** — 3-4 days
