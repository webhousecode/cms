# F76 — Create New Organization

> Wire up the "New organization" button in the org switcher, with safe handling of empty orgs and proper state isolation.

## Problem

The org switcher dropdown shows a "+ New organization" button, but it's a non-functional placeholder. The **backend API already exists** (`POST /api/cms/registry` with `action: "add-org"`), but the frontend is missing.

Critical safety issue: creating an empty org (no sites) crashes the admin — `getDefaultSite()` returns null → "No sites configured in registry" error. Tabs, user-state, and settings are all per-site, so switching to an empty org breaks everything.

## Solution

1. Wire the "New organization" button to an inline dialog
2. Add an **empty org gate** — when active org has 0 sites, redirect to `/admin/sites` instead of crashing
3. Ensure clean state transitions when switching between orgs (cookies, tabs, user-state)

## Technical Design

### 1. Empty Org Safety Gate

The admin crashes when navigating to `/admin` with an org that has no sites. Fix in two places:

**`packages/cms-admin/src/lib/cms.ts`** — graceful fallback instead of throw:
```typescript
// Current (crashes):
if (!def) throw new Error("No sites configured in registry");

// Fixed (returns null, let layout handle redirect):
if (!def) return null;
```

**`packages/cms-admin/src/app/admin/(workspace)/layout.tsx`** — redirect to sites page when no active site:
```typescript
const config = await getAdminConfig();
if (!config) {
  redirect("/admin/sites");
}
```

### 2. Create Org Dialog (OrgSwitcher)

In `packages/cms-admin/src/components/site-switcher.tsx`, replace the placeholder "New organization" menu item:

```typescript
const [showNewOrg, setShowNewOrg] = useState(false);
const [newOrgName, setNewOrgName] = useState("");
const [creating, setCreating] = useState(false);

async function createOrg() {
  if (!newOrgName.trim()) return;
  setCreating(true);
  const res = await fetch("/api/cms/registry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "add-org", orgName: newOrgName.trim() }),
  });
  if (res.ok) {
    const { org } = await res.json();
    setCookie("cms-active-org", org.id);
    document.cookie = "cms-active-site=;path=/;max-age=0";
    window.dispatchEvent(new CustomEvent("cms-registry-change"));
    router.push("/admin/sites/new");
  }
  setCreating(false);
  setShowNewOrg(false);
  setNewOrgName("");
}
```

Inline dialog in dropdown:
```
┌─────────────────────────────┐
│ ✓ WebHouse                  │
│ ────────────────────────── │
│   Organization name:         │
│   [________________]         │
│   [Create]  [Cancel]         │
└─────────────────────────────┘
```

### 3. State Isolation on Org Switch

When switching orgs, these states must be handled:

| State | Scope | What happens on org switch |
|-------|-------|---------------------------|
| `cms-active-org` cookie | Browser | Set to new org ID |
| `cms-active-site` cookie | Browser | **Cleared** (new org may have different sites) |
| Tabs (localStorage) | Per-user, per-site | Key changes → old tabs preserved in localStorage, new site's tabs loaded |
| User-state (sidebar, prefs) | Per-user, per-site | Loaded from new site's `_data/user-state/{userId}.json` |
| Site pool (memory) | Per-org+site | New `orgId:siteId` cache key → fresh CMS instance |
| Settings | Per-site | Loaded from new site's config |

All of this already works correctly by design — the per-site scoping ensures no cross-org data bleeding. The only gap is the empty org crash.

### API (already implemented)

```
POST /api/cms/registry
Body: { "action": "add-org", "orgName": "Client Name" }
Response: { "ok": true, "org": { "id": "client-name", "name": "Client Name", "sites": [] } }
```

## Impact Analysis

### Files affected
- `packages/cms-admin/src/components/site-switcher.tsx` — add create org dialog to OrgSwitcher
- `packages/cms-admin/src/lib/cms.ts` — return null instead of throwing when no sites exist
- `packages/cms-admin/src/lib/site-paths.ts` — return null instead of throwing when no sites exist
- `packages/cms-admin/src/app/admin/(workspace)/layout.tsx` — redirect to `/admin/sites` when config is null

### Blast radius
- **`cms.ts` / `site-paths.ts`** — changing throw → null affects every server component that calls `getAdminCms()` or `getAdminConfig()`. All callers must handle null return. This is the highest-risk change.
- **OrgSwitcher** — dropdown is rendered in admin header on every page. Dialog must not break menu behavior or layout.
- **Cookie clearing** — clearing `cms-active-site` on org switch already happens. New org creation follows the same pattern.

### Breaking changes
- `getAdminConfig()` return type changes from `CmsConfig` to `CmsConfig | null` — all callers must handle null. This is a **type-level breaking change** within the admin codebase (not external API).

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Create org dialog opens from org switcher dropdown
- [ ] API creates org with correct ID (lowercase, hyphenated)
- [ ] After creation: `cms-active-org` cookie set, `cms-active-site` cleared
- [ ] User is redirected to `/admin/sites/new` for the new org
- [ ] New org shows in org switcher dropdown
- [ ] Navigating to `/admin` with empty org → redirects to `/admin/sites` (no crash)
- [ ] Creating first site under new org: auto team.json with current user as admin
- [ ] Switching back to original org: tabs, settings, state all intact
- [ ] Switching to new org after adding a site: correct site loaded, clean state
- [ ] Multiple org switches: no stale cookies, no wrong site loaded

## Implementation Steps

1. Add empty org gate: `cms.ts` + `site-paths.ts` return null instead of throw
2. Add redirect in `layout.tsx` when config is null
3. Add create org dialog to `OrgSwitcher` in `site-switcher.tsx`
4. Test full flow: create org → create site → switch orgs → verify state
5. Verify existing org switch behavior isn't broken

## Dependencies

- None — backend API and registry system already fully implemented

## Effort Estimate

**Medium** — 2-3 days. The dialog itself is small, but the empty org gate touches core CMS loading path and requires careful testing of all callers.

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
