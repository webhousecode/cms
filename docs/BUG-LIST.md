# Bug List

Known bugs on hold — tracked separately from feature roadmap.

| # | Bug | Severity | Found | Status |
|---|-----|----------|-------|--------|
| B01 | **Tab Isolation — tabs leak between sites/orgs on switch** | Medium | 2026-03-19 | On hold |
| B02 | **Preview Server Resilience — sirv dies on dev restart** | Low | 2026-03-19 | On hold |

## B01 — Tab Isolation

**Symptom:** Switch fra WebHouse/Boutique til AALLM → ser stadig Preview:Boutique tab.

**Root cause:** `storeKey()` i tabs-context.tsx læser `cms-active-site` fra cookie for at bygge localStorage-key. Ved org switch er cookien allerede ryddet/ændret → forkert key → forkerte tabs loades.

**Fix (planlagt):** Key-based re-mount — layout sender `activeSiteId` som `key` på `TabsProvider`. React unmounter og re-mounter hele provideren → fresh tabs for det nye site.

**Files:** `packages/cms-admin/src/lib/tabs-context.tsx`, `packages/cms-admin/src/app/admin/(workspace)/layout.tsx`

## B02 — Preview Server Resilience

**Symptom:** Preview iframe viser "localhost refused to connect" efter dev server restart.

**Root cause:** `activeServers` Map i `preview-serve/route.ts` er in-memory. Dør ved hot-reload/restart.

**Fix (planlagt):** Preview page kalder `/api/preview-serve` ved mount (auto-start). Port persistence i `_data/preview-port.json`.

**Files:** `packages/cms-admin/src/app/admin/(workspace)/preview/page.tsx`, `packages/cms-admin/src/app/api/preview-serve/route.ts`
