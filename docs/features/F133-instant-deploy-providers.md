# F133 — Instant Deploy Providers

**Status:** Planned
**Created:** 2026-04-16
**Extends:** F12 (One-Click Publish), F125 (ICD HMAC signing pattern)

## Problem

The existing `flyio` provider rebuilds the entire Docker image on every publish. For a static site with 10 kB of changed HTML, that means a ~30–120 s rebuild + push + release cycle. Unacceptable for "gem tekst → live" UX. Goal: **save in CMS admin → live in under 1 s** for typical edits, regardless of hosting target.

The existing `cloudflare` provider is only a generic webhook relay — it does not actually talk to Cloudflare Pages. Users who want real Cloudflare Pages integration must set up a separate build pipeline.

## Solution

Add two new providers alongside the existing ones. Existing providers stay for backwards compatibility — relabeled for clarity.

### 1. `flyio-live` — Fly.io Live (volume-based incremental sync)

- Docker image contains only the web-server + sync endpoint (immutable infrastructure)
- Site content lives on a mounted Fly Volume at `/srv/current`
- CMS admin publish diffs local build output vs remote manifest, pushes only changed files
- HMAC-signed requests reuse the F125 ICD pattern
- Typical edit propagates in 200 ms–1 s

### 2. `cloudflare-pages` — Cloudflare Pages (direct API)

- Uses Cloudflare Pages Direct Upload API
- Global edge network (300+ PoPs)
- Config: account ID, project name, API token
- First-deploy creates the Pages project; subsequent create new deployments
- Free tier covers most small sites

### Provider matrix after F133

| Value | Label | Mode |
|---|---|---|
| `off` | Off | Disabled |
| `vercel` | Vercel | Webhook |
| `netlify` | Netlify | Webhook |
| `cloudflare` | Cloudflare (webhook) | Webhook (legacy — was mislabeled "Cloudflare Pages") |
| **`cloudflare-pages`** | **Cloudflare Pages** | **Direct API upload** (new) |
| `flyio` | Fly.io (rebuild) | Docker rebuild every deploy |
| **`flyio-live`** | **Fly.io Live** | **Volume sync** (new) |
| `github-pages` | GitHub Pages | Git commit + Pages build |
| `custom` | Custom webhook | Webhook |

## Technical Design

### Fly Live sync-endpoint server

Single Bun + Hono server inside the Docker image. Serves static files AND handles HMAC-authenticated `/_icd/*` endpoints.

```
GET  /_icd/manifest           → { files: { "path/foo.html": "sha256:...", ... } }
POST /_icd/batch              → apply diff (creates, updates, deletes) atomically
GET  /_icd/health             → { ok: true, version }
POST /_icd/rollback           → swap to previous deploy (keep last 5)
```

Auth: `X-CMS-Signature: sha256=<hmac>` over request body + `X-CMS-Timestamp` (reject if >5 min skew).

Atomic deploys via COW symlink swap:
1. Copy-by-hardlink current `/srv/current/` → `/srv/deploys/<id>/`
2. Write changed/added files into `/srv/deploys/<id>/`
3. Delete removed files from `/srv/deploys/<id>/`
4. `ln -sfn /srv/deploys/<id> /srv/current`
5. Clean up deploys older than last 5

Hardlinks make this effectively free even for 10k+ files.

### Cloudflare Pages direct API

```
POST /accounts/:id/pages/projects                  (first deploy — create project)
POST /accounts/:id/pages/projects/:name/deployments (multipart form: files[])
```

Uses the Direct Upload endpoint. Uploads only files (no git), same as `wrangler pages deploy`. No wrangler CLI dependency.

### Config additions to `SiteConfig`

```typescript
// Fly Live
deployFlyLiveAppName: string;      // fly app
deployFlyLiveRegion: string;        // arn, fra, iad...
deployFlyLiveVolumeName: string;    // "site_data" by default
deployFlyLiveSyncSecret: string;    // HMAC secret (auto-generated)

// Cloudflare Pages (direct)
deployCloudflareAccountId: string;
deployCloudflareProjectName: string;
deployCloudflareApiToken: string;   // Pages:Edit token
```

### Infra-change path (Fly Live)

99% of deploys are pure content sync. But occasionally the container image needs rebuilding:
- Caddy/Bun base image updates
- Sync-endpoint code changes (new admin ship)
- Caddyfile changes (redirects, headers)

