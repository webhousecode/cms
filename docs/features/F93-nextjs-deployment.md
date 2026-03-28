# F93 — Next.js App Deployment

> Deploy Next.js sites (SSR/RSC) to Vercel, Netlify, or Fly.io from the CMS admin with one click.

## Problem

Currently F12 One-Click Deploy only handles static sites (build.ts → GitHub Pages). Next.js sites like webhouse-site and SproutLake use SSR, API routes, and RSC — they can't be deployed as static HTML. They need hosting providers that support Node.js runtimes (Vercel, Netlify, Fly.io).

## Solution

Extend the deploy system to support Next.js apps:
- **Vercel:** deploy hook URL (POST triggers rebuild from GitHub)
- **Netlify:** deploy hook URL (same pattern)
- **Fly.io:** Machines API restart or flyctl deploy
- The CMS already has deploy hooks built but untested

Key differences from static deploy:
- No build.ts — hosting provider builds the Next.js app
- Content changes trigger webhook to hosting provider
- Provider pulls from GitHub repo and rebuilds
- Custom domains managed by hosting provider, not CMS

## Technical Design

### 1. Deploy Hook Architecture (Already Built)

`deploy-service.ts` already handles Vercel, Netlify, Cloudflare, and custom providers via `postHook()` — a simple POST to a configured URL. Fly.io uses the Machines API to restart machines. This code exists but has never been tested with real endpoints.

```typescript
// Already in deploy-service.ts — just needs real testing
case "vercel":
case "netlify":
case "cloudflare":
case "custom":
  if (!config.deployHookUrl) throw new Error("Deploy hook URL not configured");
  await postHook(config.deployHookUrl);
  break;
```

### 2. Vercel Setup

1. User connects GitHub repo to Vercel project
2. User creates a deploy hook in Vercel Dashboard → Settings → Git → Deploy Hooks
3. User pastes the hook URL into CMS admin → Site Settings → Automation → Deploy Hook URL
4. CMS calls `POST https://api.vercel.com/v1/integrations/deploy/prj_xxx/xxx` on publish

**Deploy status polling:**

```typescript
// New: check Vercel deployment status after triggering
async function checkVercelStatus(token: string, projectId: string): Promise<DeployStatus> {
  const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return { state: "unknown", error: `API error: ${res.status}` };
  const data = await res.json() as { deployments: { state: string; url: string; createdAt: number }[] };
  const latest = data.deployments[0];
  if (!latest) return { state: "unknown" };
  return { state: latest.state, url: `https://${latest.url}`, createdAt: latest.createdAt };
}
```

### 3. Netlify Setup

1. User connects GitHub repo to Netlify site
2. User creates a build hook in Netlify → Site Settings → Build & Deploy → Build hooks
3. User pastes `https://api.netlify.com/build_hooks/xxx` into CMS admin
4. CMS calls `POST` on publish

**Deploy status polling:**

```typescript
async function checkNetlifyStatus(token: string, siteId: string): Promise<DeployStatus> {
  const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys?per_page=1`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return { state: "unknown", error: `API error: ${res.status}` };
  const data = await res.json() as { state: string; deploy_ssl_url: string; created_at: string }[];
  const latest = data[0];
  if (!latest) return { state: "unknown" };
  return { state: latest.state, url: latest.deploy_ssl_url, createdAt: Date.parse(latest.created_at) };
}
```

### 4. Fly.io Setup

Already implemented in `flyDeploy()` — lists machines and restarts them. For Next.js apps on Fly.io:

1. App deployed with `fly deploy` (Dockerfile-based)
2. CMS stores Fly API token + app name in site config
3. On content change, CMS restarts machines to pick up new content via revalidation webhook (F41) — or triggers a full redeploy if the app image needs updating

### 5. Auto-Deploy on Content Save

When a document is saved/published, and the site has a deploy provider configured with `autoDeployOnSave: true`:

```typescript
// In packages/cms-admin/src/app/api/cms/[collection]/[slug]/route.ts
// After successful save, trigger deploy if auto-deploy is enabled
if (siteConfig.autoDeployOnSave && siteConfig.deployProvider !== "off") {
  // Fire-and-forget — don't block the save response
  triggerDeploy().catch(err => console.error("[auto-deploy]", err));
}
```

For Next.js sites with revalidation (F41), auto-deploy is unnecessary — the webhook pushes content directly. Auto-deploy only matters when the hosting provider needs to rebuild (e.g., new pages, layout changes).

### 6. Deploy Status Checking

New `DeployStatus` type and unified status checker:

```typescript
export interface DeployStatus {
  state: "building" | "ready" | "error" | "queued" | "unknown";
  url?: string;
  createdAt?: number;
  error?: string;
}

