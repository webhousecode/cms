# F138 — Empty Admin UX + Beam Receive at Account Level

**Status:** Draft
**Requested:** 2026-04-25 by Christian (during webhouse.app go-live, M1)
**Effort estimate:** 4–6 hours
**Tier:** 1 — Critical UX (blocks self-service onboarding & Beam-receive on empty CMS)

---

## Problem

**A logged-in user on a CMS server with zero sites currently sees Site Settings.** This is nonsensical — there is no site to configure — and worse, it hides the actual valid actions: *create a site*, *receive a site via Beam*, *manage your account*. We discovered this on the freshly-deployed webhouse.app where the UI shows a "No sites yet" hero but the sidebar still surfaces site-scoped affordances.

A second, deeper problem: **Beam token-generation is currently inside Site Settings** (`/admin/settings → Beam` panel). The token is per-site (stored at `<site>/_data/beam-tokens.json` via `getActiveSitePaths()`). On an empty CMS there is no active site → the token cannot be generated → the very flow we built Beam for ("transfer a site between two CMS instances") is **unreachable from an empty receiver**. This is exactly the case Christian hit on webhouse.app: he wanted to generate a token to receive a site from `localhost:3010`, but Beam was buried in Site Settings of a site that doesn't exist.

**Christian's exact wording (2026-04-25):**
> Burde Beam ikke være en Account preference og burde jeg kunne se site settings når der ingen sites er?

The answer to both is *no, those should not be visible*.

---

## Vision

Empty CMS (0 sites) shows ONLY what's relevant for an empty CMS:

| Surface | Empty admin shows | Empty admin hides |
|---|---|---|
| Sidebar — main nav | Sites, Organizations, Account, (Admin if super-admin) | Site Settings, Collections, Media, Curation, Schema, Deploy, Agents, Chat |
| Top bar | Org switcher (if multi-org) | Site switcher |
| Sites page | "No sites yet" + "+ New site" + **"+ Receive via Beam"** | (no change) |
| Account Preferences | Existing prefs + **new "Beam Tokens" panel** (admin-server-level) | (no change) |
| Site Settings page | 404 / redirect to /admin/sites with a toast: "Create a site first" | — |
| Command palette | Org + Account actions only | All site-scoped actions |

Once the user creates or beams a site, sidebar and command palette unfold to their normal full state.

For Beam specifically:
- **Token generation moves to Account Preferences** (admin-server-level concept). Token is tied to the *receiving instance*, not to a specific site. Storage path changes from per-site `<site>/_data/beam-tokens.json` to admin-level `<adminDataDir>/beam-tokens.json`.
- A Beam token is "this CMS instance is willing to receive ONE site within the next hour". Conceptually, that's an account/instance-level capability, not a site-level one.
- **Send-direction stays in Site Settings** (you're sending *this site*, so it's site-scoped). Only the receive-side (token generation + the token list) moves to Account Preferences.

---

## Non-goals

- **NOT** redesigning the full sidebar information architecture — only emptyState branching.
- **NOT** changing the Beam wire protocol or `.beam` archive format. Existing tokens remain valid.
- **NOT** changing how Beam *sending* is triggered (still from Site Settings of the source site).
- **NOT** auto-initializing a registry. webhouse.app's "single-site mode → multi-site mode" transition is a separate F-feature; F138 makes the empty-admin UX work whether the registry has 0 sites or doesn't exist at all.
- **NOT** building a generic onboarding tour — F120 owns that.

---

## Architecture

### 1. Empty-state detection

A single source of truth for "is this admin empty?":

```ts
// packages/cms-admin/src/lib/admin-empty.ts
export async function isAdminEmpty(): Promise<boolean> {
  const registry = await loadRegistry();
  if (!registry) return true; // single-site mode with seed config = "empty" UX too
  return registry.orgs.every((o) => o.sites.length === 0);
}
```

Single-site mode counts as empty for UX purposes — there's no real configurable site, just a seed `cms.config.ts`. Once a site is added (via "+ New site" or Beam) the registry exists and has ≥ 1 site → no longer empty.

### 2. Sidebar / nav gating

`components/sidebar.tsx` already reads user permissions for visibility. Add an `isAdminEmpty()` check that strips site-scoped sections:

```tsx
const empty = useAdminEmpty(); // hook fetches /api/admin/state
return (
  <aside>
    <NavItem href="/admin/sites">Sites</NavItem>
    <NavItem href="/admin/organizations">Organizations</NavItem>
    <NavItem href="/admin/account">Account</NavItem>
    {!empty && <>
      <NavItem href="/admin/content">Content</NavItem>
      <NavItem href="/admin/media">Media</NavItem>
      <NavItem href="/admin/curation">Curation</NavItem>
      <NavItem href="/admin/settings">Site Settings</NavItem>
      {/* … other site-scoped … */}
    </>}
  </aside>
);
```

Add a tiny `GET /api/admin/state` endpoint that returns `{ isEmpty: boolean }` so client components can branch without server round-trips on every render.

### 3. Site-scoped page guards

For each site-scoped page (`/admin/settings`, `/admin/content/*`, `/admin/media`, etc.):
- Server component checks `isAdminEmpty()` first.
- If empty → `redirect("/admin/sites")` with a search param: `?notice=create-first`.
- `/admin/sites` reads `?notice=create-first` and renders an inline toast: *"Create or beam a site first."*

This means even direct URL navigation (deep links, bookmarks, AI agents) lands somewhere sensible.

### 4. Beam token-generation moves to admin level

**Storage migration:**
- New canonical path: `<adminDataDir>/beam-tokens.json` (where adminDataDir = `getAdminDataDir()`)
- On read: check new path first; fall back to *active site's* `_data/beam-tokens.json` for backwards compat (existing users with already-generated tokens don't lose them).
- On write (generation): always write to new admin-level path.
- On consume (validate-and-mark-used): write back to wherever the token was found.

