# F140 — Empty-Org UX Regression

**Status:** Fixed (2026-05-31) — render regression test deferred (dev server on :3010 was down this session)
**Priority:** High (blocks new-org onboarding flow)
**Identified:** 2026-04-30 (sanne-andersen migration session)
**Reproduces on:** webhouse.app prod AND localhost:3010 (confirmed code bug, not state)

## Resolution (2026-05-31)

**Root cause:** the empty-org branch in `app/admin/(workspace)/layout.tsx`
rendered `<AdminHeader />` directly inside `SidebarProvider` only. But
`AdminHeader` reads `useWorkspace()` + `useHeaderData()`, and the normal path
(`WorkspaceShell`) wraps the header in `WorkspaceProvider` + `HeaderDataProvider`.
The empty-org shell omitted both providers, so those contexts returned their
null/default values → UserMenu (gravatar, account prefs, org settings) and
OrgSwitcher ("+ New org", "All orgs") rendered empty and the user got stuck
in the empty org with no way out.

**Fix:** wrap the empty-org shell in the same `WorkspaceProvider`
(`initialUser={user}`, `initialOrg={org}`, `initialSite={null}`) +
`HeaderDataProvider` as `WorkspaceShell`. The header now has the user + org
context it needs, so all user-scoped chrome returns. The sidebar stays the
stripped `OrgSidebar` per plan scope (no point showing Posts/Pages when there
are no sites). Surgical — only `layout.tsx` changed (2 imports + provider
wrapping).

**Out of scope (as planned):** the suspected per-org "lost admin role" lookup
in the empty-org path is a separate concern and was not touched.

**Test:** a render regression test (RTL/Playwright asserting the empty-org
header keeps gravatar + org-switcher) is deferred — the :3010 dev server was
down this session and the hard rule forbids restarting it without explicit
permission.

## Problem

When the active org has **zero sites**, the admin shell strips out user
controls that should remain available regardless of org state. Tonight's
session hit this when migrating sanne-andersen — the user created a new
empty org, switched into it, moved a site there, and then could no longer
get out:

| Control | Expected in empty org | Actual |
|---|---|---|
| User-menu gravatar | Visible | Missing |
| User-menu "Org settings" entry | Visible | Missing |
| User-menu org-context items | Visible | Missing |
| Org-switcher "+ New org" | Available | Missing |
| Org-switcher "All orgs" | Available | Missing |
| Sidebar | Full (Content, Media, etc. with empty states) | OrgSidebar-only (just "Sites") |

The user is still authenticated, still has admin role globally, still appears
in the global team.json — but the empty-org gate treats them as a
constrained user and hides controls that have nothing to do with site state.

The original intent of the gate (commit history) was to redirect new
users to "create your first site" before letting them touch site-scoped
features. That's correct for the **sidebar** (no point showing "Posts"
when there are no posts to post). It is wrong for **header user-menu
controls** (gravatar, account prefs, org settings, theme, sign out, new-org)
which are user-scoped, not site-scoped.

## Reproduction

1. Log in as admin
2. Create a new org via the org-switcher "+ New org"
3. Switch to that org (which has 0 sites)
4. Open the user menu (top-right) — gravatar gone, "Org settings" gone
5. Open the org-switcher — "+ New org" and "All orgs" gone

Or, harder version (tonight's path):
1. Have a site in org A
2. Move it to org B
3. Now you're in org B with the site, but admin treats moves as "this is
   the same as never having a site here" if B was previously empty —
   actually verify this branch separately, may be a related but distinct bug

## Root cause hypothesis

`packages/cms-admin/src/app/admin/(workspace)/layout.tsx:79–103` —
the empty-org gate returns a minimal shell:

```tsx
if (org && org.sites.length === 0) {
  return (
    <SidebarProvider>
      <OrgSidebar />
      <SidebarInset>
        <TabsProvider siteId="no-site">
          <AdminHeader />
          {children}
        </TabsProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

The `<AdminHeader />` here is rendered without the `mode`/`onToggleMode`
props that the full WorkspaceShell passes. Header components likely have
conditional branches keyed on these props (or on the absence of a real
siteId) and silently strip user-menu sections that depend on a site
context — even though gravatar / account prefs / org settings / new-org
do not actually need a site.

Need to audit:
- `components/admin-header.tsx` — what conditional gating exists
- `components/sidebar.tsx` (`OrgSidebar` variant) — what's stripped
- The user-menu component — what triggers the absence of gravatar
- The org-switcher — what gates the "+ New org" / "All orgs" items

## Scope (in)

- Make user-menu **always** show: gravatar, name/email, account prefs,
  theme, sign out, "Org settings" (when applicable)
- Make org-switcher **always** show: existing orgs, "+ New org",
  "All orgs", regardless of current org's site count
- Keep the sidebar gate as-is: empty-org sidebar should remain stripped
  (no Posts/Pages/etc when there's nothing to show), but the header
  must remain fully functional

## Scope (out)

- Permission system rework — those changes belong in a separate plan
- Org-creation role assignment — investigate separately if creating an
  org doesn't auto-assign creator as admin (suspected adjacent bug)
- Sidebar empty-state design — keep current OrgSidebar for now

## Open questions

1. Does `<OrgSidebar />` know about current org's role? If not, that's
   another gap.
2. Is there a "lost admin in new org" bug? The user reported losing the
   ability to even reach Org Settings from inside SA org — suggests
   per-org role lookup is failing in the empty-org path.
3. Should sidebar in empty org still show user-defined collections in a
   "no items yet, create first" state? Current OrgSidebar suppresses
   them entirely.

## Implementation outline

1. **Audit** `admin-header.tsx` — find every branch that varies behavior
   based on site presence vs user presence. User-menu items must NEVER
   be gated on site state.
2. **Hoist user-menu logic** into a context/component that doesn't take
   `siteId` as input — only `userId` + `orgs`.
3. **Test the empty-org path** in both prod and local: create empty org,
   verify user menu has full chrome, verify org-switcher has full chrome.
4. **Add Playwright/Vitest e2e test** for the empty-org admin-header
   contract so this doesn't regress again.

## Estimated effort

~3–5 hours: audit (1h), refactor user-menu out of site-context (1–2h),
test (1h), e2e regression test (1h).

## Related

- The user-state file (`_data/user-state/<userId>.json`) tracks
  lastActiveOrg/lastActiveSite — verify the empty-org gate doesn't
  somehow reset those.
- F55 (permissions) — if the per-org admin lookup is the issue, it
  needs to be coordinated with the permission system.
