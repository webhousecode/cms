# F41 — GitHub Site Auto-Sync & Webhook Revalidation

> Automatic content synchronization for GitHub-backed sites: dev mode auto-pull, production webhook revalidation, CLI scaffolder for revalidation endpoints, and CLAUDE.md instructions for AI site builders.

## Problem

When a GitHub-backed site's content is changed via the CMS admin (which commits via GitHub API), the local dev server and production site have no way to know. The developer must manually `git pull` to see changes locally, and production sites only update on the next full rebuild. There is no feedback loop between "CMS commits content" and "site reflects the change."

This is distinct from F35 (Webhooks), which is a generic outbound webhook system for machine-to-machine events. F41 is specifically about the **GitHub site content sync lifecycle**: detecting that a CMS commit happened, pulling changes locally in dev, and triggering on-demand revalidation in production — including scaffolding the revalidation endpoint in the site itself.

## Relationship to Other Features

| Feature | Scope | Overlap |
|---------|-------|---------|
| **F35 Webhooks** | Generic outbound event dispatcher (content.created, content.published, etc.) with retry/logging | F41 *uses* F35's dispatcher to fire revalidation requests, but F41 adds the receiving side (endpoint scaffolding, CLAUDE.md instructions, dev sync) |
| **F36 Framework Integrations** | Framework-specific adapters (generateStaticParams, generateMetadata, etc.) | F36 mentions a `revalidateHandler` in passing — F41 fully specifies it and adds the dev-mode sync + scaffolding |
| **F12 One-Click Publish** | Deploy triggering (Vercel, Netlify, GitHub Pages) | F12 triggers full rebuilds; F41 triggers surgical on-demand revalidation of changed paths only |
| **F24 AI Playbook** | CLAUDE.md and AI builder instructions | F41 adds a revalidation section to the scaffolded CLAUDE.md |

## Solution

A four-part system:

1. **Dev mode auto-pull** — The CMS CLI `dev` command detects GitHub-backed sites and polls for new commits, running `git pull` automatically so the local dev server reflects CMS changes instantly.
2. **Production webhook revalidation** — After CMS commits content, dispatch a signed webhook to the site's `/api/revalidate` endpoint, which calls Next.js `revalidatePath()` (or framework equivalent) for only the changed paths.
3. **CLI scaffolder enhancement** — `npm create @webhouse/cms` generates `/api/revalidate/route.ts` with HMAC-SHA256 secret validation, ready to use.
4. **CLAUDE.md revalidation section** — Instructions for AI site builders on how to implement and configure revalidation.

## Technical Design

### Part 1 — Dev Mode Auto-Pull

When the CMS CLI `dev` command runs and detects a GitHub-backed site (local clone with `origin` pointing to a GitHub repo registered in the site registry), it starts a background polling loop.

```typescript
// packages/cms-cli/src/utils/git-sync.ts

export interface GitSyncOptions {
  cwd: string;
  intervalMs?: number;   // default: 5000 (5 seconds)
  branch?: string;       // default: current branch
  onPull?: (files: string[]) => void;
}

export class GitSyncWatcher {
  private timer: NodeJS.Timeout | null = null;
  private lastCommit: string | null = null;

  constructor(private options: GitSyncOptions) {}

  /** Start polling for new commits */
  async start(): Promise<void> {
    this.lastCommit = await this.getHeadCommit();
    this.timer = setInterval(() => this.check(), this.options.intervalMs ?? 5000);
  }

  /** Stop polling */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async check(): Promise<void> {
    // 1. git fetch origin <branch> --quiet
    // 2. Compare local HEAD with origin/<branch>
    // 3. If behind: git pull --ff-only
    // 4. Parse changed files from git diff --name-only
    // 5. Call onPull callback with changed file list
  }

  private async getHeadCommit(): Promise<string> {
    // Returns current HEAD sha via: git rev-parse HEAD
  }
}
```

Integration in `dev` command:

```typescript
// packages/cms-cli/src/commands/dev.ts — additions

import { GitSyncWatcher } from '../utils/git-sync.js';

// After starting the dev server, if cwd is a git repo:
const watcher = new GitSyncWatcher({
  cwd,
  intervalMs: 5000,
  onPull: (files) => {
    const contentFiles = files.filter(f => f.startsWith('content/'));
    if (contentFiles.length > 0) {
      logger.info(`Pulled ${contentFiles.length} content change(s) from GitHub`);
      contentFiles.forEach(f => logger.log(`  ${f}`));
    }
  },
});

try {
  await watcher.start();
  logger.info('Git auto-sync enabled (polling every 5s)');
} catch {
  // Not a git repo or no remote — skip silently
}
```

