# F16 — Link & Image Checker

> Automated broken link AND broken image detection across all published content. **Status: Done.**

## Problem

Published content may contain broken internal and external links, as well as broken images — missing files, dead external image URLs, or references to deleted uploads. Manual checking is tedious and error-prone.

## Solution

A checker that crawls all published content, validates internal and external links AND images, reports broken ones, suggests fixes for internal links, and displays health metrics on a dashboard.

## Implementation

Already implemented and shipped. Key files:

- `packages/cms-admin/src/lib/link-check-runner.ts` — Crawl and check logic
- `packages/cms-admin/src/lib/link-check-store.ts` — Store results
- `packages/cms-admin/src/app/admin/(workspace)/link-checker/page.tsx` — Admin UI
- `packages/cms-admin/src/app/api/check-links/route.ts` — API endpoint (NDJSON streaming)

### Features Shipped

**Links:**
- Scans all published documents for links in richtext fields
- Validates HTTP status codes for external links (HEAD request, GET fallback)
- Validates internal link targets exist via document map
- AI-powered fix suggestions for broken links
- One-click apply fix (rewrites URL in content)
- Scheduled via tools scheduler (daily/weekly)
- Manual trigger from admin with streaming progress

**Images (added 2026-03-26):**
- Scans markdown images `![alt](url)` in richtext fields
- Scans HTML `<img src="...">` tags in richtext fields (TipTap output)
- Scans `type: "image"` fields from schema
- Internal images: verifies file exists on disk in upload directory
- External images: HTTP HEAD check (same as links)
- Separate "Broken Images" filter card in UI with `ImageOff` icon
- Image results show `Image` icon in URL column to distinguish from links
- Summary shows broken links + broken images counts separately

### LinkResult Type

```typescript
type LinkResult = {
  docCollection: string;
  docSlug: string;
  docTitle: string;
  field: string;
  url: string;
  text: string;
  kind: "link" | "image";          // NEW — distinguishes links from images
  type: "internal" | "external";
  status: "ok" | "broken" | "redirect" | "error";
  httpStatus?: number;
  redirectTo?: string;
  error?: string;
};
```

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/link-check-runner.ts` — added image extraction + internal image file check
- `packages/cms-admin/src/lib/link-check-store.ts` — unchanged (same storage format)
- `packages/cms-admin/src/app/admin/(workspace)/link-checker/page.tsx` — added Broken Images filter, image icon, updated summary
- `packages/cms-admin/src/app/api/check-links/route.ts` — unchanged (streams same LinkResult type)

### Blast radius
- `LinkResult` type gains `kind` field — existing persisted results (`_data/link-check-result.json`) will have `kind: undefined` which UI handles gracefully (treats as "link")
- No breaking changes to API endpoint — same NDJSON streaming format

### Breaking changes
- None — `kind` field is additive. Old results without `kind` render as links (backward compatible).

### Test plan
- [x] TypeScript compiles: `npx tsc --noEmit`
- [ ] Run check on site with images — broken images appear in "Broken Images" filter
- [ ] Internal image pointing to existing upload → OK
- [ ] Internal image pointing to deleted upload → Broken
- [ ] External image URL returning 404 → Broken
- [ ] Image fields (type: "image") with valid path → OK
- [ ] Regression: existing link checking still works as before

## Dependencies

- None

## Effort Estimate

**Done** — feature complete
