# F56 — GitHub Live Content

> Bidirectional sync between a GitHub repo and the CMS — edit files locally, commit + push, or pull remote changes made by external AI agents.

## Problem

Today the CMS stores content either as local filesystem JSON or as GitHub-backed JSON documents via the GitHub storage adapter. There's no way to:

1. Work with **raw files** (HTML, JS, Markdown, CSS, SVGs) stored in a GitHub repo as first-class CMS content
2. Let an **external AI** (Claude Code, Cursor, Windsurf, etc.) push changes to a repo and have the CMS pick them up
3. **Edit those files locally** in the CMS admin (code editor, visual editor, preview) and commit + push back

This means external collaborators and AI agents can't contribute content without going through the CMS API — which limits the power of the CMS as a content hub.

## Solution

A "GitHub Live Content" connector that mounts a GitHub repo (or subdirectory) as a content source in the CMS. Files are pulled into a local cache for instant editing and preview, then committed and pushed back. A webhook listener (or polling) detects remote changes and pulls them in. This turns any GitHub repo into a collaborative content workspace where both humans in the CMS admin and external AI agents can work on the same files.

## Technical Design

### Content Source Registration

Add a new content source type in the site registry:

```typescript
// In registry.json — site entry gets a new `liveContent` array
{
  "id": "webhouse-site",
  "adapter": "filesystem",
  "liveContent": [
    {
      "id": "interactives-repo",
      "label": "Interactives",
      "repo": "cbroberg/cms-interactives",
      "branch": "main",
      "path": "",                    // subdirectory in repo, "" = root
      "localDir": "live-content/interactives",  // relative to site's cache dir
      "fileTypes": ["html", "js", "css", "md", "json", "svg"],
      "syncMode": "pull-push",      // "pull-only" | "push-only" | "pull-push"
      "autoSync": true,             // poll for remote changes
      "pollInterval": 60            // seconds between polls (0 = webhook only)
    }
  ]
}
```

### Sync Engine

```typescript
// packages/cms-admin/src/lib/live-content/sync.ts

export interface LiveContentSource {
  id: string;
  label: string;
  repo: string;          // "owner/repo"
  branch: string;
  path: string;          // subdirectory filter
  localDir: string;      // absolute path to local cache
  fileTypes: string[];
  syncMode: "pull-only" | "push-only" | "pull-push";
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: string[];   // files changed both locally and remotely
  errors: string[];
}

export class LiveContentSync {
  constructor(
    private source: LiveContentSource,
    private githubToken: string,
  ) {}

  /** Pull remote changes into local cache */
  async pull(): Promise<SyncResult>;

  /** Push local changes to remote */
  async push(message?: string): Promise<SyncResult>;

  /** Full bidirectional sync: pull first, then push */
  async sync(): Promise<SyncResult>;

  /** List all files in the local cache */
  async listFiles(): Promise<LiveContentFile[]>;

  /** Read a single file */
  async readFile(relativePath: string): Promise<string>;

  /** Write a single file locally (does NOT push) */
  async writeFile(relativePath: string, content: string): Promise<void>;

  /** Get diff between local and remote */
  async diff(): Promise<FileDiff[]>;
}
```

### Implementation: Git-based sync

Use `simple-git` (npm package) for efficient clone/pull/push instead of GitHub Contents API (which is slow for multi-file operations):

```typescript
// packages/cms-admin/src/lib/live-content/git-sync.ts

import simpleGit from "simple-git";

export class GitLiveContentSync implements LiveContentSync {
  private git: SimpleGit;

  async init(): Promise<void> {
    // Shallow clone on first use, then pull on subsequent syncs
    if (!existsSync(this.source.localDir)) {
      await this.git.clone(repoUrl, this.source.localDir, [
        "--branch", this.source.branch,
        "--single-branch",
        "--depth", "1",
      ]);
    }
  }

  async pull(): Promise<SyncResult> {
    await this.git.cwd(this.source.localDir);
    const result = await this.git.pull();
    return { pulled: result.summary.changes, pushed: 0, conflicts: [], errors: [] };
  }

  async push(message?: string): Promise<SyncResult> {
    await this.git.cwd(this.source.localDir);
    await this.git.add(".");
    await this.git.commit(message ?? "cms: update live content");
    await this.git.push();
    // ...count staged files
  }
}
```

### API Routes