A separate "Rebuild infrastructure" button in Deploy Settings triggers the full Docker rebuild path (reuses existing `flyio` rebuild logic). Volume data is preserved — only the web-server image changes.

## Impact Analysis

### What can break

- **Manifest computation**: must be deterministic (normalized paths, binary-safe SHA-256). Bug here = missing files in diff.
- **Atomic swap failure**: if the symlink swap races a request, user gets 404. Mitigation: atomic `rename(2)` call on the symlink, not a manual `rm + ln`.
- **Volume full**: Fly volumes have fixed size. Monitor and surface in UI.
- **Orphan deploys**: if CMS admin dies mid-deploy, intermediate `/srv/deploys/<id>/` folders are left. Housekeeping deletes any deploy dir not referenced by `/srv/current` after 24h.
- **Cloudflare token leakage**: tokens are stored in site-config.json. Ensure site-config files are not committed to git (filesystem adapter) or have encrypted-at-rest field marking.

### Security

- HMAC-SHA256 on ALL `/_icd/*` endpoints. Reject requests with timestamp skew > 5 min.
- Rate-limit `/_icd/*` to prevent disk exhaustion attacks.
- Sync-endpoint listens on the same port as Caddy (8080) — no extra surface. Separate path prefix.
- Secret rotation: "Regenerate sync secret" button wipes old, writes new to Fly Secrets, container rolls.

## Implementation Steps

1. **Sync-endpoint server** (`packages/cms-admin/src/lib/deploy/fly-live-assets/`)
   - `server.ts` — Bun + Hono static server + `/_icd/*` routes
   - `Dockerfile` — oven/bun base, COPY server, EXPOSE 8080
   - `fly.toml.template` — machine config, volume mount
   - Unit tests for manifest diff, HMAC verify, atomic swap

2. **Provider: `flyio-live`** (`deploy-service.ts`)
   - `flyLiveBuildAndDeploy()` — handles first-deploy AND incremental
   - First-deploy: `flyctl apps create`, `flyctl volumes create`, `flyctl secrets set`, `flyctl deploy`
   - Subsequent: local build → GET manifest → POST batch
   - Deploy log entries record which mode was used

3. **Provider: `cloudflare-pages`** (`deploy-service.ts`)
   - `cloudflarePagesBuildAndDeploy()` — Direct Upload API
   - First-deploy: create project if missing
   - Subsequent: multipart upload to `/deployments`

4. **SiteConfig + UI**
   - Extend `deployProvider` union, add config fields
   - Update dropdown labels ("Fly.io (rebuild)", "Cloudflare (webhook)", "Fly.io Live", "Cloudflare Pages")
   - Provider-specific form panels + HelpCards

5. **Docs**
   - `deploy-fly-live.json` + DA twin
   - `deploy-cloudflare-pages.json` + DA twin
   - Cross-reference from `/docs/instant-content-deployment`
   - Honest comparison table (speed/cost/region) on both pages

## Dependencies

- F12 (One-Click Publish) — provider framework exists
- F125 (ICD signing) — HMAC pattern reused
- `crypto.createHmac` (Node built-in) — already used in webhook-dispatch.ts
- `@hono/node-server` or Bun runtime — already a stack primitive
- `flyctl` CLI — already used by existing `flyio` provider

## Effort Estimate

- Sync-endpoint server: ~1 day
- `flyio-live` provider logic: ~1 day
- `cloudflare-pages` provider: ~0.5 day (simpler API)
- UI + config: ~0.5 day
- Docs (EN + DA × 2 pages): ~0.5 day
- Tests + manual E2E on a real Fly app: ~0.5 day

**Total: ~4 days.** Phase-1 ships Volume-only (single-region). Multi-region volume replication and R2-backed mode deferred until a real user asks.

## Out of Scope (for now)

- **R2-backed storage**: analysis showed Fly+R2 is slower than either Volume-only (single-region EU) or Cloudflare Pages (global). Not building unless multi-region Fly is requested by a real user.
- **Preview deploys per branch**: could layer on later using namespaced volume paths.
- **Rollback UI**: `/\_icd/rollback` endpoint exists, but a dedicated UI ships later.
- **Self-hosted sync-endpoint** (for users on their own Docker host, not Fly): same server code would run on any Docker host, but the provisioning UX is Fly-specific here.