export async function checkDeployStatus(): Promise<DeployStatus> {
  const config = await readSiteConfig();
  switch (config.deployProvider) {
    case "vercel":
      return checkVercelStatus(config.deployApiToken!, config.deployAppName!);
    case "netlify":
      return checkNetlifyStatus(config.deployApiToken!, config.deployAppName!);
    case "flyio":
      return checkFlyStatus(config.deployApiToken!, config.deployAppName!);
    case "github-pages":
      // Already implemented in checkGitHubPagesStatus()
      const gh = await checkGitHubPagesStatus(config.deployApiToken!, config.deployAppName!);
      return { state: gh.status === "built" ? "ready" : "building", url: gh.url };
    default:
      return { state: "unknown" };
  }
}
```

### 7. Environment Variables Management

Each provider manages env vars differently. The CMS admin shows a help section per provider:

- **Vercel:** env vars set in Vercel Dashboard or via `vercel env`
- **Netlify:** env vars set in Netlify Dashboard → Site Settings → Environment
- **Fly.io:** env vars set via `fly secrets set KEY=VALUE`

The CMS does not manage provider env vars — that's the provider's responsibility. The CMS only stores deploy-related config (hook URL, API token, app name).

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/deploy-service.ts` — add `checkDeployStatus()`, `checkVercelStatus()`, `checkNetlifyStatus()`, `checkFlyStatus()`, `DeployStatus` type
- `packages/cms-admin/src/app/api/admin/deploy/route.ts` — add GET handler for status polling
- `packages/cms-admin/src/components/settings/deploy-settings-panel.tsx` — add status indicator, auto-deploy toggle, provider-specific setup guides
- `packages/cms-admin/src/app/api/cms/[collection]/[slug]/route.ts` — add auto-deploy-on-save trigger
- `packages/cms-admin/src/lib/site-config.ts` — add `autoDeployOnSave` to config type

### Downstream dependents

`deploy-service.ts` is imported by:
- `app/api/admin/deploy/route.ts` — modified (this feature)
- `components/settings/deploy-settings-panel.tsx` — modified (this feature)

`site-config.ts` is imported by 15+ files — adding `autoDeployOnSave` is additive, no breaking change.

`app/api/cms/[collection]/[slug]/route.ts` — the document save endpoint. Adding a fire-and-forget deploy trigger after save is non-blocking. No impact on save response time or behavior.

### Blast radius
- Deploy hook POST is fire-and-forget after save — save response is never blocked
- Status polling is read-only (GET requests to provider APIs) — no side effects
- `autoDeployOnSave` defaults to `false` — opt-in, no behavior change for existing sites
- Provider API tokens are stored in site config (same as existing `deployApiToken`) — no new secret storage

### Breaking changes
- None. All changes are additive. Existing GitHub Pages deploy flow is unchanged.

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Vercel deploy hook: configure hook URL, trigger deploy, verify Vercel builds
- [ ] Netlify deploy hook: configure hook URL, trigger deploy, verify Netlify builds
- [ ] Fly.io restart: configure API token + app name, trigger deploy, verify machines restart
- [ ] Deploy status polling: verify status updates from building → ready
- [ ] Auto-deploy on save: enable toggle, save document, verify deploy triggers
- [ ] Auto-deploy off by default: new sites don't auto-deploy
- [ ] Error handling: invalid hook URL returns clear error in deploy log
- [ ] Deploy log: entries show provider, status, duration, URL for all providers

