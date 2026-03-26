# F44 — Media Processing Pipeline

> Sharp-based image optimization, responsive WebP variant generation, and automatic srcset resolution in build — originals always preserved, content references never modified.

## Problem

Uploaded media is stored as-is. A 3 MB JPEG is served as a 3 MB JPEG. No resizing, no WebP/AVIF conversion, no responsive `srcset`. Sites either rely on Next.js image optimization at request time (slow first hit, no AVIF for non-Vercel hosts) or serve unoptimized originals. A gallery site like Maurseth with 900 images at 2-4 MB each = 2-4 GB page weight with zero optimization.

Lighthouse Performance score: ~40 without optimization, ~90+ with responsive WebP.

## Solution

Sharp generates optimized WebP variants **alongside** originals on upload. Originals are never replaced, content references are never modified. At build time (`build.ts`), image references in HTML are automatically upgraded to `<picture>` with WebP srcset when variants exist. Batch processing for existing media libraries.

### Key principles

1. **Originals preserved** — never deleted, never overwritten
2. **Content references unchanged** — JSON/markdown still says `hero.jpg`
3. **Variants alongside originals** — `hero.jpg` → `hero-800w.webp`, `hero-1200w.webp`
4. **Build-time resolution** — `build.ts` replaces `<img src="hero.jpg">` with `<picture>` when variants exist
5. **Opt-in for existing media** — "Optimize All" action in Media Library

## Technical Design

### 1. Variant naming convention

```
uploads/
  hero.jpg              ← original (untouched)
  hero-400w.webp        ← variant
  hero-800w.webp        ← variant
  hero-1200w.webp       ← variant
  hero-1600w.webp       ← variant
```

Naming: `{basename}-{width}w.webp` — predictable, no database needed.

### 2. Sharp processor

```typescript
// packages/cms-admin/src/lib/media/image-processor.ts

import sharp from "sharp";

export interface VariantConfig {
  suffix: string;  // "400w"
  width: number;   // 400
}

export const DEFAULT_VARIANTS: VariantConfig[] = [
  { suffix: "400w", width: 400 },
  { suffix: "800w", width: 800 },
  { suffix: "1200w", width: 1200 },
  { suffix: "1600w", width: 1600 },
];

export async function generateVariants(
  inputBuffer: Buffer,
  filename: string,
  variants: VariantConfig[] = DEFAULT_VARIANTS,
  quality: number = 80,
): Promise<{ suffix: string; buffer: Buffer; width: number }[]> {
  const results: { suffix: string; buffer: Buffer; width: number }[] = [];
  const meta = await sharp(inputBuffer).metadata();
  const originalWidth = meta.width ?? 9999;

  for (const v of variants) {
    // Skip variants larger than original
    if (v.width >= originalWidth) continue;

    const buffer = await sharp(inputBuffer)
      .resize(v.width, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    results.push({ suffix: v.suffix, buffer, width: v.width });
  }

  return results;
}
```

### 3. Upload integration

On file upload, after storing the original, generate and store variants:

```typescript
// In media upload handler
const variants = await generateVariants(fileBuffer, filename);
for (const v of variants) {
  const variantName = `${basename}-${v.suffix}.webp`;
  await writeFile(join(uploadDir, variantName), v.buffer);
}
```

### 4. Batch processing (existing media)

API endpoint for processing all existing images:

```
POST /api/media/optimize-batch
  → Scans uploads/ for images without variants
  → Generates WebP variants for each
  → Returns { processed: number, skipped: number, errors: number }
```

UI: "Optimize All" button in Media Library (next to existing "Analyze All").
Progress via SSE or polling.

### 5. Build-time image resolution

In `build.ts` post-processing (or in F89 enrichDist), scan HTML for `<img>` tags and upgrade to `<picture>` when variants exist:

```typescript
// In post-build enrichment or build.ts
function upgradeImages(html: string, uploadsDir: string): string {
  return html.replace(
    /<img\s+([^>]*?)src="(\/uploads\/[^"]+\.(jpg|jpeg|png))"([^>]*?)>/gi,
    (match, pre, src, ext, post) => {
      const basename = src.replace(/\.[^.]+$/, "");
      // Check if WebP variants exist
      const srcset = DEFAULT_VARIANTS
        .map(v => `${basename}-${v.suffix}.webp ${v.width}w`)
        .filter(s => existsSync(join(uploadsDir, s.split(" ")[0].slice(1))))
        .join(", ");

      if (!srcset) return match; // no variants, keep original

      return `<picture>` +
        `<source srcset="${srcset}" type="image/webp" sizes="(max-width: 800px) 100vw, 800px">` +
        `<img ${pre}src="${src}"${post}>` +
        `</picture>`;
    }
  );
}
```

This means:
- Content JSON stays as `"image": "/uploads/hero.jpg"`
- Build output HTML gets `<picture>` with WebP srcset
- Browser picks best variant automatically
- Fallback to original JPEG for old browsers

### 6. Settings

In Site Settings → General (or new Media tab):

```
MEDIA PROCESSING
├─ Generate WebP variants on upload    [toggle, default: on]
├─ Variant sizes                       [400, 800, 1200, 1600] (configurable)
├─ WebP quality                        [80] (1-100 slider)
└─ [Optimize existing media]           (action button, batch)
```

### 7. SiteConfig additions

```typescript
// In SiteConfig interface
mediaAutoOptimize: boolean;        // default: true
mediaVariantWidths: number[];      // default: [400, 800, 1200, 1600]
mediaWebpQuality: number;          // default: 80
```

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/lib/media/image-processor.ts` — Sharp variant generation
- `packages/cms-admin/src/app/api/media/optimize-batch/route.ts` — batch processing endpoint
- `packages/cms-admin/src/lib/__tests__/image-processor.test.ts` — tests

**Modified files:**
- `packages/cms-admin/src/app/api/uploads/route.ts` — call generateVariants after upload
- `packages/cms-admin/src/lib/post-build-enrich.ts` — upgradeImages in enrichDist
- `packages/cms-admin/src/lib/site-config.ts` — add media* fields
- `packages/cms-admin/src/app/admin/(workspace)/media/page.tsx` — "Optimize All" button
- `package.json` — add `sharp` dependency

### Blast radius
- Upload flow gains variant generation step — may slow uploads slightly (~200ms per image)
- Build output changes: `<img>` → `<picture>` — sites must handle `<picture>` in CSS
- Sharp is a native dependency — may need platform-specific install
- Existing media unaffected until batch optimization is run

### Breaking changes
None — purely additive. Existing images serve as before. Variants are only used when present.

### Test plan
- [ ] TypeScript compiles
- [ ] Sharp generates 4 WebP variants from a JPEG
- [ ] Variants are smaller than original
- [ ] Variants skip sizes larger than original
- [ ] Upload stores variants alongside original
- [ ] Batch processes existing images
- [ ] Build-time upgrade: `<img>` → `<picture>` with srcset
- [ ] No variants = original `<img>` preserved
- [ ] Maurseth: 900 images batch-processed without crash

## Implementation Steps

1. Add `sharp` dependency
2. Create `image-processor.ts` with `generateVariants()`
3. Write tests for variant generation
4. Integrate into upload flow
5. Create batch optimization endpoint
6. Add "Optimize All" button to Media Library
7. Add build-time `<picture>` upgrade in post-build enrichment
8. Add media settings to SiteConfig
9. Test with Simple Blog (419 images)

## Dependencies

- **sharp** npm package (new dependency)
- **F89 Post-Build Enrichment** (Done) — for build-time image upgrade

## Effort Estimate

**Medium** — 3 days

- Day 1: Sharp processor + tests + upload integration
- Day 2: Batch optimization + Media Library UI
- Day 3: Build-time `<picture>` upgrade + settings + test with 419 images