**Safety:**
- Only uses `--ff-only` — never force-pulls or creates merge commits
- If pull fails (merge conflict, dirty working tree), logs a warning and stops polling
- Polling is lightweight: `git fetch` + `git rev-parse` are fast local operations

### Part 2 — Production Webhook Revalidation

When the CMS saves content to a GitHub-backed site, it dispatches a revalidation webhook to the site's configured revalidation URL. This builds on F35's `WebhookDispatcher` but with a specific preset and payload format optimized for on-demand revalidation.

#### Site Settings — Revalidation URL Field

Add a `revalidateUrl` field to `SiteEntry`:

```typescript
// packages/cms-admin/src/lib/site-registry.ts — additions to SiteEntry

export interface SiteEntry {
  // ... existing fields ...
  revalidateUrl?: string;      // e.g. "https://example.com/api/revalidate"
  revalidateSecret?: string;   // HMAC-SHA256 signing secret
}
```

#### Admin UI — Site Settings

Add a "Revalidation" section to the site settings page:

```
Site Settings
┌──────────────────────────────────────────────┐
│ REVALIDATION                                  │
│                                               │
│ Revalidation URL                              │
│ ┌───────────────────────────────────────────┐ │
│ │ https://example.com/api/revalidate        │ │
│ └───────────────────────────────────────────┘ │
│                                               │
│ Webhook Secret                                │
│ ┌───────────────────────────────────────────┐ │
│ │ ••••••••••••••••••••••••••••••••          │ │
│ └───────────────────────────────────────────┘ │
│ [Generate] [Copy]                             │
│                                               │
│ ℹ  Add this URL and secret to your site's    │
│    .env file as REVALIDATE_SECRET.            │
│    See the scaffolded /api/revalidate route.  │
│                                               │
│ [Send test ping]                              │
└──────────────────────────────────────────────┘
```

#### Revalidation Payload

```json
{
  "event": "content.revalidate",
  "timestamp": "2026-03-15T10:00:00Z",
  "site": "my-site",
  "paths": [
    "/blog/hello-world",
    "/blog"
  ],
  "collection": "posts",
  "slug": "hello-world",
  "action": "updated"
}
```

The `paths` array is computed from the collection and slug:
- Document path: `/${collection}/${slug}` (e.g., `/blog/hello-world`)
- Collection index: `/${collection}` (e.g., `/blog`)
- Homepage: `/` (always included for singletons or if collection is `pages`)

Headers:
- `Content-Type: application/json`
- `X-CMS-Event: content.revalidate`
- `X-CMS-Signature: sha256=<hmac>` (HMAC-SHA256 of body using `revalidateSecret`)

#### Dispatch Hook

```typescript
// packages/cms-admin/src/lib/revalidation.ts

import crypto from 'node:crypto';

export async function dispatchRevalidation(site: SiteEntry, payload: {
  collection: string;
  slug: string;
  action: 'created' | 'updated' | 'deleted';
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!site.revalidateUrl) return { ok: true }; // No URL configured, skip

  const paths = computeRevalidationPaths(payload.collection, payload.slug);

  const body = JSON.stringify({
    event: 'content.revalidate',
    timestamp: new Date().toISOString(),
    site: site.id,
    paths,
    collection: payload.collection,
    slug: payload.slug,
    action: payload.action,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-CMS-Event': 'content.revalidate',
  };

  if (site.revalidateSecret) {
    const signature = crypto
      .createHmac('sha256', site.revalidateSecret)
      .update(body)
      .digest('hex');
    headers['X-CMS-Signature'] = `sha256=${signature}`;
  }

  try {
    const res = await fetch(site.revalidateUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function computeRevalidationPaths(collection: string, slug: string): string[] {
  const paths = [`/${collection}/${slug}`, `/${collection}`];
  if (collection === 'pages' || slug === 'index' || slug === 'homepage') {
    paths.push('/');
  }
  return paths;
}
```

This is called from the existing content save flow in the admin, after the GitHub API commit succeeds.

### Part 3 — CLI Scaffolder Enhancement

The `npm create @webhouse/cms` scaffolder generates a revalidation API route in the new site.

```typescript
// Generated file: app/api/revalidate/route.ts

import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

const SECRET = process.env.REVALIDATE_SECRET;

export async function POST(request: NextRequest) {
  // 1. Verify signature
  const signature = request.headers.get('x-cms-signature');
  const body = await request.text();

  if (SECRET && signature) {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', SECRET)
      .update(body)
      .digest('hex');

    if (signature !== expected) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } else if (SECRET && !signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  // 2. Parse payload
  const payload = JSON.parse(body);
  const paths: string[] = payload.paths ?? [];

  // 3. Revalidate each path
  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({
    revalidated: true,
    paths,
    timestamp: new Date().toISOString(),
  });
}
```

