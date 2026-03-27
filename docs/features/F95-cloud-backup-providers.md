# F95 — Cloud Backup Providers

> Pluggable cloud storage destinations for CMS backups — pCloud, Scaleway, Backblaze B2, Cloudflare R2, Hetzner — with focus on free tiers and EU/GDPR compliance.

## Problem

F27 (Backup & Restore) creates zip snapshots but only supports `local`, `s3`, and `supabase` as destinations. This misses:

1. **Free tiers** — Scaleway gives 75 GB free, Backblaze B2 and Cloudflare R2 give 10 GB free, pCloud gives 10 GB free. Most CMS backups are <1 GB — free storage covers years of backups.
2. **EU sovereignty** — many users need GDPR-compliant backup destinations in EU data centers. pCloud (Luxembourg), Scaleway (Paris/Amsterdam), Hetzner (Germany) satisfy this.
3. **Consumer cloud** — pCloud and MEGA are accessible to non-technical users who already have accounts.
4. **Cost at scale** — Backblaze B2 at $0.006/GB/mo is 4x cheaper than S3.

## Research: Provider Comparison

| Provider | Region | Free tier | API | Cost/GB/mo | GDPR |
|----------|--------|-----------|-----|-----------|------|
| **Scaleway** | EU (Paris, Amsterdam) | **75 GB** | S3-compatible | €0.01 | Yes (French) |
| **Cloudflare R2** | Global + EU | **10 GB** | S3-compatible | $0.015 | EU controls available |
| **Backblaze B2** | US + EU (Amsterdam) | **10 GB** | S3-compatible | $0.006 | EU region available |
| **pCloud** | EU (Luxembourg) | **10 GB** | REST + WebDAV | $4.99/500GB | Yes (Luxembourg) |
| **Hetzner Object** | EU (Germany) | None | S3-compatible | €4.99 flat/1TB | Yes (German) |
| **Hetzner Storage Box** | EU (Germany) | None | WebDAV/rsync/SFTP | €3.81 flat/1TB | Yes (German) |
| **Filen** | EU (Germany) | **10 GB** | REST (E2EE) | ~€1/mo | Yes (German) |
| **MEGA** | EU servers | **20 GB** | REST (E2EE) | €4.99/400GB | Partial (NZ company) |

**Key insight:** S3-compatible API is supported by Scaleway, Cloudflare R2, Backblaze B2, Hetzner Object, and Wasabi. A single S3 adapter covers 5 providers. pCloud and Hetzner Storage Box need separate adapters (REST/WebDAV).

## Solution

A **backup provider adapter system** that extends F27 with pluggable cloud destinations. Three adapter types:

1. **S3-compatible** (one adapter, many providers) — Scaleway, R2, B2, Hetzner Object, AWS S3
2. **pCloud** — dedicated adapter using pCloud REST API
3. **WebDAV** — generic adapter covering Hetzner Storage Box, pCloud WebDAV, and any WebDAV server

Configuration in Site Settings → Backup tab. Provider selection with guided setup (API keys, bucket name, region). Test connection button.

## Technical Design

### 1. Backup Provider Interface

```typescript
// packages/cms-admin/src/lib/backup/providers/types.ts

export interface BackupProvider {
  readonly id: string;         // "s3", "pcloud", "webdav", "local"
  readonly name: string;       // "Scaleway (S3)", "pCloud", etc.
  readonly region?: string;    // "EU", "US", "Global"

  /** Upload a backup zip to the provider */
  upload(filename: string, data: Buffer): Promise<{ url: string; size: number }>;

  /** List available backups */
  list(): Promise<BackupFile[]>;

  /** Download a specific backup */
  download(filename: string): Promise<Buffer>;

  /** Delete a backup */
  delete(filename: string): Promise<void>;

  /** Test connectivity and permissions */
  test(): Promise<{ ok: boolean; message: string; freeSpace?: number }>;
}

export interface BackupFile {
  filename: string;
  size: number;
  lastModified: string;
}
```

