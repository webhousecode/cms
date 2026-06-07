# F152 — HA / horizontal scaling for webhouse-app (central Turso DB + object storage)

**Status:** Backlog (planning)
**Owner:** cms-admin + cms engine
**Created:** 2026-06-07

## Motivation

webhouse-app (cms-admin) is **filesystem-stateful on ONE per-machine Fly volume** (`cms_data`, 3GB, arn, mounted `/data`). `/data` holds everything live: `registry.json` (the site registry), `beam-sites/{site}/content/` (per-site content JSON for sanneandersen, trail, webhouse-site…), `beam-tokens.json`, users/auth, uploads (media blobs), `_data`.

**Fly volumes are never shared between machines.** So the app is stuck at a SINGLE machine, which causes the pains we hit on 2026-06-07:
- Every deploy/restart is a **downtime blip** — a rolling restart at 14:26:12 dropped an in-flight save ("Save failed").
- **No failover** — one machine down = whole CMS down.
- **Cold-start slowness** when the machine sleeps on idle (mitigated short-term by F-fly hot-mode: auto_stop=off, but that's still one machine).

To run **2+ machines** (zero-downtime rolling deploys, failover, headroom) every machine must reach the SAME state. That means moving shared state OFF the per-machine volume into **central stores**. Christian's direction: use **Turso (hosted libSQL)** as the central DB — already in operation in the fleet (trail runs libSQL + Drizzle).

## Why this is far smaller than it looks

The cms engine is **already adapter-based** (`packages/cms/src/storage/`): `StorageAdapter` interface + **`FilesystemStorageAdapter`** (what webhouse-app uses today), **`SqliteStorageAdapter`** (Drizzle + SQLite), **`SupabaseStorageAdapter`** (Postgres), `GitHubStorageAdapter`. Media goes through a **`getMediaAdapter()`** seam. So:
- **Turso ≈ the existing SqliteStorageAdapter pointed at a remote libSQL DB** (`@libsql/client` URL + auth token). libSQL is SQLite-wire-compatible and Drizzle has first-class libSQL support → mostly client wiring + connection config, not a new query layer.
- Media just needs an object-storage adapter behind the existing media seam.
- Sessions are **already stateless** (signed JWT in the `cms-session` cookie) — zero work.

## Goal

Make webhouse-app machines **stateless** so `fly scale count N` is safe → zero-downtime rolling deploys, HA failover, horizontal headroom. Single-region (arn) HA first.

## Target architecture — three classes of state, three homes

1. **Structured data** (per-site content documents, schema-as-JSON, drafts, revisions) → **Turso/libSQL** via a new `LibsqlStorageAdapter` (extends the existing SQLite/Drizzle adapter). Keyed per `(orgId, siteId)` to preserve strict tenant isolation.
2. **Admin-server state** (registry, users, access tokens, goto-links, audit log, chat memory, form submissions) → **Turso** too, via a small Drizzle data layer in cms-admin (these are cms-admin's own JSON files in `/data/cms-admin`, not routed through the content adapter today).
3. **Media / uploads** (binary blobs) → **object storage** (Cloudflare R2 or Fly Tigris S3) behind `getMediaAdapter()`. Blobs cannot live in SQL.

The per-machine volume then becomes **ephemeral** (build cache only) or is removed.

## Cross-cutting concerns (the subtle parts)

- **Cache coherence (REQUIRED).** Today the site-pool / config caches are per-process in-memory; `invalidateActiveSite()` only clears the LOCAL machine. With N machines, an edit on machine A must invalidate B (exactly the staleness we hit doing the F151 Pillows schema edit — disk updated, in-process cache served stale until restart). Options: short TTL, or a shared invalidation signal (libSQL change-poll / lightweight pub-sub). Without this, machine B serves stale content.
- **`cms.config.ts` is executable config, not just data.** Each site's schema/collections live as a TS module loaded + compiled per site. For multi-machine, store the **schema as JSON** (the existing `webhouse-schema.json` shape) in Turso and load from there; keep `cms.config.ts` as the authoring source but don't depend on a machine-local compiled module at runtime. Decide the per-site-config strategy explicitly.
- **Migration parity (content + money data).** registry, content, Stripe price IDs, etc. must migrate with verified parity — dual-read during transition, byte/field-level diff, then flip.
- **Tenant isolation.** Turso tables keyed by `(orgId, siteId)`; object-store paths prefixed per site. Must preserve the isolation the filesystem adapter + proxy `?site=` resolution enforce today.
- **Region.** Turso primary in **arn** (ALWAYS arn); R2/Tigris in/near arn.
- **Don't break the filesystem adapter.** Single-site `npx cms build`, local dev, and example/boilerplate sites still use FilesystemStorageAdapter — the libSQL adapter is additive, selected per deployment.

## Stories

- **F152.1 — LibsqlStorageAdapter (Turso) for cms content.** New `@webhouse/cms` adapter extending the existing SQLite/Drizzle adapter to target a remote libSQL DB (`@libsql/client`, URL + auth token), per `(orgId, siteId)`. Implements the full `StorageAdapter` interface (CRUD, query, search, drafts/revisions). Unit + parity tests vs the filesystem adapter.
- **F152.2 — Object-storage media adapter (R2/Tigris).** Implement an object-storage adapter behind `getMediaAdapter()`; uploads/reads/deletes go to the bucket (per-site prefix). Keep signed-URL/public-serving semantics (`/api/uploads/*`).
- **F152.3 — Admin-server state → Turso.** Move registry, users, access tokens, goto-links, audit log (the cms-admin `/data/cms-admin/*.json` state) into Turso via a small Drizzle layer. Preserve the cb@webhouse.dk-always-admin invariant + tenant scoping.
- **F152.4 — Cross-machine cache invalidation.** Replace in-process-only `invalidateActiveSite()` with a shared signal (TTL and/or libSQL-backed invalidation) so edits propagate across machines. Covers config/schema + content caches.
- **F152.5 — Migration + cutover tooling.** Backfill `/data` (content JSON + registry + admin state + uploads) → Turso + object store; parity-verify; dual-read window; one-way flip with rollback. Money-data (Stripe IDs) verified field-by-field.
- **F152.6 — Scale-out + zero-downtime.** Drop/ephemeralize the Fly volume, `fly scale count 2` (arn), rolling deploys, health + failover verification (kill one machine → service stays up; deploy → no dropped saves).

## Non-goals
- Public consuming sites (sanneandersen-site etc.) are unaffected — they read via ICD webhooks (F020), not the admin volume.
- Multi-region active-active (single-region arn HA first).
- Replacing the filesystem/GitHub adapters — they stay for single-site/local/boilerplate use.

## Decision notes
- **Turso vs Supabase:** cms already has a SupabaseStorageAdapter (Postgres). Christian's direction is **Turso/libSQL** — chosen because it's SQLite-compatible (smallest delta from the existing SqliteStorageAdapter), fleet-proven (trail), and a clean central DB. Supabase remains a viable alternative adapter if ever needed.
- **Sequence:** F152.1 → F152.2 → F152.3 → F152.4 (each independently shippable + testable) → F152.5 migrate → F152.6 scale. Cutover (F152.5/6) is last and reversible.

## Risks
- Large migration touching content + money data → parity verification is mandatory, not optional.
- libSQL write/consistency semantics vs filesystem atomicity — validate concurrent-write + tenant-isolation behavior.
- Cache coherence (F152.4) is the easy-to-forget piece that makes multi-machine actually correct.

## Acceptance (epic-level)
- webhouse-app runs ≥ 2 machines in arn with NO per-machine state divergence.
- A deploy completes with zero dropped saves (rolling, zero-downtime).
- Killing one machine keeps the CMS fully available.
- An edit on one machine is visible on the other within the cache-coherence window.
- Content + registry + money data parity verified post-migration.
