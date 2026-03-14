# Multi-Site Admin — Design Document

> One cms-admin instance. Multiple organizations. Multiple sites per org. Runtime switching.

## Overview

A single `cms-admin` on port 3010 manages N organizations, each with M sites.
Each site has its own config, content storage, uploads, and users. The admin UI
provides org + site switchers to move between them without restart.

## Test Setup (proof of concept)

```
cms-admin (port 3010)
├── Org: "WebHouse" (id: webhouse)
│   ├── "WebHouse Site"  → local filesystem
│   └── "Landing Page"   → local filesystem
├── Org: "Clients" (id: clients)
│   └── "Client X"       → GitHub storage
└── Org: "Personal" (id: personal)   ← default org for single-site mode
    └── (auto-created from CMS_CONFIG_PATH)
```

## Architecture

### 1. Site Registry

Admin stores registered sites in its own config file, separate from any site.

**Location:** `_admin/registry.json` (in admin's own data dir, NOT in any site)

```json
{
  "orgs": [
    {
      "id": "webhouse",
      "name": "WebHouse",
      "sites": [
        {
          "id": "webhouse-site",
          "name": "WebHouse Site",
          "adapter": "filesystem",
          "configPath": "/Users/cb/Apps/webhouse/webhouse-site/cms.config.ts",
          "contentDir": "/Users/cb/Apps/webhouse/webhouse-site/content",
          "uploadDir": "/Users/cb/Apps/webhouse/webhouse-site/public/uploads",
          "previewUrl": "http://localhost:3009"
        },
        {
          "id": "landing",
          "name": "Landing Page",
          "adapter": "filesystem",
          "configPath": "/Users/cb/Apps/webhouse/cms/examples/landing/cms.config.ts",
          "contentDir": "/Users/cb/Apps/webhouse/cms/examples/landing/content",
          "uploadDir": "/Users/cb/Apps/webhouse/cms/examples/landing/public"
        }
      ]
    },
    {
      "id": "clients",
      "name": "Clients",
      "sites": [
        {
          "id": "client-x",
          "name": "Client X",
          "adapter": "github",
          "github": {
            "owner": "webhousecode",
            "repo": "client-x-content",
            "branch": "main",
            "contentDir": "content",
            "token": "env:GITHUB_TOKEN_CLIENT_X"
          },
          "configPath": "github://webhousecode/client-x-content/cms.config.ts"
        }
      ]
    }
  ],
  "defaultOrgId": "webhouse",
  "defaultSiteId": "webhouse-site"
}
```

### 2. Site-Scoped Isolation

Each site gets its own isolated instances. Nothing is shared between sites:

| Resource | Scope | Notes |
|----------|-------|-------|
| `CmsConfig` | Per site | Loaded from site's cms.config.ts |
| `ContentService` | Per site | Uses site's storage adapter |
| `StorageAdapter` | Per site | Filesystem or GitHub |
| Content files | Per site | Site's own contentDir |
| Uploads | Per site | Site's own uploadDir |
| Users | Per site | `{contentDir}/_data/users.json` |
| SQLite DB | Per site | If using sqlite adapter, separate .db per site |
| AI config | Per site | `{contentDir}/_data/ai-config.json` |
| Agents | Per site | `{contentDir}/_data/agents/` |
| Brand voice | Per site | `{contentDir}/_data/brand-voice.json` |

**Admin-level resources** (shared across sites):
- Admin's own settings (theme, UI preferences)
- Site registry itself
- MCP server configs (could be per-site or shared)

### 3. Active Site Session

Two cookies track the active context:
- `cms-active-org=webhouse`
- `cms-active-site=webhouse-site`

Every API request reads these cookies to determine which CMS instance to use.

```typescript
async function getActiveCms(request: NextRequest): Promise<CmsInstance> {
  const orgId = request.cookies.get("cms-active-org")?.value ?? registry.defaultOrgId;
  const siteId = request.cookies.get("cms-active-site")?.value ?? registry.defaultSiteId;

  return sitePool.getOrCreate(orgId, siteId);
}
```

### 3b. Backwards Compatibility — Single-Site Mode

When `CMS_CONFIG_PATH` env var is set and NO `_admin/registry.json` exists,
admin runs in **single-site mode** exactly as today:

```
┌─────────────────────────────────────────────────────────────┐
│ Startup                                                     │
│                                                             │
│  CMS_CONFIG_PATH set?  ──yes──→  registry.json exists?      │
│       │                              │            │         │
│       no                            yes           no        │
│       │                              │            │         │
│       ▼                              ▼            ▼         │
│   ERROR: no config              Multi-site    Single-site   │
│                                 mode          mode          │
│                                                             │
│  Single-site mode:                                          │
│  - getAdminCms() reads CMS_CONFIG_PATH directly (as today)  │
│  - No site switcher shown in UI                             │
│  - No org switcher shown in UI                              │
│  - Zero breaking changes                                    │
│                                                             │
│  Multi-site mode:                                           │
│  - getAdminCms() reads from SitePool                        │
│  - CMS_CONFIG_PATH is ignored (registry is source of truth) │
│  - Site switcher + org switcher shown in header              │
└─────────────────────────────────────────────────────────────┘
```

**How getAdminCms() changes:**

```typescript
// BEFORE (current code)
export async function getAdminCms() {
  const configPath = process.env.CMS_CONFIG_PATH;
  if (!configPath) throw new Error("CMS_CONFIG_PATH not set");
  const config = await loadConfig(configPath);
  return createCms(config);
}

// AFTER (backwards compatible)
export async function getAdminCms(request?: NextRequest) {
  const registry = await loadRegistry();      // returns null if no registry.json

  if (!registry) {
    // Single-site mode — exactly as before
    const configPath = process.env.CMS_CONFIG_PATH;
    if (!configPath) throw new Error("CMS_CONFIG_PATH not set");
    const config = await loadConfig(configPath);
    return createCms(config);
  }

  // Multi-site mode — read from pool
  const orgId = request?.cookies.get("cms-active-org")?.value ?? registry.defaultOrgId;
  const siteId = request?.cookies.get("cms-active-site")?.value ?? registry.defaultSiteId;
  return sitePool.getOrCreate(orgId, siteId);
}
```

The signature change (optional `request` param) is backwards compatible.
All existing call sites pass no argument and get single-site behavior.

### 4. CMS Instance Pool

A pool manages CMS instances per site. Instances are created lazily and
cached. When a site's config changes, its instance is invalidated.

```typescript
class SitePool {
  private instances: Map<string, { cms: CmsEngine; config: CmsConfig }>;

  async getOrCreate(siteId: string): Promise<CmsInstance> {
    if (this.instances.has(siteId)) return this.instances.get(siteId);

    const site = registry.getSite(siteId);
    const config = await loadConfig(site.configPath);
    const storage = await createStorageAdapter(site);
    const cms = await createCms(config, { storage });

    this.instances.set(siteId, { cms, config });
    return { cms, config };
  }

  invalidate(siteId: string) {
    this.instances.delete(siteId);
  }
}
```

### 5. GitHub Storage Adapter

For `client-x`, the existing `GitHubStorageAdapter` reads/writes content
via GitHub REST API. This means:

- Content lives in a GitHub repo (not on local disk)
- Admin reads/writes via API calls (slightly slower, but works from anywhere)
- Git history = audit trail for free
- CI/CD can trigger on push (deploy on content change)
- Token stored as env var reference (`env:GITHUB_TOKEN_CLIENT_X`)

### 6. UI — Site Switcher

**Location:** Header bar, to the LEFT of the user avatar (same position as the
original `OrgSwitcher` component in `user-org-bar.tsx` which still exists but
is not imported).

```
┌────────────────────────────────────────────────────────────┐
│  ☰  Dashboard         ▼ WebHouse  ▼ WebHouse Site  [avatar] │
│                        ─────────   ───────────────         │
│                        ● WebHouse  ● WebHouse Site         │
│                        ○ Clients   ○ Landing Page          │
│                        ○ Personal  ───────────────         │
│                        ─────────   + Add site              │
│                        + New org                           │
└────────────────────────────────────────────────────────────┘
```

When switching org, the site dropdown updates to show that org's sites.
The first site in the org is auto-selected.

Switching sites:
1. Sets `cms-active-site` cookie
2. Full page reload (simplest — ensures all server components re-render with new config)
3. Sidebar collections update automatically (they come from the active site's config)

**Backwards compatibility (single-site mode):**
If `CMS_CONFIG_PATH` env var is set and no site registry exists, admin runs
in single-site mode exactly as before. No switcher shown. No breaking changes.

### 7. Auth Considerations

Users are per-site. When switching sites:
- User must be authenticated for the target site
- If same email exists in both sites → seamless switch
- If not → redirect to login for that site
- Admin could maintain a "super admin" concept that accesses all sites

**Pragmatic v1:** Share users across all sites managed by this admin instance.
Store users in admin's own `_admin/users.json` instead of per-site.
Per-site user scoping can come in v2.

### 8. Config Loading

For **local sites**: `jiti` loads cms.config.ts from disk (already works).

For **GitHub sites**: Fetch cms.config.ts from repo via GitHub API, eval with jiti.
Cache locally with TTL. Re-fetch on manual refresh or webhook.

### 9. Implementation Order

1. **Registry file + types** — `_admin/registry.json` schema, TypeScript types, load/save helpers
2. **Seed registry** — Auto-create from CMS_CONFIG_PATH on first boot if no registry exists
3. **SitePool** — Lazy CMS instance creation, keyed by `orgId:siteId`
4. **Refactor `getAdminCms()`** — Backwards-compatible: env var fallback → pool lookup
5. **Cookie middleware** — Read `cms-active-org` + `cms-active-site` cookies, pass to API
6. **API routes** — `/api/cms/registry` CRUD for orgs and sites
7. **Org switcher UI** — Dropdown in header, left of site switcher
8. **Site switcher UI** — Dropdown in header, left of user avatar
9. **Add landing site** — Register examples/landing via UI or API
10. **GitHub adapter test** — Create `client-x-content` repo, register as third site
11. **Polish** — Collection reload on switch, cache invalidation, loading states

### 10. Files to Change

| File | Change |
|------|--------|
| `packages/cms-admin/src/lib/cms.ts` | `getAdminCms()` backwards-compat refactor |
| `packages/cms-admin/src/lib/site-registry.ts` | NEW — registry load/save, types |
| `packages/cms-admin/src/lib/site-pool.ts` | NEW — instance pool, keyed by org:site |
| `packages/cms-admin/src/middleware.ts` | Read `cms-active-org` + `cms-active-site` cookies |
| `packages/cms-admin/src/app/api/cms/registry/` | NEW — CRUD API for orgs + sites |
| `packages/cms-admin/src/components/admin-header.tsx` | Add org + site switchers |
| `packages/cms-admin/src/components/org-switcher.tsx` | NEW — org dropdown |
| `packages/cms-admin/src/components/site-switcher.tsx` | NEW — site dropdown |
| `packages/cms-admin/src/components/user-org-bar.tsx` | REUSE — existing component, refactor |
| `packages/cms/src/storage/github/adapter.ts` | Verify/fix for real usage |

### 11. Risks & Open Questions

- **Performance:** GitHub adapter adds latency. Content listing could be slow for large repos.
  Mitigation: Local cache with invalidation via webhooks.
- **Config eval:** Running arbitrary TypeScript from GitHub repos is a security concern.
  Mitigation: Sandbox or validate config schema before eval.
- **Concurrent edits:** Two admins editing the same GitHub-backed site could conflict.
  Mitigation: GitHub's built-in conflict detection via SHA comparison.
- **File watching:** `chokidar` watches don't work for GitHub-backed sites.
  Mitigation: Poll or webhook-based invalidation.