## Implementation Steps

1. Test existing deploy hook code with a real Vercel deploy hook endpoint
2. Add `DeployStatus` type and `checkDeployStatus()` to deploy-service.ts
3. Add Vercel status polling (`GET /v6/deployments`)
4. Add Netlify status polling (`GET /api/v1/sites/:id/deploys`)
5. Add Fly.io status checking (machine state via Machines API)
6. Add GET handler to `/api/admin/deploy` for status polling
7. Add status indicator to deploy settings panel (building/ready/error badge)
8. Add `autoDeployOnSave` toggle to site config and deploy settings panel
9. Wire auto-deploy trigger into document save endpoint
10. Document setup guide for each provider in deploy settings panel help text


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Phase 2 — OAuth Provider Integration (Seamless Deploy)

### Problem with Current Approach

The current deploy hook flow is manual: user must go to Vercel/Netlify dashboard, create a deploy hook, copy the URL, paste it in CMS admin. Competing CMS'er (Sanity, Contentful, Strapi) har "Connect Vercel" knapper der gør alt automatisk via OAuth.

### Solution: OAuth Integration per Provider

Same pattern as our GitHub OAuth (F91). Flowet:

1. Bruger klikker **"Connect Vercel"** i CMS admin Deploy Settings
2. OAuth popup → bruger godkender adgang til sin Vercel/Netlify konto
3. CMS får et API token tilbage
4. CMS kan nu via API: oprette projekter, linke repos, sætte deploy hooks, trigge builds — alt automatisk

### Vercel Integration

**Registration:** [vercel.com/docs/integrations](https://vercel.com/docs/integrations) — registrer en Vercel Integration (OAuth app), få client ID/secret.

**API capabilities med token:**
- `POST /v10/projects` — opret nyt Vercel projekt fra GitHub repo
- `POST /v1/integrations/deploy/:id` — trigger deploy programmatisk
- `GET /v6/deployments` — poll build status
- `POST /v1/projects/:id/env` — sæt environment variables
- `GET /v6/projects` — list brugerens projekter (for "link existing project" flow)

**UI flow:**
1. "Connect Vercel" → OAuth popup → token gemt i site config
2. "Create Project" → vælg repo fra dropdown → Vercel projekt oprettet + deploy hook sat automatisk
3. "Deploy" → et klik, ingen URL at paste

### Netlify Integration

**Registration:** [docs.netlify.com/api](https://docs.netlify.com/api/) — OAuth app registration.

**API capabilities med token:**
- `POST /api/v1/sites` — opret nyt site fra repo
- `POST /api/v1/sites/:id/builds` — trigger build
- `GET /api/v1/sites/:id/deploys` — poll status
- `POST /api/v1/sites/:id/build_hooks` — opret build hook programmatisk

### Implementation

```
packages/cms-admin/src/
  app/api/auth/vercel/           # OAuth callback (same pattern as GitHub)
  app/api/auth/netlify/          # OAuth callback
  lib/vercel-api.ts              # Vercel API wrapper
  lib/netlify-api.ts             # Netlify API wrapper
  components/settings/
    deploy-settings-panel.tsx    # Add "Connect Vercel/Netlify" buttons
```

### Effort Estimate

**Large** — 4-5 days per provider. OAuth registration, token management, API integration, project creation flow, error handling. Reuses patterns from F91 (GitHub OAuth).

---

## Dependencies

- F12 One-Click Publish (in progress — deploy hooks already built in deploy-service.ts)
- F41 GitHub Site Auto-Sync (done — revalidation webhook is the preferred path for content-only changes)
- F91 Login with GitHub (done — OAuth pattern to reuse)

## Effort Estimate

**Phase 1 (deploy hooks):** Medium — 2-3 days. Infrastructure exists, needs testing + status polling.

**Phase 2 (OAuth integration):** Large — 4-5 days per provider. Full OAuth flow + API integration.
