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
