# F61 — Activity Log

> Audit trail that records every action in CMS admin — who did what, when, to which document. Per-site, per-user, with admin UI feed and filtering.

## Problem

There is no record of what happened in the CMS. When content changes unexpectedly, there's no way to answer "who changed this?" or "when was this published?". The scheduler publishes documents silently, agents generate content without trace, and team members edit without accountability. For compliance (GDPR audit requirements), debugging ("why did this unpublish?"), and team coordination ("what did the intern change today?"), an activity log is essential.

## Solution

A lightweight, append-only event log stored per-site as JSONL (one JSON object per line). Every significant action in the CMS writes a log entry. The admin UI shows a filterable activity feed. The existing content lifecycle hooks (`afterCreate`, `afterUpdate`, `afterDelete`) and API routes provide natural interception points.

## Technical Design

### 1. Log Entry Shape

```typescript
// packages/cms-admin/src/lib/activity-log.ts

export interface ActivityEntry {
  id: string;              // nanoid
  timestamp: string;       // ISO
  action: ActivityAction;
  actor: {
    type: "user" | "system" | "agent" | "scheduler";
    userId?: string;
    name?: string;
    email?: string;
    agentId?: string;
  };
  target: {
    type: "document" | "media" | "interactive" | "agent" | "settings" | "team" | "site";
    collection?: string;
    slug?: string;
    id?: string;
    title?: string;
  };
  details?: Record<string, unknown>;  // action-specific data
}

export type ActivityAction =
  // Content
  | "document.created"
  | "document.updated"
  | "document.published"
  | "document.unpublished"
  | "document.scheduled"
  | "document.trashed"
  | "document.restored"
  | "document.deleted"
  // Media
  | "media.uploaded"
  | "media.deleted"
  | "media.renamed"
  // Interactives
  | "interactive.created"
  | "interactive.updated"
  | "interactive.deleted"
  // AI
  | "agent.ran"
  | "agent.created"
  | "agent.deleted"
  | "ai.generated"
  | "ai.rewritten"
  // Team
  | "team.invited"
  | "team.joined"
  | "team.removed"
  | "team.role_changed"
  // Auth
  | "auth.login"
  | "auth.logout"
  // Settings
  | "settings.updated"
  // Scheduler
  | "scheduler.published"
  | "scheduler.unpublished";
```

### 2. Storage — JSONL File

```
_data/activity-log.jsonl
```

One JSON object per line, append-only. JSONL is ideal because:
- Append is O(1) — no read-modify-write
- Easy to tail/stream
- No corruption risk from concurrent writes
- Simple to rotate (rename + create new)
- grep-friendly for debugging

```jsonl
{"id":"a1b2","timestamp":"2026-03-18T12:23:00","action":"scheduler.published","actor":{"type":"scheduler"},"target":{"type":"document","collection":"posts","slug":"demo-new-features","title":"Demo New Features"}}
{"id":"c3d4","timestamp":"2026-03-18T12:25:00","action":"document.updated","actor":{"type":"user","userId":"fb4eda6a","name":"Christian","email":"cb@webhouse.dk"},"target":{"type":"document","collection":"posts","slug":"hello-world","title":"Hello World"},"details":{"fields":["content","tags"]}}
```

### 3. Write API

```typescript
// packages/cms-admin/src/lib/activity-log.ts

import fs from "fs";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

/** Append a log entry (fire-and-forget, never throws) */
export async function logActivity(entry: Omit<ActivityEntry, "id" | "timestamp">): Promise<void> {
  try {
    const { dataDir } = await getActiveSitePaths();
    const logPath = path.join(dataDir, "activity-log.jsonl");
    const record: ActivityEntry = {
      id: crypto.randomUUID().slice(0, 8),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    fs.appendFileSync(logPath, JSON.stringify(record) + "\n");
  } catch {
    // Never fail — logging is non-critical
  }
}
```

### 4. Read API

```typescript
/** Read recent activity entries */
export async function readActivity(options?: {
  limit?: number;        // default 50
  offset?: number;       // for pagination
  action?: string;       // filter by action prefix, e.g. "document" or "scheduler.published"
  userId?: string;       // filter by actor
  collection?: string;   // filter by target collection
  since?: string;        // ISO timestamp
}): Promise<{ entries: ActivityEntry[]; total: number }> {
  const { dataDir } = await getActiveSitePaths();
  const logPath = path.join(dataDir, "activity-log.jsonl");
  // Read file, parse lines, filter, paginate
  // For large logs: read from end of file (reverse chronological)
}
```

### 5. API Endpoints

```
GET  /api/admin/activity           → paginated activity feed
GET  /api/admin/activity/stats     → action counts for dashboard
```

### 6. Integration Points — Where to Call logActivity()

