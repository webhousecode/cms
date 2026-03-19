# F60 — Reliable Scheduled Tasks

> Ensure scheduled publishing, AI agents, calendar snapshots, and link checks run on time — regardless of whether the CMS admin machine is awake.

## Problem

All background tasks (scheduled publishing, AI agent runs, calendar snapshots, link checks) live in `packages/cms-admin/src/instrumentation.ts` as `setInterval()` loops inside the Next.js server process. This works well when the server is always running, but **Fly.io's `auto_stop_machines` kills the process when there's no admin traffic**, and the intervals die with it.

**Concrete failure scenario:** A user schedules a blog post to publish at 08:00. No one opens the CMS admin between 07:00 and 10:00. The post doesn't publish until 10:03 when someone finally opens admin — over 2 hours late.

This is the current `instrumentation.ts` architecture:

```
register() called once on server start
├── publishTick()       — every 60s   (auto-publish/unpublish scheduled documents)
├── agentTick()         — every 5min  (run AI agents with cron schedules)
├── snapshotTick()      — every 5min  (update calendar snapshot)
└── linkCheckTick()     — every 1hr   (daily/weekly link checker, throttled)
```

All four tasks share the same lifecycle: they start with the process and die with the process. On Fly.io with `auto_stop_machines = "stop"`, the machine typically stops after ~5 minutes of no HTTP traffic.

## Solution

Provide three tiers of reliability that users can choose based on their needs, from zero-config to always-on. The CMS should detect which tier is active and show it in the admin UI.

## Technical Design

### Tier 1: Always-On Machine (simplest, ~$3/mo)

Set `min_machines_running = 1` in `fly.toml`. The machine never stops, intervals always run.

**Implementation:** Add a `CMS_SCHEDULER_MODE` env var. When set to `always-on`, instrumentation.ts works exactly as today — no code changes needed. The admin UI (Settings → General or a new Settings → Scheduler section) shows the current mode and a health indicator.

### Tier 2: External Heartbeat (zero-cost, community-friendly)

A lightweight external cron (GitHub Actions scheduled workflow, Fly.io cron machine, or any uptime monitor) pings `GET /api/cms/heartbeat` every N minutes. This wakes the machine and triggers pending tasks immediately.

**New API endpoint:** `packages/cms-admin/src/app/api/cms/heartbeat/route.ts`

```typescript
interface HeartbeatResponse {
  ok: true;
  ran: {
    publishedDocs: number;
    agentRuns: number;
    snapshotUpdated: boolean;
    linkCheckRan: boolean;
  };
  nextScheduledAt: string | null; // ISO date of next pending scheduled item
}
```

The heartbeat endpoint:
1. Runs `publishTick()` immediately (not waiting for the 60s interval)
2. Checks if any agents are due and runs them
3. Updates the calendar snapshot
4. Returns what it did

**GitHub Actions cron (zero-cost example):**

```yaml
# .github/workflows/heartbeat.yml
name: CMS Heartbeat
on:
  schedule:
    - cron: "*/5 * * * *"  # every 5 minutes
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -s -H "X-CMS-Service-Token: ${{ secrets.CMS_JWT_SECRET }}" https://webhouse-app.fly.dev/api/cms/heartbeat
```

### Tier 2b: webhouse.app Cron Service (zero-config for hosted users)

For CMS instances hosted on webhouse.app, the platform provides a built-in cron service at `cron.webhouse.net` that keeps the scheduler alive — no GitHub Actions or external setup needed.

**How it works:**

1. CMS admin has a one-click "Enable Scheduler Keepalive" toggle in Settings → Scheduler
2. Toggle calls `POST https://cron.webhouse.net/api/jobs` to register a heartbeat job
3. The cron service pings `GET /api/cms/heartbeat` every 5 minutes
4. The CMS machine wakes, runs pending tasks, responds with status

**cron.webhouse.net API integration:**

```typescript
// packages/cms-admin/src/lib/cron-service.ts

const CRON_API = "https://cron.webhouse.net/api";

interface CronJob {
  id: string;
  url: string;
  schedule: string;        // cron expression, e.g. "*/5 * * * *"
  headers?: Record<string, string>;
  enabled: boolean;
  lastRunAt?: string;
  lastStatus?: number;
}

/** Register a heartbeat job for this CMS instance */
export async function registerHeartbeatJob(cmsUrl: string, serviceToken: string): Promise<CronJob> {
  const res = await fetch(`${CRON_API}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.CRON_API_KEY}`,
    },
    body: JSON.stringify({
      name: `cms-heartbeat-${new URL(cmsUrl).hostname}`,
      url: `${cmsUrl}/api/cms/heartbeat`,
      schedule: "*/5 * * * *",
      headers: { "X-CMS-Service-Token": serviceToken },
      enabled: true,
    }),
  });
  return res.json();
}

/** Remove the heartbeat job */
export async function removeHeartbeatJob(jobId: string): Promise<void> {
  await fetch(`${CRON_API}/jobs/${jobId}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${process.env.CRON_API_KEY}` },
  });
}

/** Check heartbeat job status */
export async function getHeartbeatJobStatus(jobId: string): Promise<CronJob | null> {
  const res = await fetch(`${CRON_API}/jobs/${jobId}`, {
    headers: { "Authorization": `Bearer ${process.env.CRON_API_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}