The scaffolder also adds `REVALIDATE_SECRET` to the generated `.env.example`:

```env
# Webhook secret for CMS revalidation (generate with: openssl rand -hex 32)
REVALIDATE_SECRET=
```

### Part 4 — CLAUDE.md Revalidation Section

Add a section to the scaffolded project CLAUDE.md (generated by `packages/create-cms/src/index.ts`):

```markdown
## On-Demand Revalidation

This site supports automatic revalidation when content changes in the CMS.

### How it works
1. Editor saves content in the CMS admin
2. CMS commits the change to GitHub via API
3. CMS sends a signed webhook to `/api/revalidate`
4. The revalidation route calls `revalidatePath()` for changed paths
5. Next.js serves fresh content on the next request

### Setup
1. Generate a secret: `openssl rand -hex 32`
2. Add it to your site's `.env` as `REVALIDATE_SECRET`
3. In CMS admin → Site Settings → Revalidation:
   - URL: `https://your-site.com/api/revalidate`
   - Secret: same value as REVALIDATE_SECRET
4. The `/api/revalidate/route.ts` endpoint is already scaffolded

### Testing
```bash
curl -X POST http://localhost:3000/api/revalidate \
  -H "Content-Type: application/json" \
  -d '{"paths": ["/blog", "/blog/test-post"]}'
```

### For AI site builders
When creating new pages or routes, ensure the path mapping in the CMS matches
your Next.js route structure. The CMS sends `/{collection}/{slug}` as paths.
If your routes differ (e.g., `/articles/[slug]` instead of `/posts/[slug]`),
add a path mapping in `cms.config.ts`:

```typescript
defineCollection({
  name: 'posts',
  urlPrefix: '/articles',  // CMS will send /articles/{slug} for revalidation
  // ...
})
```
```

## Implementation Steps

1. **Create `packages/cms-cli/src/utils/git-sync.ts`** — GitSyncWatcher class with polling logic
2. **Update `packages/cms-cli/src/commands/dev.ts`** — Start GitSyncWatcher when cwd is a git repo with GitHub remote
3. **Add `revalidateUrl` and `revalidateSecret` fields to `SiteEntry`** in `packages/cms-admin/src/lib/site-registry.ts`
4. **Create `packages/cms-admin/src/lib/revalidation.ts`** — dispatchRevalidation function
5. **Wire revalidation into content save flow** — Call dispatchRevalidation after successful GitHub API commit
6. **Add "Revalidation" section to Site Settings UI** — URL input, secret input with generate/copy buttons, test ping button
7. **Update `packages/create-cms/src/index.ts`** — Generate `app/api/revalidate/route.ts` and `.env.example` entry
8. **Update scaffolded CLAUDE.md** — Add revalidation section with setup instructions and AI builder notes
9. **Add `urlPrefix` support to collection config** — Used for path mapping in revalidation payload
10. **Add revalidation delivery log** — Store last 50 revalidation attempts in `_data/revalidation-log.json` for debugging

## Configuration Example

```typescript
// cms.config.ts — collection with custom URL prefix for revalidation
import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'posts',
      urlPrefix: '/blog',  // revalidation sends /blog/{slug}
      fields: [/* ... */],
    }),
  ],
});
```

```json
// _admin/registry.json — site with revalidation configured
{
  "id": "my-site",
  "name": "My Site",
  "adapter": "github",
  "configPath": "github://owner/repo/cms.config.ts",
  "revalidateUrl": "https://my-site.com/api/revalidate",
  "revalidateSecret": "abc123...",
  "github": {
    "owner": "my-org",
    "repo": "my-site",
    "branch": "main",
    "token": "env:GITHUB_TOKEN"
  }
}
```

## Dependencies

- **F35 Webhooks** — F41 can optionally use F35's dispatcher for retry logic and delivery logging, but works standalone with direct `fetch` calls
- **#06 GitHub storage adapter** — existing, used for reading/writing content via GitHub API (Done)
- **#21 Plugin lifecycle hooks** — for wiring revalidation dispatch after content changes (Done)

## Effort Estimate

**Medium** — 3-4 days

- Day 1: GitSyncWatcher + dev command integration
- Day 2: Revalidation dispatch + site settings UI fields
- Day 3: Scaffolder updates (route.ts, .env.example, CLAUDE.md section)
- Day 4: Testing, urlPrefix support, delivery log