| Location | Action | Actor |
|----------|--------|-------|
| `api/cms/[collection]/[slug]/route.ts` PATCH | document.updated, document.published, document.trashed | user |
| `api/cms/[collection]/[slug]/route.ts` DELETE | document.deleted | user |
| `api/cms/[collection]/route.ts` POST | document.created | user |
| `api/media/route.ts` POST | media.uploaded | user |
| `api/media/[...path]/route.ts` DELETE | media.deleted | user |
| `api/interactives/route.ts` POST | interactive.created | user |
| `api/interactives/[id]/route.ts` PUT/DELETE | interactive.updated/deleted | user |
| `api/cms/agents/route.ts` POST | agent.created | user |
| `api/cms/agents/[id]/route.ts` DELETE | agent.deleted | user |
| `api/cms/agents/[id]/run/route.ts` POST | agent.ran | user |
| `api/admin/invitations/route.ts` POST | team.invited | user |
| `api/admin/invitations/accept/route.ts` POST | team.joined | user |
| `api/admin/users/[id]/route.ts` PATCH/DELETE | team.role_changed/removed | user |
| `api/auth/login/route.ts` POST | auth.login | user |
| `api/admin/site-config/route.ts` POST/PATCH | settings.updated | user |
| `instrumentation.ts` publishTick | scheduler.published/unpublished | scheduler |
| `lib/scheduler.ts` runScheduledAgents | agent.ran | agent |

### 7. Admin UI — Activity Feed Page

New page at `/admin/activity` with sidebar nav item.

```
┌──────────────────────────────────────────────────────┐
│ Activity                                              │
│                                                        │
│ Filters: [All ▾] [All users ▾] [All collections ▾]   │
│                                                        │
│ Today                                                  │
│ ● 12:23  Scheduler published posts/demo-new-features  │
│ ● 12:20  Christian updated posts/hello-world           │
│ ● 11:45  Christian uploaded sunset.jpg                 │
│                                                        │
│ Yesterday                                              │
│ ● 18:30  Agent "SEO Writer" generated posts/seo-tips  │
│ ● 14:15  Christian invited mb@webhouse.dk (editor)     │
│ ● 09:00  Scheduler published posts/weekly-update       │
│                                                        │
│ [Load more]                                            │
└──────────────────────────────────────────────────────┘
```

### 8. Log Rotation

When `activity-log.jsonl` exceeds 10,000 lines (~2MB), rotate:
1. Rename to `activity-log.2026-03.jsonl`
2. Create new `activity-log.jsonl`
3. Keep last 3 rotated files (configurable)

### 9. Calendar Integration

The Calendar page can optionally show past published/unpublished events by reading from the activity log instead of only `publishAt`/`unpublishAt` fields. This gives historical visibility without keeping schedule fields on already-published documents.

### 10. Dashboard Widget

A small "Recent Activity" section on the Dashboard showing the last 5 entries — gives editors an instant overview of what happened since they last logged in.

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/activity-log.ts` — new activity log module
- `packages/cms-admin/src/app/api/admin/activity/route.ts` — new API endpoint
- `packages/cms-admin/src/app/admin/activity/page.tsx` — new activity page
- All API routes in `packages/cms-admin/src/app/api/` — add `logActivity()` calls
- `packages/cms-admin/src/instrumentation.ts` — add scheduler logging

### Blast radius
- Every API route is modified to add logging — large number of files touched
- JSONL append is non-blocking but adds I/O to every mutation
- Sidebar navigation gains new item

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Document create/update/delete logged
- [ ] Media upload/delete logged
- [ ] Scheduler publish/unpublish logged
- [ ] Activity page shows filtered feed
- [ ] Log rotation works at 10K lines

## Implementation Steps

1. **Create `activity-log.ts`** — `logActivity()`, `readActivity()`, types
2. **Create `GET /api/admin/activity`** — paginated feed endpoint
3. **Wire `logActivity()` into content API routes** — PATCH/POST/DELETE
4. **Wire into media + interactives routes** — upload/delete
5. **Wire into auth + team routes** — login, invite, join, remove
6. **Wire into scheduler** — auto-publish/unpublish
7. **Build Activity page UI** — `/admin/activity` with filters
8. **Add sidebar nav item** — between Calendar and Trash
9. **Add Dashboard widget** — recent 5 entries
10. **Log rotation** — auto-rotate at 10K lines
11. **Calendar integration** — show historical publish events

## Dependencies

- None — all infrastructure exists. The feature is purely additive.
- F19 (Enterprise) can later extend this with granular permissions and retention policies.

## Effort Estimate

**Medium** — 3-4 days

- Day 1: Types, logActivity(), readActivity(), API endpoint
- Day 2: Wire into all API routes (content, media, ints, auth, team, settings)
- Day 3: Activity page UI with filters, sidebar nav, dashboard widget
- Day 4: Log rotation, calendar integration, testing
