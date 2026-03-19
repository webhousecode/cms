# F25 — Storage Buckets

> Configurable media storage backends with upload API abstraction and image optimization.

## Problem

Media files (images, audio, video) are stored on the local filesystem. There is no CDN integration, no cloud storage option, no image optimization, and no storage quota management. Sites deployed to serverless platforms cannot persist uploaded media.

## Solution

A storage bucket abstraction that supports local filesystem, AWS S3, Supabase Storage, Cloudflare R2, and a custom WebHouse.Buckets service. Includes an upload API, CDN URL generation, image optimization/resizing, and quota tracking.

## Technical Design

### Bucket Configuration

```typescript
// packages/cms/src/schema/types.ts — extend CmsConfig

export interface BucketConfig {
  adapter: 'local' | 's3' | 'supabase' | 'r2' | 'webhouse';
  local?: {
    uploadDir: string;       // default: 'public/uploads'
    publicPrefix: string;    // default: '/uploads'
  };
  s3?: {
    bucket: string;
    region: string;          // default: 'eu-north-1' (Stockholm)
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;       // for S3-compatible providers
    publicUrl?: string;      // CDN URL prefix
  };
  supabase?: {
    projectUrl: string;
    serviceRoleKey: string;
    bucket: string;          // default: 'media'
  };
  r2?: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicUrl: string;       // R2 custom domain
  };
  imageOptimization?: {
    enabled: boolean;
    maxWidth?: number;       // default: 2048
    quality?: number;        // default: 80
    formats?: Array<'webp' | 'avif' | 'jpeg'>;
    sizes?: number[];        // responsive sizes, e.g. [320, 640, 1024, 2048]
  };
  quota?: {
    maxFileSizeMb: number;   // default: 10
    maxTotalGb: number;      // default: 1
  };
}

// In CmsConfig:
bucket?: BucketConfig;
```

### Bucket Adapter Interface

```typescript
// packages/cms/src/storage/bucket.ts

export interface BucketAdapter {
  upload(file: Buffer, options: {
    filename: string;
    contentType: string;
    folder?: string;
  }): Promise<{ url: string; key: string; size: number }>;

  delete(key: string): Promise<void>;

  list(folder?: string): Promise<Array<{
    key: string;
    url: string;
    size: number;
    contentType: string;
    lastModified: string;
  }>>;

  getSignedUrl(key: string, expiresIn?: number): Promise<string>;

  getUsage(): Promise<{ totalBytes: number; fileCount: number }>;
}
```

### Image Optimization

```typescript
// packages/cms/src/storage/image-optimizer.ts

import sharp from 'sharp';

export class ImageOptimizer {
  async optimize(input: Buffer, options: {
    maxWidth: number;
    quality: number;
    format: 'webp' | 'avif' | 'jpeg';
  }): Promise<Buffer>;

  async generateResponsiveSizes(input: Buffer, sizes: number[]): Promise<Map<number, Buffer>>;
}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload` | Upload file (existing, extend with bucket support) |
| `DELETE` | `/api/media/[key]` | Delete file |
| `GET` | `/api/media` | List files |
| `GET` | `/api/media/usage` | Storage usage stats |

## Impact Analysis

### Files affected
- `packages/cms/src/storage/bucket.ts` — new BucketAdapter interface
- `packages/cms/src/storage/image-optimizer.ts` — new image optimizer
- `packages/cms/src/schema/types.ts` — add `bucket` config to `CmsConfig`
- `packages/cms-admin/src/app/api/upload/route.ts` — extend upload to use bucket adapter
- `packages/cms-admin/package.json` — add `sharp`, `@aws-sdk/client-s3` dependencies

### Blast radius
- Upload API is used by media manager, editor, and interactives — changes affect all upload flows
- `CmsConfig` type extension must be optional

### Breaking changes
- None — local filesystem remains the default

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Local bucket adapter wraps current upload logic
- [ ] S3 adapter uploads and retrieves files
- [ ] Image optimization produces WebP variants
- [ ] Quota enforcement rejects oversized uploads

## Implementation Steps

1. Create `packages/cms/src/storage/bucket.ts` with `BucketAdapter` interface
2. Implement `LocalBucketAdapter` (wraps current upload logic)
3. Implement `S3BucketAdapter` using `@aws-sdk/client-s3`
4. Implement `SupabaseBucketAdapter` using `@supabase/storage-js`
5. Implement `R2BucketAdapter` (S3-compatible with Cloudflare specifics)
6. Create `packages/cms/src/storage/image-optimizer.ts` using `sharp`
7. Add `bucket` config to `CmsConfig`
8. Update existing upload API to use bucket adapter
9. Add responsive image generation on upload
10. Build storage usage dashboard in admin settings
11. Add quota enforcement (reject uploads over limit)

## Dependencies

- `sharp` — for image optimization
- `@aws-sdk/client-s3` — for S3/R2 adapters
- `@supabase/storage-js` — for Supabase adapter

## Effort Estimate

**Large** — 5-6 days
