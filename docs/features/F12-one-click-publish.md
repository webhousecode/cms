# F12 — One-Click Publish (OcP)

> Single-button deployment from admin with support for Vercel, Netlify, Fly.io, and Cloudflare Pages.

## Problem

After editing content, users must manually trigger deploys through external services. There is no deploy integration in the admin UI. Users cannot see deploy status or preview URLs without leaving the CMS.

## Solution

A deploy integration system that connects to hosting providers via their APIs. A "Publish Site" button in admin triggers a deploy (typically via git push or webhook). Deploy status, preview URLs, and rollback are visible in the admin.

## Technical Design

### Deploy Providers

```typescript
// packages/cms-admin/src/lib/deploy/types.ts

export type DeployProvider = 'vercel' | 'netlify' | 'flyio' | 'cloudflare-pages' | 'github-pages';

export interface DeployConfig {
  provider: DeployProvider;
  projectId?: string;
  teamId?: string;
  apiToken: string;
  productionBranch?: string;  // default: 'main'
  buildCommand?: string;
  outputDir?: string;
}

export interface Deploy {
  id: string;
  provider: DeployProvider;
  status: 'queued' | 'building' | 'ready' | 'error';
  url?: string;
  previewUrl?: string;
  commitSha?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface DeployAdapter {
  trigger(config: DeployConfig): Promise<Deploy>;
  getStatus(config: DeployConfig, deployId: string): Promise<Deploy>;
  rollback(config: DeployConfig, deployId: string): Promise<Deploy>;
  listDeploys(config: DeployConfig, limit?: number): Promise<Deploy[]>;
}
```

### Provider Implementations

```typescript
// packages/cms-admin/src/lib/deploy/vercel.ts
export class VercelAdapter implements DeployAdapter {
  // Uses Vercel API: POST /v13/deployments
  // Or triggers via git push (GitHub integration)
}

// packages/cms-admin/src/lib/deploy/netlify.ts
export class NetlifyAdapter implements DeployAdapter {
  // Uses Netlify API: POST /api/v1/sites/{site_id}/builds
}

// packages/cms-admin/src/lib/deploy/github-pages.ts
export class GitHubPagesAdapter implements DeployAdapter {
  // Triggers GitHub Actions workflow_dispatch
}
```

### Git-Based Deploy (Preferred Path)

For GitHub-backed sites, deploy = commit + push. The existing GitHub storage adapter handles commits. The hosting provider's GitHub integration auto-deploys.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/deploy/trigger` | Trigger a deploy |
| `GET` | `/api/admin/deploy/status` | Get latest deploy status |
| `GET` | `/api/admin/deploy/history` | List recent deploys |
| `POST` | `/api/admin/deploy/rollback/[id]` | Rollback to a previous deploy |

### Admin UI

- Deploy button in top nav bar (next to site selector)
- Deploy status indicator (green dot = live, yellow = building, red = error)
- Deploy history panel in settings
- Rollback button on each deploy in history

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/deploy/types.ts` — new deploy interfaces
- `packages/cms-admin/src/lib/deploy/vercel.ts` — new Vercel adapter
- `packages/cms-admin/src/lib/deploy/netlify.ts` — new Netlify adapter
- `packages/cms-admin/src/lib/deploy/github-pages.ts` — new GitHub Pages adapter
- `packages/cms-admin/src/app/api/admin/deploy/` — new API routes
- `packages/cms-admin/src/components/TopNav.tsx` — add deploy button
- `packages/cms-admin/src/app/admin/settings/deploy/page.tsx` — new deploy settings

### Blast radius
- Top navigation bar changes — affects all admin pages
- Deploy on publish could trigger unexpected builds for GitHub-backed sites

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Deploy button triggers Vercel/Netlify build
- [ ] Deploy status indicator updates correctly
- [ ] Deploy history shows past deployments
- [ ] Rollback triggers correctly

## Implementation Steps

1. Create `packages/cms-admin/src/lib/deploy/types.ts` with interfaces
2. Implement Vercel adapter using Vercel REST API
3. Implement Netlify adapter using Netlify API
4. Implement GitHub Pages adapter using `workflow_dispatch`
5. Create API routes at `packages/cms-admin/src/app/api/admin/deploy/`
6. Add deploy config to site settings UI (provider selection, API token, project ID)
7. Add deploy button to admin top nav (`packages/cms-admin/src/components/TopNav.tsx`)
8. Add deploy status indicator with polling
9. Build deploy history page at `packages/cms-admin/src/app/admin/settings/deploy/page.tsx`
10. For GitHub-backed sites: auto-trigger deploy on content publish (git push)

## Dependencies

- GitHub storage adapter (for git-based deploy flow)
- API tokens from hosting providers

## Effort Estimate

**Medium** — 4-5 days