**API changes:**
- `POST /api/admin/beam/token` → still admin-only, but now writes to admin-level path. No change to request/response shape.
- `GET /api/admin/beam/token` → reads from admin-level path (with site-level fallback during transition).
- New: `POST /api/account/beam/token` — same as the admin endpoint, but explicitly account-scoped (clearer mental model). Old admin endpoint stays as alias for backwards compat.

**UI changes:**
- New panel `components/account/beam-tokens-panel.tsx` — list active tokens + generate button + copy-to-clipboard.
- Existing `components/settings/beam-settings-panel.tsx` keeps the *send* side (export site, push to remote) but loses the token-generation half.
- Account Preferences page (`app/admin/(workspace)/account/page.tsx`) gets a new section.

**Receive-flow update:**
- `/api/beam/receive/initiate/route.ts` currently does `const { dataDir } = await getActiveSitePaths()` to validate the token. Change to: try admin-level first, fall back to active site's data dir.
- This means a token generated on an empty CMS validates correctly — no active site needed.

### 5. Empty-admin Beam landing

When a Beam transfer completes on an empty CMS (no registry exists):
- Currently: `finalize` calls `addSite()` only if `loadRegistry()` returned a registry. Empty admin → silent skip → site files land but invisible.
- Fix: if no registry exists, finalize **creates a default registry** with a single org `default` and adds the beamed site to it. This converts the empty CMS into multi-site mode with the beamed site as the first occupant.
- `defaultOrgId` and `defaultSiteId` set to the newly-created entries so the user lands on the right site after refresh.

### 6. Sites page enhancements

`/admin/sites` empty-state:
- Already shows "No sites yet" + "+ New site" button (per screenshot).
- Add: secondary button "+ Receive via Beam" that links to `/admin/account#beam-tokens` with an inline hint *"Generate a token, paste it on the source CMS, and beam a site here."*

---

## Data migration

For users who already have site-level beam-tokens.json files (e.g. from local dev), no action is needed: the read-side fallback handles them. Optionally, a one-shot sweeper could move them to admin-level on first read, but not required for F138 correctness.

---

## Risks / rollout

- **Single-site mode treated as empty:** existing single-site deployments (npm `@webhouse/cms-admin` with one seed config) will see the *empty* sidebar after this change. That's a UX regression for them. **Mitigation:** treat single-site mode as having one synthetic site for nav purposes — only treat *registry-with-zero-sites* as empty. Adjust `isAdminEmpty()` accordingly. Final rule: `isAdminEmpty() = (registry exists) AND (every org has 0 sites)`. Single-site mode (no registry) is *not* empty — it has the seed.
  - Re-stated decision: F138 only changes UX when `registry exists AND empty`. Single-site fall-back remains the same.
- **Token validation across deployment:** if a user generates a token, we redeploy, then they try to use it — the file must persist on the volume. Admin-level path = `<adminDataDir>/beam-tokens.json`, which on Fly is `/data/cms-admin/beam-tokens.json` (volume-backed) → persists. ✓
- **Backwards compat:** existing send-site flows that point at site-level token validation still work because the receive-flow falls back to per-site path. No flag day.

---

## Verification

1. **Fresh CMS (registry with 0 sites):**
   - Sidebar: only Sites / Organizations / Account / (Admin) visible.
   - `/admin/settings` → redirects to `/admin/sites?notice=create-first` with toast.
   - Account Preferences shows Beam Tokens panel.
   - Generate token → file lands at `<adminDataDir>/beam-tokens.json`.
   - Send site from another CMS pointing at the empty one → completes → registry auto-created → site visible in switcher after refresh.
2. **Single-site mode (no registry):** unchanged — seed site visible, full sidebar.
3. **Multi-site with ≥1 site:** unchanged — full sidebar visible.
4. **Existing user with site-level beam-tokens.json:** legacy tokens still validate (fallback path works).

---

## Order of work

Phases (separate commits, each shippable):

1. **F138-A — Empty-state detection helper + nav gating** (~1h)
   - Add `lib/admin-empty.ts`, `GET /api/admin/state`, hook + sidebar branching.
   - Tests for the helper covering: no registry, registry-with-0-sites, registry-with-1-site.

2. **F138-B — Site-scoped page guards** (~1h)
   - Add `redirect("/admin/sites?notice=create-first")` to `/admin/settings`, `/admin/content/*`, `/admin/media`, `/admin/curation`, `/admin/agents`, etc.
   - `/admin/sites` reads notice param → renders inline notice.

3. **F138-C — Move Beam token to admin level** (~1.5h)
   - Update `lib/beam/tokens.ts` to use `getAdminDataDir()` with site-level fallback.
   - Update `/api/beam/receive/initiate` to prefer admin path.
   - Add `components/account/beam-tokens-panel.tsx` and wire into Account page.
   - Remove generation half from `components/settings/beam-settings-panel.tsx`, leave send/export half.

4. **F138-D — Auto-init registry on first beam-finalize** (~30m)
   - Update `/api/beam/receive/finalize` to create a default registry if none exists.

5. **F138-E — Sites empty-state "+ Receive via Beam" button** (~30m)
   - Link to `/admin/account#beam-tokens`.

After all phases land: deploy to webhouse.app (with F137 cache, this should be ~5 min), test the full Beam-to-empty-CMS flow live.

---

## Open questions

None — design is concrete. All decisions are made:
- Empty UX gate fires on "registry exists AND zero sites" (not single-site mode).
- Beam token storage moves to admin-level with site-level fallback for backwards compat.
- Auto-init of registry happens on first beam-finalize.
