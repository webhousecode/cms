# F131 — Media CDN Offloading

> Upload large media files (video, high-res images, archives) to S3-compatible cloud storage and serve via CDN URL — reusing existing F95 backup credentials.

## Problem

Media files stored in local `uploads/` break GitHub Pages deploys (100MB limit, 403 rate limits on 2000+ files), bloat git repos, and slow down Beam transfers. Video files (.MOV, .mp4) are 50-200MB each and fundamentally don't belong in a static hosting pipeline.

Today the CMS works around this by skipping large files during GHP deploy — but the files then aren't available on the live site at all.

## Solution

When a file exceeds a configurable threshold (default 5MB) or matches a media type configured for offloading (e.g. all video), the upload API pushes it to an S3-compatible bucket and stores the CDN URL in the document field instead of a local `/uploads/` path. The local file is kept as a cache but the canonical reference is the CDN URL.

Reuses the **existing F95 S3 adapter** (`@aws-sdk/client-s3`, already a devDependency) and the **existing cloud storage credentials** from Site Settings → Automation → Cloud Backup. No new credentials to configure — if backup is configured, media offloading works.

## Technical Design

### 1. Configuration

```typescript
// In SiteConfig (site-config.ts)
export interface SiteConfig {
  // ...existing fields
  /** F131 — files above this size auto-offload to cloud. 0 = disabled. */
  mediaOffloadThresholdMb?: number;  // default: 5
  /** File extensions to always offload regardless of size. */
  mediaOffloadExtensions?: string[]; // default: [".mov", ".mp4", ".webm", ".avi", ".zip"]
  /** CDN base URL. If empty, uses the S3 endpoint directly. */
  mediaCdnBaseUrl?: string;          // e.g. "https://media.example.com"
  /** S3 bucket path prefix for media. */
  mediaOffloadPrefix?: string;       // default: "media/{siteId}/"
}
```

No new credentials needed — reuses `cloudBackupS3Endpoint`, `cloudBackupS3Bucket`, `cloudBackupS3AccessKeyId`, `cloudBackupS3SecretAccessKey`, `cloudBackupS3Region` from existing F95 config.

### 2. Upload Flow

```
User uploads file via /api/upload
    ↓
Check: size > threshold OR extension in offloadExtensions?
    ↓ YES                              ↓ NO
Upload to S3 bucket                    Store locally as today
    ↓                                      ↓
Store CDN URL in document field        Store /uploads/path
    ↓
Keep local copy in uploads/ as cache
(for preview, thumbnail generation)
```

### 3. Media Service Extension

```typescript
// packages/cms-admin/src/lib/media/offload.ts

export async function offloadToCloud(
  filePath: string,
  siteId: string,
  config: SiteConfig,
): Promise<{ cdnUrl: string; s3Key: string }>;

export function shouldOffload(
  filePath: string,
  fileSize: number,
  config: SiteConfig,
): boolean;

export async function getCloudUrl(s3Key: string, config: SiteConfig): Promise<string>;
```

### 4. Upload API Changes

```typescript
// packages/cms-admin/src/app/api/upload/route.ts — modified

// After saving file locally:
if (shouldOffload(filePath, stat.size, siteConfig)) {
  const { cdnUrl } = await offloadToCloud(filePath, siteId, siteConfig);
  // Return CDN URL instead of local path
  return NextResponse.json({ url: cdnUrl, offloaded: true });
}
// Otherwise return local path as today
return NextResponse.json({ url: `/uploads/${filename}` });
```

### 5. Build Pipeline Integration

During `cms build`, resolve media URLs:
- Local `/uploads/` paths → copy to dist/ (current behavior)
- CDN URLs (`https://...`) → pass through as-is (no file copy needed)

This means offloaded media doesn't bloat the dist/ directory or the GHP deploy.

### 6. Admin UI

Site Settings → Media section:
- Toggle: "Offload large files to cloud storage"
- Threshold: "Offload files larger than [5] MB"
- Extensions: tag input for always-offload extensions
- CDN base URL (optional, defaults to S3 endpoint)
- Status: "Using cloud storage from Backup settings" or "Not configured — set up cloud storage in Automation tab first"

Media library:
- Cloud badge on offloaded files (same pattern as backup cloud/local badges)
- "Offload" action on existing large files (batch offload)

## Impact Analysis

### Files created (new)
- `packages/cms-admin/src/lib/media/offload.ts` — offload logic
- `packages/cms-admin/src/lib/__tests__/media-offload.test.ts` — tests

### Files modified
- `packages/cms-admin/src/app/api/upload/route.ts` — check + offload after save
- `packages/cms-admin/src/lib/site-config.ts` — add offload config fields
- `packages/cms-admin/src/components/settings/general-settings-panel.tsx` — add Media offloading UI
- `packages/cms/src/build/pipeline.ts` — skip copying CDN-URL media to dist/

### Downstream dependents for modified files

**`src/app/api/upload/route.ts`** — no downstream dependents (API endpoint).

**`src/lib/site-config.ts`** — imported by 30+ files. New optional fields are additive — no changes needed in dependents.

**`src/components/settings/general-settings-panel.tsx`** — no downstream dependents (leaf component).

**`packages/cms/src/build/pipeline.ts`** — imported by CLI. Additive change (skip CDN URLs in media copy).

### Blast radius
- Upload API returns CDN URL instead of local path → existing content referencing local paths continues to work (local files still exist). New uploads get CDN URLs.
- Build pipeline: CDN URLs pass through. No regression for local files.
- Media library: cloud badge is visual only, doesn't affect functionality.

### Breaking changes
None. All config fields are optional with sensible defaults. Existing local uploads continue to work.

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] File below threshold → stored locally (existing behavior)
- [ ] File above threshold → uploaded to S3 + CDN URL returned
- [ ] Video file → always offloaded regardless of size
- [ ] CDN URL in document field → renders correctly in preview
- [ ] `cms build` → CDN URLs not copied to dist/ (no bloat)
- [ ] GHP deploy → no large file errors
- [ ] No S3 credentials → offloading disabled, local storage as fallback
- [ ] Existing local uploads still serve correctly

## Implementation Steps

1. Add offload config fields to `SiteConfig` interface
2. Create `lib/media/offload.ts` — `shouldOffload()` + `offloadToCloud()` using existing S3 adapter pattern
3. Modify upload API to call offload after local save
4. Add offload settings UI in Site Settings → Media section
5. Modify build pipeline to skip CDN-URL media
6. Add cloud badge to media library for offloaded files
7. "Offload existing" batch action for large files already uploaded
8. Tests
9. Docs article

## Dependencies

- F95 (Cloud Backup Providers) — Done. Provides S3 adapter + credentials infrastructure.
- F44 (Media Processing) — Done. Upload pipeline to hook into.

## Effort Estimate

**Medium** — 3-4 days

- Day 1: offload service + upload API integration + tests
- Day 2: build pipeline skip + settings UI
- Day 3: media library badges + batch offload + docs
- Day 4: polish, edge cases, GHP deploy verification
