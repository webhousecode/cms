# F74 — System Status Page

> Public status page at `status.webhouse.app` showing health of CMS services with uptime monitoring and status badges.

**URL:** `https://status.webhouse.app`

## Problem

Users and prospective customers have no way to check if CMS services are operational. When something breaks (GitHub API, AI providers, scheduler), there's no public visibility. A status page builds trust, reduces "is it down?" support questions, and gives the team a monitoring dashboard.

## Solution

A standalone **Next.js app** deployed on Fly.io at `status.webhouse.app`. NOT part of the CMS admin — it's an independent app that monitors CMS services from the outside (like Atlassian Statuspage, but self-hosted and free).

### Why NOT Atlassian Statuspage / Instatus / etc.
- We don't need incident management workflows (we post in Discord #announcements)
- We don't need email/SMS subscriber notifications (we have Discord)
- We don't need complex metrics/grafik (simple uptime % is enough)
- We don't need team on-call rotation (it's a small team)
- A simple Next.js page with 5 health checks and a cron is all we need — 1 day of work

### What it does
1. Shows health status of all CMS services — green/yellow/red per service
2. Simple heartbeat checks against health endpoints
3. Uptime percentage (last 24h, 7d, 30d)
4. Auto-refreshes every 60 seconds
5. Public — no auth required
6. SVG status badge for README embedding

### Services monitored
- **CMS API** — `/api/cms/health`
- **GitHub Adapter** — GitHub API reachability
- **AI Providers** — Anthropic/OpenAI API status
- **MCP Servers** — public + authenticated MCP health
- **Scheduler Daemon** — last heartbeat timestamp

## Technical Design

### 1. Standalone Next.js App

```
apps/status/
  src/app/
    page.tsx         # Status dashboard
    api/
      check/route.ts # Runs health checks, stores results
      badge/route.ts # SVG status badge
  status-history.json # Rolling 30-day history (JSON file on disk)
  fly.toml           # Fly.io config, region: arn
  package.json
```

Tech stack: Next.js 16, Tailwind CSS v4, deployed on Fly.io (arn region).

### 2. Health Endpoint on CMS Admin

Add a lightweight health endpoint to the CMS admin that the status app polls:

```typescript
// packages/cms-admin/src/app/api/cms/health/route.ts

export async function GET() {
  const checks = {
    api: true,
    scheduler: isSchedulerRunning(),
    github: await checkGitHubApi(),
    ai: await checkAiProvider(),
  };

  const allOk = Object.values(checks).every(Boolean);

  return Response.json({
    status: allOk ? "operational" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  }, { status: allOk ? 200 : 503 });
}
```

### 3. Cron Check (every 5 minutes)

The status app runs a cron (via `instrumentation.ts` or Fly.io machine schedule) that:
1. Polls the CMS health endpoint
2. Appends result to `status-history.json` (rolling 30 days, capped at ~8640 entries)
3. Calculates uptime percentages

No external database needed — a JSON file on a Fly.io volume is sufficient for this scale.

### 4. Status Page UI

```
┌─────────────────────────────────────────┐
│ webhouse.app — System Status            │
│                                         │
│ All systems operational        ● green  │
│                                         │
│ CMS API            ● Operational  99.9% │
│ GitHub Adapter     ● Operational  99.8% │
│ AI Providers       ◐ Degraded     98.5% │
│ MCP Servers        ● Operational  99.9% │
│ Scheduler          ● Operational 100.0% │
│                                         │
│ Last checked: 30 seconds ago            │
│ Auto-refreshes every 60s                │
└─────────────────────────────────────────┘
```

### 5. Status Badge API

Endpoint returning a badge image (SVG) for embedding in README, docs, etc.:

```
GET /api/badge → SVG badge "webhouse cms | operational" (green/yellow/red)
```

### 6. DNS Setup

The session agent creates the subdomain using the DNS MCP server:

```
status.webhouse.app → CNAME → status-webhouse.fly.dev
```

## Impact Analysis

### Files affected
- `apps/status/` — entirely new Next.js app
- `packages/cms-admin/src/app/api/cms/health/route.ts` — new health endpoint
- Fly.io deployment config for status app
- DNS record for `status.webhouse.app`

### Blast radius
- Health endpoint on CMS admin is publicly accessible — must not leak sensitive data
- Status app is independent — no coupling to CMS code

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Health endpoint returns correct service statuses
- [ ] Status page renders all monitored services
- [ ] Cron check stores results to JSON
- [ ] Badge SVG renders correct status color

## Implementation Steps

1. Create Next.js app in `apps/status/`
2. Create `/api/cms/health` endpoint on CMS admin
3. Build status page UI with Tailwind (dark theme matching webhouse.app)
4. Add cron health checker with JSON file storage
5. Add `/api/badge` SVG endpoint
6. Deploy to Fly.io (arn region)
7. Create DNS subdomain `status.webhouse.app` via DNS MCP
8. Link from Help drawer in CMS admin

## Dependencies

- Fly.io account (already have)
- DNS MCP server (already have)
- CMS admin health endpoint (new, trivial)

## Effort Estimate

**Small** — 1 day

The hardest part is deciding what "healthy" means for each service — the rest is trivial.
