## F146 — URL-Based Site Routing

**Status:** Shipped 2026-06-01 (core + sidebar + tests). Live on webhouse.app.

> Move active-site state from a session cookie into the URL path so admin pages live under `/admin/{site-slug}/...`. Stable per-site URLs, parallel-tab editing of multiple sites, no more "wait, which site am I on?" moments.

## Shipped (2026-06-01)

Built via the **proxy-rewrite** approach (NOT the 25-folder move originally
sketched below) — far lower risk, no big-bang link codemod.

| Commit | Scope |
|--------|-------|
| `4ad306b3` | Core: `lib/site-slug-routing.ts` (reserved set + parse + `siteAdminPath`), proxy.ts slug-resolution + cookie-injection + rewrite, **strip existing cms-active-* before inject** so URL wins over a duplicate cookie. 13 unit tests. |
| `1a58a305` | `switchSite()` navigates to `/admin/{slug}`. |
| `d1fff35a` | Sidebar nav links slug-prefixed via `useActiveSiteSlug()`/`useSiteLink()`; slug stripped before `isActive` checks. |
| `91345587` | Live :3010 integration tests (URL-wins-over-cookie, no-slug fallback, unknown→307, reserved→200, F140 empty-org renders). |

Verified live: `/admin/trail/settings` → Trail, `/admin/sanneandersen/settings`
→ Sanne Andersen; URL slug beats a conflicting cookie in all cross-site cases;
prod webhouse.app `/admin/{slug}` returns 307→login (slug recognised) not 500.

**Remaining (optional, low-priority):** the other ~33 static `/admin/...`
links outside the sidebar (settings panels, agent pages, dashboard cards) still
emit unscoped paths. They work fine via the cookie fallback — migrating them to
`useSiteLink()` is pure URL-prettiness, do it opportunistically. Site-slug ==
collection-name ambiguity rule stands: first segment is always the site.

## Implementation notes (discovery 2026-05-31 — read before building)

A session started this and surfaced two findings that change the recommended approach. No code was written (the discovery showed it needs a fresh, full-context session). Captured here so it isn't lost:

**1. Prefer proxy-rewrite over physically moving 25 route folders.**
`proxy.ts` already does exactly the needed pattern for `?site=` on `/api/*`:
it resolves the target site and injects `cms-active-org` + `cms-active-site`
cookies on the forwarded request (lines ~83-105). The clean way to do F146 is
to extend that: in `proxy.ts`, detect `/admin/{slug}/...` where `{slug}` is a
known registry site, inject the cookies, and `NextResponse.rewrite()` back to
`/admin/...` (slug stripped). The browser keeps the pretty `/admin/{slug}/`
URL; Next renders the existing routes unchanged. This gives all 5 acceptance
criteria **without** moving a single folder or running the 22-file link codemod
up front (links can be migrated incrementally via a `siteAdminPath()` helper).
Far lower risk than the folder-move described below.

**2. BLOCKER to resolve first: `/admin/[collection]` is a legacy catch-all.**
`app/admin/(workspace)/[collection]/page.tsx` is a legacy redirect that turns
`/admin/{X}` into `/admin/content/{X}`. So `/admin/trail` today means "redirect
to collection 'trail'", which **collides** with treating `{slug}` as a site.
The rewrite approach resolves it by precedence (proxy checks "is `{slug}` a
known site?" before Next routing runs, so a real site slug wins; non-site
first-segments fall through to the legacy redirect). But there's a genuine
ambiguity to design around: **a site slug that equals a collection name**
(e.g. site "blog" vs collection "blog"). Decide the rule explicitly — current
recommendation: first URL segment is always the site; collections are only
reachable at `/admin/{site}/content/{collection}`.

**Reserved first-segments** (must NOT be treated as a site slug): `account
agents approve backup command content curation deploy favorites forms
interactives lighthouse link-checker log media organizations performance
preview scheduled seo settings sites trash visibility` + `goto switch` + the
`(auth)` pages. Build this set from the filesystem so it stays in sync.

