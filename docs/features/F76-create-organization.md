# F76 — Create New Organization

> Wire up the "New organization" button in the org switcher to create orgs via the existing API.

## Problem

The org switcher dropdown shows a "+ New organization" button ([screenshot](assets/org-switcher-new-org.png)), but it's a non-functional placeholder — no `onClick` handler, styled as `text-muted-foreground`. When navigating to New Site without an active org, the form shows "orgId and site required" error.

The **backend API already exists**: `POST /api/cms/registry` with `action: "add-org"` creates the org in `registry.json` and returns the new org object. The only missing piece is the frontend: a dialog to enter the org name, call the API, switch to the new org, and navigate to create the first site.

This is critical for agencies managing multiple clients — each client should be their own org with isolated sites.

## Solution

Connect the existing "New organization" menu item to a small inline dialog (org name input + Create button). On submit, call the existing API, set the `cms-active-org` cookie, dispatch `cms-registry-change` event to refresh switchers, and navigate to `/admin/sites/new` to create the first site.

## Technical Design

### Current State (what exists)

| Layer | Status | Location |
|-------|--------|----------|
| API endpoint | **Done** | `POST /api/cms/registry` with `action: "add-org"` |
| Registry `addOrg()` function | **Done** | `packages/cms-admin/src/lib/site-registry.ts` |
| Org switcher UI button | **Placeholder** (disabled, no onClick) | `components/user-org-bar.tsx` lines 76-79, `components/site-switcher.tsx` lines 218-221 |

### Changes Required

**1. Org switcher components** (`user-org-bar.tsx` + `site-switcher.tsx`):

```typescript
// Replace the disabled "New organization" menu item with:
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
    // Switch to new org
    document.cookie = `cms-active-org=${encodeURIComponent(org.id)}; path=/; max-age=${60*60*24*365}`;
    // Clear active site (new org has no sites yet)
    document.cookie = `cms-active-site=; path=/; max-age=0`;
    window.dispatchEvent(new CustomEvent("cms-registry-change"));
    router.push("/admin/sites/new");
  }
  setCreating(false);
  setShowNewOrg(false);
  setNewOrgName("");
}
```

**2. Inline dialog pattern** (in the dropdown menu):

When "+ New organization" is clicked, the menu item expands to show:
```
┌─────────────────────────────┐
│ ✓ WebHouse                  │
│   All organizations          │
│ ────────────────────────── │
│   Organization name:         │
│   [________________]         │
│   [Create]  [Cancel]         │
└─────────────────────────────┘
```

This follows the same inline-expand pattern used elsewhere in the admin (no separate modal/dialog needed).

**3. New Site page fix** — Remove or handle the "orgId and site required" error gracefully when arriving from a fresh org (no sites yet). The page should pre-select the active org from the cookie.

### API (already implemented)

```
POST /api/cms/registry
Body: { "action": "add-org", "orgName": "Client Name" }
Response: { "ok": true, "org": { "id": "client-name", "name": "Client Name", "sites": [] } }
```

Org ID is auto-generated: lowercase, alphanumeric + hyphens, from the org name.

## Impact Analysis

### Files affected
- `packages/cms-admin/src/components/user-org-bar.tsx` — add create org dialog
- `packages/cms-admin/src/components/site-switcher.tsx` — add create org dialog
- `packages/cms-admin/src/app/admin/sites/new/page.tsx` — handle no-active-site state

### Blast radius
- Org switcher dropdown is used globally — dialog must not break menu behavior
- Cookie management (`cms-active-org`, `cms-active-site`) affects site routing

### Breaking changes
- None — uses existing backend API

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Create org dialog opens from org switcher
- [ ] API creates org and returns in response
- [ ] Active org cookie set after creation
- [ ] Navigation to /admin/sites/new works for new org

## Implementation Steps

1. Add `showNewOrg` state + `createOrg()` handler to `user-org-bar.tsx`
2. Replace disabled "New organization" item with clickable button that expands inline form
3. Add org name input + Create/Cancel buttons in the expanded state
4. On Create: call API, set `cms-active-org` cookie, clear `cms-active-site`, dispatch registry change event, navigate to `/admin/sites/new`
5. Apply same changes to `site-switcher.tsx` (both components show the org dropdown)
6. Fix New Site page to handle "no active site" state gracefully (pre-select org from cookie)
7. Test: create org → create site under it → switch between orgs

## Dependencies

- None — backend API and registry system already fully implemented

## Effort Estimate

**Small** — 1 day

This is essentially wiring up an existing API to an existing UI button. The backend is done, the UI placeholder exists, just needs the connection + inline dialog.
