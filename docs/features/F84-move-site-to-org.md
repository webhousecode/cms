# F84 — Move Site to Other Organization

> Move an existing site from one organization to another via Site Settings or Sites dashboard.

## Problem

Once a site is created under an organization, there's no way to move it. If an agency onboards a client under the wrong org, or restructures their org hierarchy, they must delete the site and recreate it — losing all configuration, content cache, team access, revalidation settings, and AI agent history.

The registry already has `addSite()` and `removeSite()` — a move is just `removeSite(oldOrg) + addSite(newOrg)`. But there's no UI or API for it.

## Solution

Add a "Move to organization" action in Site Settings → Danger Zone (since it's a significant operation that changes ownership). A dropdown lists all available orgs. On confirm, the site entry is atomically moved in `registry.json`. Team access, revalidation config, and all site data stays intact.

## Technical Design

### 1. Registry Function

```typescript
// packages/cms-admin/src/lib/site-registry.ts

export async function moveSite(siteId: string, fromOrgId: string, toOrgId: string): Promise<void> {
  const registry = await loadRegistry();
  if (!registry) throw new Error("No registry");

  const fromOrg = findOrg(registry, fromOrgId);
  if (!fromOrg) throw new Error(`Source org "${fromOrgId}" not found`);

  const toOrg = findOrg(registry, toOrgId);
  if (!toOrg) throw new Error(`Target org "${toOrgId}" not found`);

  const siteIdx = fromOrg.sites.findIndex((s) => s.id === siteId);
  if (siteIdx === -1) throw new Error(`Site "${siteId}" not found in org "${fromOrgId}"`);

  // Atomic move: remove from source, add to target
  const [site] = fromOrg.sites.splice(siteIdx, 1);
  toOrg.sites.push(site);

  // Update defaults if the moved site was the default
  if (registry.defaultSiteId === siteId && registry.defaultOrgId === fromOrgId) {
    registry.defaultOrgId = toOrgId;
  }

  await saveRegistry(registry);
}
```

### 2. API Endpoint

```
POST /api/cms/registry/move-site
Body: { "siteId": "sproutlake", "fromOrgId": "webhouse", "toOrgId": "client-a" }
Response: { "ok": true }
```

```typescript
// packages/cms-admin/src/app/api/cms/registry/move-site/route.ts

import { NextRequest, NextResponse } from "next/server";
import { moveSite } from "@/lib/site-registry";

export async function POST(req: NextRequest) {
  try {
    const { siteId, fromOrgId, toOrgId } = await req.json();
    if (!siteId || !fromOrgId || !toOrgId) {
      return NextResponse.json({ error: "siteId, fromOrgId, and toOrgId required" }, { status: 400 });
    }
    if (fromOrgId === toOrgId) {
      return NextResponse.json({ error: "Source and target org are the same" }, { status: 400 });
    }
    await moveSite(siteId, fromOrgId, toOrgId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
```

### 3. UI — Site Settings → Danger Zone

Add below the existing "Purge trash" section:

```
DANGER ZONE
┌─────────────────────────────────────────────────┐
│ Purge trash                                      │
│ [Purge trash]                                    │
├─────────────────────────────────────────────────┤
│ Move site to another organization                │
│ Transfer this site and all its settings to a     │
│ different organization.                          │
│                                                  │
│ Target organization: [WebHouse ▾]                │
│ [Move site]                                      │
└─────────────────────────────────────────────────┘
```

On click "Move site" → confirmation dialog: "Move **SproutLake** from **WebHouse** to **Client A**? Team access and settings will be preserved."

After move: update `cms-active-org` cookie to the target org, dispatch `cms-registry-change` event, refresh page.

### 4. Sites Dashboard — Context Menu

Also add "Move to..." option in the site card's `⋯` menu on `/admin/sites`:

```
┌────────────────┐
│ Edit           │
│ Move to...   → │ → submenu with org list
│ Delete         │
└────────────────┘
```

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/site-registry.ts` — add `moveSite()` function
- `packages/cms-admin/src/app/api/cms/registry/move-site/route.ts` — new API route
- `packages/cms-admin/src/components/settings/general-settings-panel.tsx` — add move UI in DangerZone
- `packages/cms-admin/src/app/admin/(workspace)/sites/page.tsx` — add "Move to..." context menu option

### Blast radius
- Registry write is atomic (single `saveRegistry()` call) — no partial state
- `defaultSiteId`/`defaultOrgId` may change if the moved site was the default — handled in `moveSite()`
- Team access (`_data/team-access.json`) is per-site, not per-org — stays intact
- Revalidation config is stored on the `SiteEntry` itself — moves with the site
- Active cookies (`cms-active-org`, `cms-active-site`) need updating in the UI after move

### Breaking changes
- None — new function and API route, no existing interfaces changed

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Move site from org A to org B via API
- [ ] Site appears in target org's site list
- [ ] Site disappears from source org's site list
- [ ] Default org/site updated if moved site was default
- [ ] Team access preserved after move
- [ ] Revalidation config preserved after move
- [ ] Cannot move to same org (400 error)
- [ ] Cannot move non-existent site (500 error)
- [ ] UI refreshes org switcher + site switcher after move

## Implementation Steps

1. Add `moveSite()` to `packages/cms-admin/src/lib/site-registry.ts`
2. Create `packages/cms-admin/src/app/api/cms/registry/move-site/route.ts`
3. Add "Move site" section to DangerZone in `general-settings-panel.tsx` with org dropdown + confirmation dialog
4. Add "Move to..." context menu option on Sites dashboard page
5. Handle post-move cookie update and registry refresh in UI
6. Test with filesystem and GitHub-backed sites

## Dependencies

- F76 (Create New Organization) — need multiple orgs to move between

## Effort Estimate

**Small** — 1 day

The backend is trivial (splice + push in registry JSON). The effort is in the UI — org dropdown, confirmation dialog, and post-move state refresh.