**Verification requires the :3010 dev server (HTTPS).** Probe with
`curl -skS https://localhost:3010/...` — it serves HTTPS via mkcert, plain
`http://` returns an empty reply that looks like a crash but isn't.

## Problem

Today the active site is implicit:
- Stored in `cms-active-site` cookie
- Mutated by clicking the site selector or hitting `/admin/switch/<slug>` (F-small, just shipped)
- Every admin page reads the cookie via `getActiveSitePaths()` to figure out which site's content to render

Consequences:
- **Two browser tabs share state** — opening "trail" in tab A and "webhouse-site" in tab B silently fights over the cookie. Whichever tab last loaded wins for the NEXT navigation in either tab.
- **Bookmarks are useless across sites** — a bookmark to `/admin/content/posts` lands wherever the cookie happens to point.
- **Sharing links is fragile** — pasting a colleague a link to `/admin/content/posts/my-post` lands them on THEIR active site, not yours. The new `/admin/switch/<slug>?next=...` route works around it but adds a redirect hop.
- **Token-API and admin-UI use different scoping mechanisms** — APIs use `?site=<id>` query (commit 61adbd71 fix), admin UI uses cookies. Two parallel routing models for the same concept.

## Solution

Move the site slug into the URL: `/admin/{slug}/content/posts/my-post` instead of `/admin/content/posts/my-post`. The cookie becomes a fallback (last-active-site for "where do I go after login?") but the URL is the authoritative source for "which site am I editing right now?"

After this lands, all four use cases above resolve naturally:
- Tabs are independent — each URL carries its own slug
- Bookmarks are stable
- Shared links land on the correct site
- API + UI converge on path-based scoping (drop `?site=` query alias eventually)

## Technical Design

### Route structure

Wrap the existing `(workspace)` group in a dynamic `[siteSlug]` segment:

```
src/app/admin/
  [siteSlug]/
    (workspace)/
      page.tsx                 → /admin/{slug}
      content/
        [collection]/
          page.tsx             → /admin/{slug}/content/{collection}
          [doc]/page.tsx       → /admin/{slug}/content/{collection}/{doc}
      settings/
        page.tsx               → /admin/{slug}/settings
      ...everything else moves under [siteSlug]
  (auth)/                      ← NOT under [siteSlug] — login is site-agnostic
    login/page.tsx
    callback/page.tsx
  switch/[slug]/route.ts       ← keep — convenience redirect that sets cookie + redirects to /admin/{slug}
  goto/[id]/route.ts           ← keep — short-link resolver, redirects into /admin/{slug}/...
```

### Site context resolution

`getActiveSitePaths()` and friends keep working. Their resolution chain becomes:

1. **AsyncLocalStorage override** (`withSiteContext`) — set by token-API routes (already shipped)
2. **NEW: URL-segment override** — set by a layout component reading `params.siteSlug`
3. Cookie fallback — only used by routes outside `[siteSlug]/` (e.g. login redirect target lookup)
4. `registry.defaultSiteId` — last resort

Add a server component `app/admin/[siteSlug]/layout.tsx` that:
1. Reads `params.siteSlug`
2. Resolves to `(orgId, siteId)` via registry
3. If unknown → 404
4. Wraps children in `withSiteContext({ orgId, siteId })` so all server components below see the override

### Cookie role

Cookie still updated when user navigates so:
- Login redirect knows where to send them next
- Site selector dropdown shows current site
- Mobile API + chat tools that have NO URL still resolve sensibly

But cookie is never the source of truth for the rendered page — URL always wins.

### Migration steps