```
GET    /api/live-content                        → list all sources
GET    /api/live-content/[sourceId]/files        → list files in source
GET    /api/live-content/[sourceId]/file?path=x  → read file content
PUT    /api/live-content/[sourceId]/file?path=x  → write file (local only)
POST   /api/live-content/[sourceId]/pull         → pull remote changes
POST   /api/live-content/[sourceId]/push         → commit + push local changes
POST   /api/live-content/[sourceId]/sync         → bidirectional sync
GET    /api/live-content/[sourceId]/diff         → show local vs remote diff
```

### Admin UI

New page at `/admin/live-content` (sidebar item under Media):

1. **Source list** — cards showing each connected repo, sync status, file count, last sync time
2. **File browser** — tree view of files in a source, with file type icons
3. **File editor** — Monaco/CodeMirror editor for HTML/JS/CSS/MD, with:
   - Syntax highlighting per file type
   - Preview pane (iframe for HTML, rendered markdown for .md)
   - Save (local) / Commit + Push buttons
4. **Sync controls** — Pull, Push, Sync buttons with diff preview before push
5. **Activity log** — recent sync operations, who changed what

### External Trigger: Webhook + Pull API

Two ways for an external agent to tell the CMS "I've pushed, come get it":

**1. GitHub Webhook (automatic)**

```
POST /api/live-content/webhook
```

Receives GitHub `push` events. Verifies HMAC signature. Triggers auto-pull for the matching source. Set up once in GitHub repo → Settings → Webhooks, and every push triggers a pull. Zero effort for the external AI.

**2. Direct Pull API (explicit)**

```
POST /api/live-content/[sourceId]/pull
Authorization: Bearer <cms-service-token>
```

An external AI agent (Claude Code, Cursor, etc.) calls this endpoint directly after pushing to the repo. No GitHub webhook setup needed — the agent just does `git push && curl -X POST https://cms.example/api/live-content/my-source/pull -H "Authorization: Bearer $TOKEN"`. Returns `{ pulled: 3, files: [...] }`.

The service token is the same `CMS_JWT_SECRET` used by other internal APIs (passed as `X-CMS-Service-Token` header or Bearer token). Configurable per source in Site Settings.

**Recommended flow for external AI agents:**

```bash
# 1. AI makes changes and pushes
git add . && git commit -m "add interactive chart" && git push

# 2. AI tells CMS to pull (one curl call)
curl -X POST https://cms-admin.example/api/live-content/interactives/pull \
  -H "X-CMS-Service-Token: $CMS_SECRET"
```

This makes the CMS a "pull on demand" system — the external AI is in control of when content arrives.

### Integration with Interactives (F39)

Live Content sources can be mapped as Interactive sources — HTML files from the repo appear in the Interactives Manager automatically. This means an external AI can create/edit interactives by pushing to a repo, and they show up in the CMS instantly.

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/live-content/sync.ts` — new sync engine
- `packages/cms-admin/src/lib/live-content/git-sync.ts` — new git-based sync implementation
- `packages/cms-admin/src/lib/site-registry.ts` — extend SiteEntry with `liveContent` array
- `packages/cms-admin/src/app/api/live-content/` — new API routes
- `packages/cms-admin/src/app/admin/live-content/page.tsx` — new admin page
- `packages/cms-admin/package.json` — add `simple-git` dependency

### Blast radius
- SiteEntry interface extension affects all site registry consumers
- Git operations in Node.js require git binary on the system
- Webhook endpoint is publicly accessible — needs HMAC verification

### Breaking changes
- `SiteEntry` gains `liveContent` array — optional, backwards-compatible

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Shallow clone works for initial sync
- [ ] Pull detects and downloads remote changes
- [ ] Push commits and pushes local changes
- [ ] GitHub webhook triggers auto-pull
- [ ] File browser lists content with correct types

## Implementation Steps

1. Install `simple-git` dependency in `packages/cms-admin`
2. Create `packages/cms-admin/src/lib/live-content/` with types, sync engine, git implementation
3. Extend `SiteEntry` type in `site-registry.ts` to include `liveContent` array
4. Create API routes under `/api/live-content/`
5. Build admin UI page at `/admin/live-content/page.tsx` — source list + file browser
6. Add file editor with syntax highlighting (reuse existing Monaco/CodeMirror if available, or add `@monaco-editor/react`)
7. Add webhook endpoint for GitHub push events
8. Add polling-based auto-sync (configurable interval per source)
9. Wire up Interactives integration — map HTML files from live content to Interactives Manager
10. Add "Add Live Content Source" dialog in Sites → Settings

## Dependencies

- F26 (GitHub Login) — for OAuth token to access private repos
- F39 (Interactives Engine) — optional, for HTML file integration

## Effort Estimate

**Large** — 5-7 days
