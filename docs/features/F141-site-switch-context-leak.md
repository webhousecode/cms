# F141 — Site Switch Doesn't Fully Re-Hydrate Workspace Context

**Status:** Planned
**Priority:** High (cross-site content visibility bug)
**Identified:** 2026-04-30 (sanne-andersen migration session)
**Reproduces on:** webhouse.app prod (suspected localhost too — needs verification)

## Problem

When the user switches active site via the site picker, the **header
chrome updates** (active-site name in the top bar, breadcrumb, etc.)
but the **sidebar collections list and content listing remain bound to
the previous site's config**. The result is a confusing cross-site
display where the UI claims to be in site B but is showing site A's
content.

Tonight's repro: active site picker showed "Sanne Andersen" in the
header, but `/admin/content/work` listed Case Studies belonging to
webhouse.dk (FIA Foundation, Ole Lynggaard, COWI, Senti.Cloud, Wrist
Ship Supply, Agri Nord) — none of which are sanne-andersen content.

## Why this is bad

1. **Looks like data corruption** — the user can't tell whether
   their other site's content has been wiped or merged. (It hasn't —
   the data is intact on disk; only the UI is rendering against the
   wrong config.)
2. **Editing risk** — if a user edits a "Case Studies" entry while
   they think they're in site B but the API context is site A, they
   would mutate site A's content unknowingly. Need to verify whether
   the API resolution matches the UI display or the cookie.
3. **Erodes trust** — confused state makes the entire admin feel
   broken.

## Suspected root cause

`packages/cms-admin/src/lib/cms.ts` + `site-pool.ts` cache the loaded
CMS config by `(orgId, siteId)`. The site picker presumably writes a
new `cms-active-site` cookie and triggers a navigation, but the cached
config / sidebar collections list isn't fully re-fetched.

Possible failure modes (need investigation):

- **Cookie write race:** the cookie is set client-side but the server
  component re-renders with stale cookie value
- **Server cache key mismatch:** loadCms() / loadConfig() returns the
  prior site's config because the cache lookup uses a stale request
  context
- **No router.refresh() after switch:** UI updates client state but
  doesn't ask Next to re-render server components, so sidebar
  (server-rendered) keeps the old collections
- **HeaderDataContext stale:** the `useHeaderData()` context that
  provides siteConfig may need an explicit refresh trigger on switch

## Reproduction needs

1. Two sites in the same org, with different collections (or
   different content in the same-named collections).
2. Open admin in site A.
3. Use site picker to switch to site B.
4. Observe sidebar/content listing — does it show A's or B's data?
5. Compare URL, active-site cookie value, and what header/breadcrumb
   say. Note any disagreement.

## Scope (in)

- Make site switch atomically update: cookie + server-rendered sidebar
  + content listing + header. After the switch the UI must be
  consistent — every visible piece of state agrees on which site is
  active.
- Add an end-to-end Playwright test for the switch flow.

## Scope (out)

- Permission propagation across switches (separate concern)
- Multi-tab consistency when switching in one tab (out for now —
  reload-on-switch in other tabs is acceptable)

## Open questions

1. Does the API actually serve site A's data when UI thinks it's B?
   (i.e. is this a display-only confusion or a real cross-tenant
   leak that also affects writes?)
2. Does this also affect the org switcher when the new org's first
   site has different collections?
3. Is the `_cached` Registry singleton involved in this state
   confusion?

## Implementation outline

1. **Audit** the site-switch path: which component sets the cookie,
   which event triggers re-render, where the sidebar gets its
   collections from.
2. **Add server-side validation:** every server component that
   renders site-scoped UI must re-derive `(orgId, siteId)` from the
   cookie, not from a closed-over value.
3. **Force `router.refresh()`** after switch so server components
   re-execute with the new cookie.
4. **Verify the API path** — the most important check. If POST/PUT
   to site B's content actually mutates site A's data, that's a
   cross-tenant write leak and is a security incident.
5. **Add e2e test** for switch consistency.

## Estimated effort

Investigation: 2h. Fix: 2–4h depending on whether it's a cookie/
re-render issue or a deeper cache-key bug. E2e test: 1h. Total
~5–7h, but the API write-side check (step 4) needs to happen first
because it determines severity.

## Related

- F140 (Empty-Org UX Regression) — same general theme of the admin
  shell having multiple state sources that drift apart.
- CLAUDE.md hard rule: "No Process-Wide Global State in Request
  Handlers" — explicitly forbids the kind of cwd/env mutation that
  caused the April 2026 link-checker cross-site leak. This bug is
  not the same root cause, but it's adjacent territory.