### 2. S3-Compatible Adapter (covers 5+ providers)

```typescript
// packages/cms-admin/src/lib/backup/providers/s3.ts

import { S3Client, PutObjectCommand, ListObjectsV2Command,
         GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export interface S3ProviderConfig {
  provider: "scaleway" | "r2" | "b2" | "hetzner" | "s3" | "custom";
  endpoint: string;          // e.g. "s3.fr-par.scw.cloud"
  region: string;            // e.g. "fr-par"
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;           // folder prefix, e.g. "cms-backups/"
}

// Provider presets (user selects provider, we fill endpoint + region)
const S3_PRESETS: Record<string, Partial<S3ProviderConfig>> = {
  scaleway: {
    endpoint: "https://s3.fr-par.scw.cloud",
    region: "fr-par",
  },
  r2: {
    // endpoint set per-account: https://{accountId}.r2.cloudflarestorage.com
    region: "auto",
  },
  b2: {
    // endpoint set per-bucket: https://s3.{region}.backblazeb2.com
    region: "eu-central-003",  // Amsterdam
  },
  hetzner: {
    endpoint: "https://fsn1.your-objectstorage.com",
    region: "fsn1",
  },
};

export class S3BackupProvider implements BackupProvider {
  readonly id = "s3";
  readonly name: string;
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(config: S3ProviderConfig) {
    this.name = `${config.provider} (S3)`;
    this.bucket = config.bucket;
    this.prefix = config.prefix ?? "cms-backups/";
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,  // required for most S3-compatible providers
    });
  }

  async upload(filename: string, data: Buffer) { /* PutObjectCommand */ }
  async list() { /* ListObjectsV2Command */ }
  async download(filename: string) { /* GetObjectCommand */ }
  async delete(filename: string) { /* DeleteObjectCommand */ }
  async test() { /* HeadBucket + PutObject test file */ }
}
```

### 3. pCloud Adapter

```typescript
// packages/cms-admin/src/lib/backup/providers/pcloud.ts

export interface PCloudConfig {
  accessToken: string;       // OAuth2 token
  folderId?: number;         // backup folder ID (auto-created if not set)
  euRegion: boolean;         // true = eapi.pcloud.com, false = api.pcloud.com
}

export class PCloudBackupProvider implements BackupProvider {
  readonly id = "pcloud";
  readonly name = "pCloud";
  readonly region = "EU";
  private baseUrl: string;

  constructor(private config: PCloudConfig) {
    this.baseUrl = config.euRegion
      ? "https://eapi.pcloud.com"
      : "https://api.pcloud.com";
  }

  async upload(filename: string, data: Buffer) {
    // POST /uploadfile with multipart form data
    const fd = new FormData();
    fd.append("file", new Blob([data]), filename);
    const res = await fetch(
      `${this.baseUrl}/uploadfile?folderid=${this.config.folderId}&auth=${this.config.accessToken}`,
      { method: "POST", body: fd },
    );
    const result = await res.json();
    return { url: result.metadata?.[0]?.path ?? filename, size: data.length };
  }

  async list() {
    // GET /listfolder
    const res = await fetch(
      `${this.baseUrl}/listfolder?folderid=${this.config.folderId}&auth=${this.config.accessToken}`,
    );
    const data = await res.json();
    return (data.metadata?.contents ?? [])
      .filter((f: any) => f.name.endsWith(".zip"))
      .map((f: any) => ({
        filename: f.name,
        size: f.size,
        lastModified: f.modified,
      }));
  }

  async download(filename: string) { /* GET /getfilelink + fetch content */ }
  async delete(filename: string) { /* GET /deletefolderrecursive or /deletefile */ }
  async test() { /* GET /userinfo to verify token + check quota */ }
}
```

### 4. WebDAV Adapter

