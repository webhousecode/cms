# Multi-Site Admin — Design Document

> One cms-admin instance. Multiple sites. Runtime switching.

## Overview

A single `cms-admin` on port 3010 manages N sites. Each site has its own
config, content storage, uploads, and users. The admin UI provides a site
switcher to move between them without restart.

## Test Setup (proof of concept)

```
cms-admin (port 3010)
├── "webhouse-site"  → local filesystem, /Users/cb/Apps/webhouse/webhouse-site
├── "landing"        → local filesystem, /Users/cb/Apps/webhouse/cms/examples/landing
└── "client-x"       → GitHub storage, webhousecode/client-x-content repo
```

## Architecture

### 1. Site Registry

Admin stores registered sites in its own config file, separate from any site.

**Location:** `_admin/sites.json` (in admin's own data dir, NOT in any site)

```json
{
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
    },
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
  ],
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

The active site is stored as a cookie: `cms-active-site=webhouse-site`

Every API request reads this cookie to determine which CMS instance to use.

```typescript
// Pseudocode for the core switch
async function getActiveCms(request: NextRequest): Promise<CmsInstance> {
  const siteId = request.cookies.get("cms-active-site")?.value
    ?? registry.defaultSiteId;

  return sitePool.getOrCreate(siteId);
}
```

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
┌──────────────────────────────────────────────────────┐
│  ☰  Dashboard            ▼ WebHouse Site    [avatar] │
│                           ──────────────             │
│                           ● WebHouse Site            │
│                           ○ Landing Page             │
│                           ○ Client X (GH)            │
│                           ──────────────             │
│                           + Add site                 │
│                           ⚙ Manage sites             │
└──────────────────────────────────────────────────────┘
```

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

1. **Site registry** — `_admin/sites.json`, CRUD API, seed with webhouse-site + landing
2. **Instance pool** — `SitePool` class, lazy creation, config loading
3. **Request scoping** — Middleware reads `cms-active-site` cookie, injects into request context
4. **Refactor `getAdminCms()`** — Read from pool instead of env var
5. **Site switcher UI** — Dropdown in sidebar
6. **GitHub adapter test** — Create `client-x-content` repo, register as third site
7. **Polish** — Seamless switching, collection reload, cache invalidation

### 10. Files to Change

| File | Change |
|------|--------|
| `packages/cms-admin/src/lib/cms.ts` | `getAdminCms()` reads from pool, not env |
| `packages/cms-admin/src/lib/site-registry.ts` | NEW — registry CRUD |
| `packages/cms-admin/src/lib/site-pool.ts` | NEW — instance pool |
| `packages/cms-admin/src/middleware.ts` | Read `cms-active-site` cookie |
| `packages/cms-admin/src/app/api/cms/sites/` | NEW — API routes for registry |
| `packages/cms-admin/src/components/sidebar.tsx` | Site switcher dropdown |
| `packages/cms-admin/src/components/site-switcher.tsx` | NEW — switcher component |
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
