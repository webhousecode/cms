# F74 — System Status Page

> Public status page at status.webhouse.app showing health of CMS services with uptime monitoring and status badges.

## Problem

Users and prospective customers have no way to check if CMS services are operational. When something breaks (GitHub API, AI providers, scheduler), there's no public visibility. A status page builds trust, reduces "is it down?" support questions, and gives the team a monitoring dashboard.

## Solution

A **System Status Page** at `status.webhouse.app` (or `/status` on the landing site) that:

1. Shows health status of all CMS services
2. Simple heartbeat checks against health endpoints
3. Color-coded status badges (operational / degraded / down)
4. Public — no auth required
5. Can start as a static page on the existing landing site that polls health endpoints client-side

Services monitored:
- **CMS API** — `/api/cms/health`
- **GitHub Adapter** — GitHub API reachability
- **AI Providers** — Anthropic/OpenAI API status
- **MCP Servers** — public + authenticated MCP health
- **Scheduler Daemon** — last heartbeat timestamp

## Technical Design

### 1. Health Endpoints

Add a lightweight health endpoint to the CMS admin:

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

### 2. Status Page (Landing Site)

A simple page on the existing webhouse.app landing site:

```
┌─────────────────────────────────────────┐
│ webhouse.app — System Status            │
│                                         │
│ All systems operational        ● green  │
│                                         │
│ CMS API            ● Operational        │
│ GitHub Adapter      ● Operational        │
│ AI Providers        ◐ Degraded           │
│ MCP Servers         ● Operational        │
│ Scheduler           ● Operational        │
│                                         │
│ Last checked: 30 seconds ago            │
│ Auto-refreshes every 60s                │
└─────────────────────────────────────────┘
```

Client-side polling every 60 seconds against the health endpoint. No backend database needed — purely real-time checks.

### 3. Status Badge API

Endpoint returning a badge image (SVG) for embedding in README, docs, etc.:

```
GET /api/cms/status-badge → SVG badge "webhouse cms | operational" (green/yellow/red)
```

## Implementation Steps

1. Create `/api/cms/health` endpoint with service checks
2. Add status page to the landing site (single page, client-side polling)
3. Add `/api/cms/status-badge` SVG endpoint for README embedding
4. Configure `status.webhouse.app` DNS (CNAME to landing site)

## Dependencies

- Landing site (already exists)
- Health check functions for each service (simple HTTP pings)
- DNS for `status.webhouse.app` subdomain

## Effort Estimate

**Small** — 1-2 days

- Day 1: Health endpoint with service checks + status page UI
- Day 2: Status badge API + DNS setup + polish
