<!-- @webhouse/cms ai-guide v0.4.0 — last updated 2026-03-27 -->

# Image Handling

## How Image Fields Work

Image fields store a URL string. The value is typically `/uploads/filename.jpg` for locally uploaded files, or an external URL for remote images.

```json
{
  "data": {
    "heroImage": "/uploads/hero-a1b2.jpg",
    "gallery": [
      { "url": "/uploads/photo1-d4e5.jpg", "alt": "Description" },
      { "url": "/uploads/photo2-g7h8.jpg", "alt": "Description" }
    ]
  }
}
```

**Note:** `image-gallery` values must be `{ url, alt }[]` — never plain string arrays.

## Automatic Image Processing (F44)

When an image is uploaded, the CMS automatically:

1. **Generates WebP variants** at 400w, 800w, 1200w, 1600w (configurable in Site Settings)
2. **Extracts EXIF metadata** — camera, GPS, focal length, ISO, date
3. **Runs AI image analysis** — generates caption, alt-text (max 125 chars), and 3-8 tags

### WebP variants

Originals are always preserved. Variants are stored alongside:

```
uploads/
  hero-a1b2.jpg           ← original (untouched)
  hero-a1b2-400w.webp     ← variant (400px wide)
  hero-a1b2-800w.webp     ← variant (800px wide)
  hero-a1b2-1200w.webp    ← variant (1200px wide)
  hero-a1b2-1600w.webp    ← variant (1600px wide)
```

Variants larger than the original are skipped automatically.

### AI image analysis

Every uploaded image is analyzed by Claude (non-blocking, runs in background):

- **Caption** — descriptive sentence about image content
- **Alt-text** — accessible description, max 125 characters
- **Tags** — 3-8 relevant keywords

Results are stored in `_data/media-meta.json` and visible in the Media lightbox AI panel. Alt-text auto-fills when inserting images in the richtext editor.

### Configuration

In Site Settings → Tools & Automation:

- **Generate WebP variants on upload** — toggle on/off (default: on)
- **Variant widths** — comma-separated pixel widths (default: 400, 800, 1200, 1600)
- **WebP quality** — slider 10-100 (default: 80)

## Build-time `<picture>` Upgrade

In static site builds, the post-build enrichment automatically upgrades `<img>` tags to `<picture>` with WebP srcset when variants exist:

```html
<!-- Input (in markdown/content) -->
<img src="/uploads/hero-a1b2.jpg" alt="Hero image">

<!-- Output (after build) -->
<picture>
  <source srcset="/uploads/hero-a1b2-400w.webp 400w, /uploads/hero-a1b2-800w.webp 800w, /uploads/hero-a1b2-1200w.webp 1200w" type="image/webp" sizes="(max-width: 800px) 100vw, 800px">
  <img src="/uploads/hero-a1b2.jpg" alt="Hero image">
</picture>
```

This happens automatically — no code changes needed. The original `<img>` is preserved as fallback for older browsers.

## Uploading Images

Images are uploaded via the admin UI media library or the `/api/upload` endpoint:

```typescript
const formData = new FormData();
formData.append('file', file);  // Key MUST be "file" (singular)
formData.append('folder', 'blog');  // Optional subfolder

const response = await fetch('/api/upload', { method: 'POST', body: formData });
const { url } = await response.json();
// url = "/uploads/blog/hero-a1b2.jpg"
// WebP variants are generated automatically
```

## Using next/image with CMS Images

Configure `remotePatterns` in `next.config.ts` to allow CMS image domains:

```typescript
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'example.com', pathname: '/uploads/**' },
    ],
  },
};
```

## Responsive Images in Static Sites

For static sites (not Next.js), use the `<picture>` element with WebP variants:

```typescript
function responsiveImage(src: string, alt: string): string {
  const base = src.replace(/\.[^.]+$/, "");
  const widths = [400, 800, 1200, 1600];
  const srcset = widths
    .map(w => `${base}-${w}w.webp ${w}w`)
    .join(", ");
  return `<picture>
    <source srcset="${srcset}" type="image/webp" sizes="(max-width: 800px) 100vw, 800px">
    <img src="${src}" alt="${alt}" loading="lazy">
  </picture>`;
}
```

## Image Optimization Best Practices

1. **Originals are preserved** — the CMS never modifies uploaded files
2. **WebP variants are automatic** — no manual optimization needed
3. **Alt-text is AI-generated** — review and edit in the Media lightbox or editor
4. **Use `priority`/`loading="eager"` for above-the-fold images**
5. **Use `sizes` attribute** — prevents browsers from downloading oversized variants
6. **EXIF GPS data** — available in the Media lightbox for geo-tagged photos
