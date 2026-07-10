# F159 — Beam-site config auto-sync (repo → webhouse.app, no drift)

## Motivation
A beam-site's `cms.config.ts` lives in TWO places with NO sync: the site's own repo (deployed; the renderer uses it) and webhouse.app's beamed copy at `/data/cms-admin/beam-sites/<site>/cms.config.ts` (CMS-admin authoring + the headless `/api/cms/*` API use it). Adding a collection to the repo config + deploying does NOT update webhouse.app's copy → CMS-admin 404s "Unknown collection" until a manual `POST /api/schema/collections`. Surfaced 2026-07-09/10 by sanneandersen (qigong-classes, studieadgang-demo). Christian: "sprængfarligt rod" → fix. Dangerous mode: silent field-type drift → content authored on webhouse.app renders wrong on the live site.

## Decision (locked with sanne 2026-07-10)
Repo config = the single schema source of truth. webhouse.app's copy is an auto-updated mirror, never hand-edited. The site pushes its schema on every boot (no CI change). CMS-admin content editing unchanged; schema editing for a synced beam-site is repo-owned.

## Architecture
### webhouse.app side (F159.1)
`POST /api/schema/sync?site=<id>` (static segment — avoids the /api/cms/[collection] collision). Auth: Bearer/service-token admin, denyViewers. Body `{ collections: CollectionDef[], mode?: "upsert"|"replace" }`, collections ONLY (never storage/locales/blocks — the endpoint discards them and preserves webhouse.app's own, esp. storage /data paths = the broberg-ai-content-wipe bug class). Default `upsert`: merge by name, never delete (a partial boot-push can't wipe config). Guard: empty collections → 400. Write via `writeConfigCollections` (+ preserve all top-level fields per hard rule) + `invalidateActiveSite`. Response `{ ok, mode, added, updated, unchanged, adminOnly }` (adminOnly = drift report).
### Site side (sanne's own card)
`instrumentation.ts` register() fire-and-forget POST of `config.collections`, gated behind `CMS_SYNC_ENABLED` (ship-dark).

## Non-goals (v1)
Syncing top-level fields; auto-deleting collections (replace is opt-in); bidirectional sync; changing content ICD (F145).

## Rollout
1. Build+test+deploy the endpoint (F159.1). 2. Confirm live to sanne; they wire the boot-push. 3. Verify end-to-end.

## Verification
Unit: upsert-adds / upsert-never-deletes / preserve top-level+storage / empty→400 / response shape. Live: parity sync vs sanneandersen → adminOnly:[]; a new collection in the payload → GET /api/cms/<new> 200; empty→400; storage path unchanged.