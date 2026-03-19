# F16 — Link Checker Agent

> Automated broken link detection across all published content. **Status: Done.**

## Problem

Published content may contain broken internal and external links. Manual checking is tedious and error-prone.

## Solution

A link checker agent that crawls all published content, validates internal and external links, reports broken ones, suggests fixes for internal links, and displays link health metrics on a dashboard.

## Implementation

Already implemented and shipped. Key files:

- `packages/cms-admin/src/lib/link-check-runner.ts` — Crawl and check logic
- `packages/cms-admin/src/lib/link-check-store.ts` — Store results
- `packages/cms-admin/src/app/admin/link-checker/page.tsx` — Admin UI
- `packages/cms-admin/src/app/api/check-links/route.ts` — API endpoint

### Features Shipped

- Scans all published documents for links in richtext/text fields
- Validates HTTP status codes for external links
- Validates internal link targets exist
- Broken link report with link, source document, and HTTP status
- Scheduled via agent scheduler (daily/weekly)
- Manual trigger from admin

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/link-check-runner.ts` — already implemented
- `packages/cms-admin/src/lib/link-check-store.ts` — already implemented
- `packages/cms-admin/src/app/admin/link-checker/page.tsx` — already implemented
- `packages/cms-admin/src/app/api/check-links/route.ts` — already implemented

### Blast radius
- None — feature is already shipped and stable

### Breaking changes
- None

### Test plan
- [ ] Feature is complete — no additional testing needed

## Dependencies

- None

## Effort Estimate

**Done** — no additional work needed
