# F38 — Environment Manager

> Dev/Staging/Production environment switcher in admin with local dev server spawning, per-environment preview URLs, and environment indicator in header.

## Problem

Today the CMS admin has a single "Preview site URL" setting. There's no concept of environments. When developing locally, the preview URL points to localhost. In production, it points to the live site. Switching between them requires manual settings changes. Worse:

- There's no way to start a dev server from the admin — you need a separate terminal
- There's no visual indicator of which environment you're working in
- Draft content can't be previewed on a staging URL
- Deploy targets differ per environment but aren't tracked
- Port conflicts are common when running multiple sites locally

## Solution

An environment system built into Site Settings with three tiers (Dev, Staging, Production). Each environment has its own preview URL, deploy config, and feature flags. In Dev mode, the admin can spawn a local Next.js dev server on a vacant port (using Code Launcher API for port scanning). An environment badge in the admin header makes the active environment always visible.

## Technical Design

### Environment Configuration

```typescript
// Stored in _data/site-config.json (extends existing)

interface EnvironmentConfig {
  active: 'dev' | 'staging' | 'production';
  environments: {
    dev: {
      previewUrl: string;         // e.g. "http://localhost:3002"
      autoStart: boolean;         // spawn dev server on site activation
      port?: number;              // auto-assigned if not set
      command?: string;           // default: "npx next dev -p {port}"
      features?: {
        showDrafts: boolean;      // show draft content in preview
        hotReload: boolean;       // live reload on content save
      };
    };
    staging: {
      previewUrl: string;         // e.g. "https://staging.sproutlake.com"
      deployBranch?: string;      // e.g. "staging"
      features?: {
        showDrafts: boolean;
      };
    };
    production: {
      previewUrl: string;         // e.g. "https://sproutlake.com"
      deployBranch?: string;      // e.g. "main"
    };
  };
}
```

### Header Environment Badge

In the admin header (between site switcher and user avatar):

```
┌──────────────────────────────────────────────────────────┐
│ [Sidebar] Dashboard │ WebHouse ▾ │ SproutLake ▾ │ DEV │ CB │
└──────────────────────────────────────────────────────────┘
```

Badge colors:
- **DEV** — blue background, "Dev" text
- **STAGING** — amber background, "Staging" text
- **PRODUCTION** — green background with subtle pulse, "Prod" text

Clicking the badge opens a dropdown to switch environments. Switching updates:
- Preview URL used by Preview button in document editor
- Environment indicator
- Optionally starts/stops dev server

### Dev Server Manager

```typescript
// packages/cms-admin/src/lib/dev-server.ts

interface DevServerState {
  running: boolean;
  port: number;
  pid?: number;
  startedAt?: string;
  siteId: string;
}

// API: GET /api/admin/dev-server — status
// API: POST /api/admin/dev-server — start (body: { siteId, port? })
// API: DELETE /api/admin/dev-server — stop
```

**Port discovery** uses Code Launcher API:
```
GET https://cl.broberg.dk/api/vacant-port → { port: 3005 }
POST https://cl.broberg.dk/api/apps/report-port → register port
```

Fallback if Code Launcher is unavailable: scan ports 3001-3099 with `net.createServer().listen()`.

**Server spawning:**
```typescript
import { spawn } from 'child_process';

// For filesystem sites:
const proc = spawn('npx', ['next', 'dev', '-p', String(port)], {
  cwd: siteContentDir,
  env: { ...process.env, PORT: String(port) },
  stdio: 'pipe',
});

// For GitHub sites:
// Clone to temp dir → npm install → next dev
// Or show a message that dev server requires local checkout
```

### Settings UI

New "Environments" tab in Site Settings:

```
┌──────────────────────────────────────────────┐
│ Site Settings                                │
│ [General] [AI] [Brand Voice] [Environments]  │
├──────────────────────────────────────────────┤
│                                              │
│ ACTIVE ENVIRONMENT                           │
│ [Dev ●] [Staging ○] [Production ○]           │
│                                              │
│ ─── DEV ───────────────────────────────────  │
│ Preview URL: http://localhost:3002           │
│ Auto-start dev server: [ON]                  │
│ Port: 3002 (auto)                           │
│ Status: ● Running (PID 12345)               │
│ [Stop Server] [Open Preview]                │
│                                              │
│ ─── STAGING ───────────────────────────────  │
│ Preview URL: https://staging.example.com    │
│ Deploy branch: staging                       │
│                                              │
│ ─── PRODUCTION ────────────────────────────  │
│ Preview URL: https://example.com            │
│ Deploy branch: main                          │
│                                              │
│ [Save changes]                               │
└──────────────────────────────────────────────┘
```

### Integration with Existing Preview

The document editor's Preview button (`openPreview()` in document-editor.tsx) already reads `PREVIEW_SITE_URL`. The environment manager updates this value dynamically based on the active environment — no changes needed to the editor itself.

### Content Sync Indicator

When in Dev mode with a filesystem site, content saves are instant (file write). When in Staging/Production with a GitHub site, content saves go through GitHub API. The environment badge could show a sync status:

- **Dev**: saves instantly, green checkmark
- **Staging/Prod**: "Syncing..." during GitHub API write, then checkmark

## Implementation Steps

1. Add `environments` to site-config schema and read/write functions
2. Create `EnvironmentBadge` component for admin header with dropdown switcher
3. Add "Environments" tab to Site Settings with per-environment config
4. Create `/api/admin/dev-server` route (start/stop/status)
5. Implement port discovery (Code Launcher API → fallback port scan)
6. Wire dev server spawning for filesystem sites (spawn `next dev`)
7. Update Preview button to use active environment's URL
8. Add server status indicator in Settings + header badge
9. Handle GitHub sites gracefully (no local dev server, but staging/prod URLs work)

## Dependencies

- None critical — extends existing site-config and admin header
- **Code Launcher API** at `cl.broberg.dk` for port scanning (optional, has fallback)
- **F12 One-Click Publish** is complementary — deploy targets per environment

## Effort Estimate

**Large** — 5-7 days