```typescript
// packages/cms-admin/src/lib/backup/providers/webdav.ts

import { createClient, WebDAVClient } from "webdav";

export interface WebDAVConfig {
  url: string;               // e.g. "https://webdav.pcloud.com" or Hetzner Storage Box URL
  username: string;
  password: string;
  path?: string;             // remote path, e.g. "/cms-backups/"
}

export class WebDAVBackupProvider implements BackupProvider {
  readonly id = "webdav";
  readonly name: string;
  private client: WebDAVClient;
  private remotePath: string;

  constructor(config: WebDAVConfig) {
    this.name = `WebDAV (${new URL(config.url).hostname})`;
    this.remotePath = config.path ?? "/cms-backups/";
    this.client = createClient(config.url, {
      username: config.username,
      password: config.password,
    });
  }

  async upload(filename: string, data: Buffer) {
    await this.client.putFileContents(`${this.remotePath}${filename}`, data);
    return { url: `${this.remotePath}${filename}`, size: data.length };
  }

  async list() {
    const items = await this.client.getDirectoryContents(this.remotePath);
    return (Array.isArray(items) ? items : items.data)
      .filter(f => f.basename.endsWith(".zip"))
      .map(f => ({
        filename: f.basename,
        size: f.size ?? 0,
        lastModified: f.lastmod ?? "",
      }));
  }

  async download(filename: string) { /* getFileContents */ }
  async delete(filename: string) { /* deleteFile */ }
  async test() { /* getDirectoryContents("/") — verifies connection */ }
}
```

### 5. Provider Factory

```typescript
// packages/cms-admin/src/lib/backup/providers/index.ts

export function createBackupProvider(config: BackupProviderConfig): BackupProvider {
  switch (config.type) {
    case "s3":     return new S3BackupProvider(config.s3!);
    case "pcloud": return new PCloudBackupProvider(config.pcloud!);
    case "webdav": return new WebDAVBackupProvider(config.webdav!);
    case "local":  return new LocalBackupProvider(config.local!);
    default:       throw new Error(`Unknown backup provider: ${config.type}`);
  }
}
```

### 6. Backup Config Extension

```typescript
// Extend BackupConfig in F27

export interface BackupProviderConfig {
  type: "local" | "s3" | "pcloud" | "webdav";

  s3?: S3ProviderConfig;
  pcloud?: PCloudConfig;
  webdav?: WebDAVConfig;
  local?: { dir: string };
}

export interface BackupConfig {
  // ...existing F27 fields
  provider: BackupProviderConfig;  // replaces destination: 'local' | 's3' | 'supabase'
}
```

### 7. Admin UI — Backup Provider Settings

In Site Settings → Backup tab:

```
BACKUP DESTINATION

Provider: [Scaleway (75GB free, EU) ▾]

  ┌─────────────────────────────────────────────┐
  │ Scaleway Object Storage (S3-compatible)      │
  │                                               │
  │ Access Key: [________________]                │
  │ Secret Key: [●●●●●●●●●●●●●●]                │
  │ Bucket:     [cms-backups    ]                │
  │ Region:     [fr-par ▾]                       │
  │ Prefix:     [webhouse-site/ ]                │
  │                                               │
  │ [Test connection]  ✅ Connected (68 GB free)  │
  └─────────────────────────────────────────────┘
```

Provider dropdown groups:

```
── EU Providers (GDPR) ──
  Scaleway (75 GB free, S3, Paris)
  pCloud (10 GB free, Luxembourg)
  Hetzner Object Storage (S3, Germany)
  Hetzner Storage Box (WebDAV/rsync, Germany)
  Filen (10 GB free, E2EE, Germany)

── Global Providers ──
  Cloudflare R2 (10 GB free, S3, no egress fees)
  Backblaze B2 (10 GB free, S3, EU available)
  AWS S3

── Other ──
  WebDAV (custom server)
  Local filesystem
```

### 8. Recommended Defaults

For new users (in CLAUDE.md / scaffolder guidance):

