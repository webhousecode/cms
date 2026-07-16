# F163 — Cross-tenant desync: URL slug must persist the active-site cookie

**Status:** Fixed (hotfix) · **Priority:** critical · **Area:** multi-tenancy / `proxy.ts`

## The incident (2026-07-16)

Christian opened `https://webhouse.app/admin/broberg-ai/lighthouse`. On one screen the URL + server-rendered sidebar showed **broberg-ai**, while the site picker + Lighthouse data (`sanneandersen-site.fly.dev` scan) showed **sanneandersen**. Two tenants on one screen — the worst-class bug for a multi-tenant CMS. A client-side write from that page would have targeted the cookie's tenant (sanneandersen) while the operator believed (URL) they were in broberg-ai.

## Root cause

The F146 URL site router in `proxy.ts` (`/admin/{slug}/...`) injected `cms-active-org` / `cms-active-site` only onto the forwarded REQUEST headers — never as a `Set-Cookie` on the RESPONSE. So server-rendered parts saw the URL's site, but the browser's stored cookie kept its stale value, and every client-side `/api/*` call (no slug) resolved the tenant from the stale cookie. `/admin/switch/[slug]` and `switchSite()` were already correct; the gap was direct/tab/bookmark/link navigation to a slug URL.

## The fix

When the slug router resolves a site, `proxy.ts` now also writes `cms-active-org` + `cms-active-site` to the RESPONSE cookie jar (same opts as `/admin/switch/[slug]`: path=/, maxAge=1y, sameSite=lax). The URL slug becomes authoritative on every request — cookie drift self-heals on the next slug URL load, and client `/api/*` calls resolve the same tenant as the URL. Scoping preserved: the `?site=` API override stays request-only (per-call override for token callers, not a UI switch).

## Verification

Red→green regression test `src/lib/__tests__/proxy-slug-cookie.test.ts` (fails with the fix disabled). `tsc --noEmit` clean; tenant/routing suites green. Live Lens verification after deploy.