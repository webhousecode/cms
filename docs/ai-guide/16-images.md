<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Image Handling

## 5. Image Handling

### How Image Fields Work

Image fields store a URL string. The value is typically `/uploads/filename.jpg` for locally uploaded files, or an external URL for remote images.

```json
{
  "data": {
    "heroImage": "/uploads/1710547200-a1b2c3.jpg",
    "gallery": [
      "/uploads/1710547201-d4e5f6.jpg",
      "/uploads/1710547202-g7h8i9.jpg"
    ]
  }
}
```

### Uploading Images

Images are uploaded via the admin UI media library or the `/api/upload` endpoint:

```typescript
// Programmatic upload
const formData = new FormData();
formData.append('file', file);  // Key MUST be "file" (singular)
formData.append('folder', 'blog');  // Optional subfolder

const response = await fetch('/api/upload', { method: 'POST', body: formData });
const { url } = await response.json();
// url = "/uploads/blog/1710547200-a1b2c3.jpg"
```

### Using next/image with CMS Images

Configure `remotePatterns` in `next.config.ts` to allow CMS image domains:

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Local uploads served from same origin
        protocol: 'https',
        hostname: 'example.com',
        pathname: '/uploads/**',
      },
      {
        // If using external image CDN
        protocol: 'https',
        hostname: '*.cloudinary.com',
      },
    ],
  },
};

export default nextConfig;
```

### Responsive Images Pattern

```typescript
// components/cms-image.tsx
import Image from 'next/image';

interface CmsImageProps {
  src: string | undefined | null;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
  sizes?: string;
}

export function CmsImage({
  src,
  alt,
  width = 1200,
  height = 630,
  priority = false,
  className,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
}: CmsImageProps) {
  if (!src) return null;

  // Local uploads: use next/image for optimization
  if (src.startsWith('/uploads/')) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className={className}
        sizes={sizes}
      />
    );
  }

  // External URLs: use next/image if domain is in remotePatterns, otherwise <img>
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
      sizes={sizes}
    />
  );
}
```

### Image Optimization Best Practices

1. **Always provide `sizes`** — Without it, next/image generates srcsets for all viewport widths, wasting bandwidth.
2. **Use `priority` for above-the-fold images** — Hero images, cover photos, and any image visible on initial load.
3. **Set width/height to the intrinsic dimensions** — This prevents layout shift (CLS). If unknown, use the aspect ratio you want.
4. **Prefer WebP/AVIF** — next/image auto-converts if using the default loader. For external CDNs, configure format negotiation.
5. **Lazy load below-the-fold images** — next/image lazy-loads by default (except `priority` images).