| Use case | Recommended | Why |
|----------|-------------|-----|
| **EU agency, free** | Scaleway | 75 GB free, S3 API, GDPR, French company |
| **Personal/hobby, free** | Backblaze B2 or R2 | 10 GB free, S3 API, easy setup |
| **pCloud user** | pCloud | Already has an account, WebDAV or REST |
| **Self-hosted** | Hetzner Storage Box | €3.81/mo for 1 TB, rsync/WebDAV |
| **Zero egress concern** | Cloudflare R2 | No download fees ever |

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/backup/providers/types.ts` — **new** provider interface
- `packages/cms-admin/src/lib/backup/providers/s3.ts` — **new** S3-compatible adapter
- `packages/cms-admin/src/lib/backup/providers/pcloud.ts` — **new** pCloud adapter
- `packages/cms-admin/src/lib/backup/providers/webdav.ts` — **new** WebDAV adapter
- `packages/cms-admin/src/lib/backup/providers/index.ts` — **new** factory
- `packages/cms-admin/src/lib/backup/types.ts` — **modified** (extend BackupConfig with provider config)
- `packages/cms-admin/src/lib/backup/service.ts` — **modified** (use provider adapter instead of hardcoded destination)
- `packages/cms-admin/package.json` — add `@aws-sdk/client-s3`, `webdav`

### Downstream dependents

`backup/types.ts` — new file (F27 not yet implemented), no existing dependents.
`backup/service.ts` — new file (F27 not yet implemented), no existing dependents.

Both files are part of F27 which is not yet shipped. This feature extends F27's design before it's built — no migration needed.

### Blast radius
- `@aws-sdk/client-s3` is a large dependency (~2 MB). Should be dynamically imported (only loaded when S3 provider is configured).
- `webdav` npm package adds ~200 KB. Also dynamically imported.
- pCloud adapter uses `fetch` only — zero additional dependencies.
- Provider credentials are sensitive — must be stored encrypted or in environment variables.

### Breaking changes
- None — F27 is not yet implemented. This extends the design before build.

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] S3 adapter uploads/lists/downloads from Scaleway free tier
- [ ] S3 adapter works with Backblaze B2 endpoint
- [ ] S3 adapter works with Cloudflare R2 endpoint
- [ ] pCloud adapter authenticates and uploads via REST API
- [ ] WebDAV adapter connects to Hetzner Storage Box
- [ ] Test connection button returns free space and status
- [ ] Provider credentials stored securely (not in plaintext JSON)
- [ ] Dynamic import: `@aws-sdk/client-s3` only loaded when S3 selected

## Implementation Steps

1. Create `packages/cms-admin/src/lib/backup/providers/types.ts` — BackupProvider interface
2. Create S3 adapter with provider presets (Scaleway, R2, B2, Hetzner)
3. Create pCloud adapter using REST API (EU endpoint)
4. Create WebDAV adapter using `webdav` npm package
5. Create provider factory with dynamic imports
6. Extend `BackupConfig` type with `BackupProviderConfig`
7. Build provider selection UI in Site Settings → Backup tab
8. Add "Test connection" button with free space display
9. Test with Scaleway free tier (75 GB, EU)
10. Test with Backblaze B2 free tier (10 GB, EU Amsterdam)
11. Test with pCloud free tier (10 GB, Luxembourg)


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- F27 (Backup & Restore) — this extends F27 with cloud destinations
- `@aws-sdk/client-s3` — for S3-compatible providers (dynamically imported)
- `webdav` — for WebDAV providers (dynamically imported)

## Effort Estimate

**Medium** — 3-4 days

- Day 1: Provider interface + S3 adapter with presets (covers 5 providers)
- Day 2: pCloud adapter + WebDAV adapter
- Day 3: Settings UI (provider picker, credentials, test connection)
- Day 4: Test with real providers (Scaleway, B2, pCloud free tiers)