```

**SiteConfig additions:**

```typescript
interface SiteConfig {
  // ... existing fields ...
  schedulerMode: "manual" | "heartbeat" | "always-on";
  cronJobId?: string;        // ID from cron.webhouse.net
  cronServiceUrl?: string;   // Custom cron service URL (self-hosted)
}
```

**Settings UI flow:**

1. User opens Settings → Scheduler
2. Sees three radio options:
   - **Manual** — scheduler runs only when admin is open (default)
   - **Heartbeat** — webhouse.app cron service pings every 5 min (free)
   - **Always-on** — machine never stops ($3/mo, requires `min_machines_running=1`)
3. Selecting "Heartbeat" → auto-registers job at cron.webhouse.net
4. Shows job status: last ping, last status, next run

**Cost comparison:**

| Tier | Cost | Reliability | Max delay |
|------|------|-------------|-----------|
| Manual | Free | Low — depends on admin traffic | Hours |
| Heartbeat (cron.webhouse.net) | Free | High — 5-min precision | 5 min |
| Heartbeat (GitHub Actions) | Free | High — 5-min precision | 5 min |
| Always-on | ~$3/mo | Maximum — 60s precision | 60s |
| Dedicated scheduler | ~$0.50/mo | Maximum — 60s precision | 60s |

**Alternative: self-hosted cron service.** Users running their own infrastructure can point `cronServiceUrl` to any cron.webhouse.net-compatible API (same endpoints, same auth). The admin UI at `https://cronjobs.webhouse.net/jobs` provides a visual job manager.

### Tier 3: Dedicated Scheduler Service (maximum reliability)

For sites where scheduled publishing is business-critical. A tiny Fly.io machine (~256MB) that does nothing but call the heartbeat endpoint on a precise schedule. Lives as `deploy/scheduler/` in the monorepo.

```dockerfile
# deploy/scheduler/Dockerfile
FROM alpine:3.20
RUN apk add --no-cache curl
COPY crontab /etc/crontabs/root
CMD ["crond", "-f"]
```

With a crontab:
```
*/1 * * * * curl -sf -H "X-CMS-Service-Token: $CMS_JWT_SECRET" $CMS_URL/api/cms/heartbeat > /dev/null
```

Cost: ~$0.50/mo on Fly.io (shared-cpu-1x, 256MB, always-on in `arn`).

### Admin UI: Scheduler Health Panel

In Settings → General (or a new "Scheduler" tab), show:

- **Mode:** Always-on / Heartbeat / Manual
- **Last heartbeat:** timestamp + "2 minutes ago"
- **Pending tasks:** "3 documents scheduled for publish in next 24h"
- **Health:** Green/Yellow/Red based on whether heartbeat is within expected interval

### Smart Wake-on-Schedule (future optimization)

Instead of keeping the machine always running or relying on external pings, the CMS could use Fly.io's machine API to schedule a one-shot wake-up at the exact time the next scheduled item is due. This is the most cost-efficient approach but requires Fly API integration.

## Impact Analysis

### Files affected
- `packages/cms-admin/src/app/api/cms/heartbeat/route.ts` — new heartbeat endpoint
- `packages/cms-admin/src/lib/scheduler-tasks.ts` — extract tick functions from instrumentation.ts
- `packages/cms-admin/src/instrumentation.ts` — refactor to use shared tasks
- `packages/cms-admin/src/lib/cron-service.ts` — new cron.webhouse.net integration
- `.github/workflows/heartbeat.yml` — new GitHub Actions workflow
- Admin Settings — new scheduler health panel

### Blast radius
- `instrumentation.ts` refactoring affects all background tasks (publishing, agents, snapshots, link checks)
- Heartbeat endpoint is a new entry point for scheduled task execution

### Breaking changes
- None — refactoring preserves existing behavior

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Heartbeat endpoint runs all pending tasks
- [ ] Scheduled publishing works via heartbeat
- [ ] Health indicator shows correct mode
- [ ] GitHub Actions cron successfully pings heartbeat

## Implementation Steps

1. Create `/api/cms/heartbeat` endpoint that runs all pending tasks immediately
2. Extract tick functions from `instrumentation.ts` into `packages/cms-admin/src/lib/scheduler-tasks.ts` (shared between instrumentation and heartbeat)
3. Add `CMS_SCHEDULER_MODE` env var support (always-on | heartbeat | manual)
4. Add heartbeat GitHub Actions workflow template
5. Add scheduler health indicator in admin Settings
6. Document the three tiers in the deployment guide
7. (Optional) Add `deploy/scheduler/` for dedicated cron machine

## Dependencies

- F15 Agent Scheduler (in progress) — agent scheduling logic
- F47 Content Scheduling (planned) — publishAt/unpublishAt fields

No blocking dependencies — this can be built independently since the scheduling logic already exists in `instrumentation.ts`.

## Effort Estimate

**Small** — 2-3 days. The heartbeat endpoint is straightforward, the refactoring of instrumentation.ts is mechanical, and the admin UI is a single status panel. The dedicated scheduler Dockerfile is optional and trivial.
