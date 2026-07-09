# F158 — Cached + pre-warmed quick-action answers

## Motivation
The chat's standard quick-actions are the first thing a new customer clicks (the demo). Generating each takes 30-60s through the agentic chat. Cache the answer per-site so the click is instant (ms), and regenerate only when the site changes. Christian's order (2026-07-09): cms-admin first (more quick-actions to warm), then broberg.ai, then sanne.

## Scope
A SHARED engine in cms-admin (webhousecode/cms). Every site's chat already goes through cms-admin — cms-admin's own UI directly, broberg via its `/api/admin/chat` relay, sanne via its proxy — so one cache + one endpoint serves all three. NOT a per-site reimplementation (reuse-first).

## Cacheable actions (keyed, content-classified)
- `overview` — site summary (collection/doc/draft counts). content-dependent.
- `drafts` — unpublished drafts across collections. content-dependent.
- `site-info` — collections/fields/settings/stats. content + schema + settings dependent.
- `capabilities` — "what can you do" (the tools list). NOT content-dependent (only capability/permission changes).

Search-content + edit-a-page are input-fillers (trailing-space prompts that fill the box), NOT cached.

## Architecture
- **Store:** per-site file `{dataDir}/chat-quick-cache.json` = `{ [key]: { markdown, cachedAt } }` (next to chat-memory/chat-conversations).
- **Serve:** `GET /api/cms/chat/quick/:key` (site resolved via proxy's `?site=` cookie injection). Returns `{cached:true, markdown, cachedAt}` when fresh — `capabilities` at any age; the others within a TTL safety net (default a few hours) — else `{cached:false}` and schedules a lazy regen. Auth: `getSessionWithSiteRole` (same as the chat routes). Reachable by cms-admin cookie sessions, by broberg's relay (wh_ CMS_ADMIN_TOKEN → admin session), and by sanne's CMS_API_TOKEN.
- **Generation:** `generateQuickAnswer(prompt, site)` self-fetches cms-admin's own `POST /api/cms/chat?site=X` with `X-CMS-Service-Token` + `X-CMS-Active-Site`, reads the SSE, accumulates `text` deltas → the final markdown. Reuses the EXACT (just-shipped streaming) chat engine — zero logic duplication, no naked cutover.
- **Invalidation:** after content writes (`POST /api/cms/[collection]`, `PATCH/DELETE /api/cms/[collection]/[slug]`), schema writes (`/api/schema/*`), and settings writes (`/api/admin/site-config`) → `invalidateQuickCache(orgId, siteId)` deletes the content-dependent entries (NOT `capabilities`) and schedules a debounced (~5s) pre-warm. A TTL safety net catches any write path missed.
- **Pre-warm:** on invalidation (debounced) + on cms-admin boot, regenerate stale entries in the background. Guarded on the service token / CMS_JWT_SECRET being present → ship-dark (no crash, endpoint just returns cached:false) when unconfigured.

## Consumers (phased, per Christian's order)
- **F158.1 (cms-admin):** the engine — store + `GET /api/cms/chat/quick/:key` + invalidation hooks + pre-warm. Plus cms-admin's own welcome-screen quick-action click tries the cache first (instant assistant message; the cached markdown is added to the conversation so follow-ups keep context), else streams as today.
- **broberg F002.6:** relay `GET /api/admin/chat/quick/:key` → cms-admin; broberg's chat UI tries the cache before streaming.
- **sanne:** their proxy consumes the same endpoint (a card in the sanne project / handoff to the sanne session).

## Non-goals
- Caching non-standard / free-text prompts.
- Per-user caching (quick-actions are site-level: overview/drafts/capabilities/site-info).
- Multi-machine cache coherence (webhouse-app is single-machine filesystem-stateful today; revisit with F152 HA).

## Verification
- `GET /api/cms/chat/quick/overview?site=broberg-ai` returns cached markdown in <150ms after warm; cold → cached:false.
- A content write invalidates overview/drafts/site-info (not capabilities); a subsequent serve regenerates.
- Pre-warm runs after invalidation + on boot (guarded; ship-dark safe).
- Auth: unauthenticated → 401; ship-dark (no service token) → cached:false, no crash.
- Lens (via broberg once F002.6 lands): clicking a warm quick-action renders instantly, no thinking animation.