1. **Add `[siteSlug]/layout.tsx`** that calls `withSiteContext` + sets cookie as side effect
2. **Move every existing `(workspace)/page.tsx`** under `[siteSlug]/(workspace)/`
3. **Add a root `/admin/page.tsx`** that reads cookie or default and 308-redirects to `/admin/{slug}`
4. **Keep all internal `<Link href="/admin/...">` components** working via a `useActiveSiteSlug()` hook + helper `siteAdminPath(path)` that prepends slug. Or simpler: scan and rewrite every link site-side via codemod.
5. **Drop `?site=` query alias from `/api/cms/*` routes** once admin UI reliably scopes via path (defer — they coexist fine).

### Backwards compatibility

Christian's note: "ingen anvender CMS endnu ud over dig og mig" — so no need for redirects from old paths. Bookmarks and external links break and that's fine.

The one carve-out is OAuth callback URLs registered with GitHub. They're hardcoded to `/api/auth/github/callback` (no site context) — those stay as-is.

### Token-API parity

`?site=<id>` on `/api/...` routes already does the right thing via the runScoped wrapper (commits 61adbd71 + 757b4857). Once the admin UI moves to URL-based, we have ONE mental model: site identity always lives in the URL, cookies are just a fallback hint.

## Phases

### Phase 1 — Layout + redirect (1 day)
- Add `[siteSlug]/layout.tsx` with site resolution + `withSiteContext` wrapper
- Add root `/admin/page.tsx` redirect-to-current-or-default
- All existing pages keep working under both paths during the cutover

### Phase 2 — Move pages (1 day)
- Wholesale move of `(workspace)/` tree under `[siteSlug]/`
- Update internal links via codemod (search `href="/admin/` → `href={siteAdminPath('/admin/...')}`)
- Verify each tab loads (auth, settings, content, deploy, build, etc.)

### Phase 3 — Site selector update (½ day)
- Selector dropdown navigates via `router.push(\`/admin/${slug}/...\`)` instead of cookie-set
- Site selector picks the equivalent path on the OTHER site (same collection if it exists, else /admin/{slug})

### Phase 4 — Drop `?site=` query alias (optional, defer)
- After admin UI is fully URL-based, retire the query-param scoping in `/api/cms/*`. Non-breaking for token callers because they can switch to path-based too: `/api/cms/sites/{slug}/posts`.

## Acceptance criteria

1. Open `/admin/trail/content/posts` in tab A and `/admin/webhouse-site/content/posts` in tab B simultaneously — both show their respective site's posts, no cookie tug-of-war
2. Bookmark `/admin/trail/settings/deploy` → opens trail's deploy settings every time, regardless of cookie state
3. Pasting a colleague `https://webhouse.app/admin/trail/content/posts/my-post` lands them on trail's post, not their active site
4. `/admin/switch/<slug>` still works as a one-shot redirect (now redirects to `/admin/{slug}` instead of `/admin`)
5. Login flow lands user at `/admin/{lastActiveSite}` (or default if none)

## Effort

**M** — 2.5 days

- Phase 1: 1 day (layout + redirect, leave existing pages in place)
- Phase 2: 1 day (move + codemod links + smoke-test all tabs)
- Phase 3: ½ day (site selector)
- Phase 4: deferred indefinitely (no benefit to forced removal)

## Why now is good

- Christian + AI are the only two users. Breaking changes have zero customer impact.
- The two sites we routinely switch between (trail, webhouse-site) make the cookie-tug-of-war annoyance daily.
- API-side already done the equivalent (path-scoped or query-scoped via withSiteContext) — admin-UI parity closes the loop.

## Why we didn't ship it earlier

The cookie model worked fine for single-site sessions. Multi-site editing only became routine in the last week of trail-landing migration work (May 2026). Now that we're regularly bouncing between trail + webhouse-site + sanneandersen, the cost is visible.

## Related

- F141 — Site switch context leak (predecessor — fixed the cookie-leak bug; this F146 fixes the underlying model)
- F134 — Token-API site scoping (parallel — APIs already do path-based via `withSiteContext`)
- Today's small `/admin/switch/<slug>` route — bridge that becomes redundant after F146 lands
