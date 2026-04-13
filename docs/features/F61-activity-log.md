# F61 — Activity & Event Log (3-Layer Observability)

> Complete observability for the CMS: GDPR-compliant audit trail, structured server/error logging, and persistent UI event capture. Three layers, one unified admin UI.

## Problem

The CMS has zero observability:

1. **No audit trail** — when content changes unexpectedly, there's no answer to "who changed this?", "when was this published?", or "who modified settings?". GDPR requires that data processing activities are traceable.

2. **No persistent server logs** — errors go to `console.log` → PM2 stdout → lost on restart. Deploy failures, API errors, scheduler crashes, and AI failures leave no trace. Debugging requires reading terminal output in real-time.

3. **No UI event capture** — toasts disappear after 5 seconds. Client-side errors (`TypeError`, `Failed to fetch`) vanish. Users report "something went wrong" with no reproduction path.

## Solution

Three logging layers feeding into one unified admin UI:

| Layer | What | Storage | Retention |
|-------|------|---------|-----------|
| **Audit** | Who did what, when, to which resource | `_data/audit.jsonl` | 90 days (rotated) |
| **Server** | Errors, warnings, deploy events, scheduler events, API failures | `_data/server.jsonl` | 30 days (rotated) |
| **Client** | Toasts, UI errors, failed fetches, user actions | `_data/client.jsonl` (via POST endpoint) | 7 days (rotated) |

All three are append-only JSONL — no read-modify-write, no corruption risk, grep-friendly.

## Technical Design

### 1. Shared Log Entry Shape

```typescript
// packages/cms-admin/src/lib/event-log.ts

export interface LogEntry {
  id: string;                    // nanoid(8)
  timestamp: string;             // ISO
  layer: "audit" | "server" | "client";
  level: "info" | "warn" | "error";
  action: string;                // e.g. "document.published", "deploy.failed", "toast.error"
  actor: {
    type: "user" | "system" | "agent" | "scheduler" | "browser";
    userId?: string;
    name?: string;
    email?: string;
    agentId?: string;
    userAgent?: string;          // for client events
  };
  target?: {
    type: "document" | "media" | "interactive" | "agent" | "settings" | "team" | "site" | "form" | "deploy" | "backup";
    collection?: string;
    slug?: string;
    id?: string;
    title?: string;
  };
  details?: Record<string, unknown>;  // layer-specific data
  error?: {
    message: string;
    stack?: string;              // server errors only, never exposed to client
    status?: number;             // HTTP status
  };
}
```

### 2. Layer 1 — Audit Log (GDPR)

Records every mutation by every actor. Non-negotiable for compliance.

**Actions tracked:**

| Category | Actions | Actor |
|----------|---------|-------|
| Content | created, updated, published, unpublished, scheduled, trashed, restored, deleted | user / agent / scheduler |
| Media | uploaded, deleted, renamed, analyzed | user / system |
| Interactives | created, updated, deleted | user |
| Forms | submission.received, submission.read, submission.archived, submission.deleted | user / system |
| Agents | created, updated, deleted, ran, failed, budget.exceeded | user / scheduler |
| Team | invited, joined, removed, role.changed | user |
| Auth | login, login.failed, logout, passkey.added, passkey.removed, totp.enabled, totp.disabled | user |
| Settings | updated (with changed-keys list) | user |
| Deploy | triggered, succeeded, failed | user / system |
| Backup | created, restored, deleted | user / scheduler |
| Permissions | permission.denied (403 from requirePermission) | user |

**GDPR compliance:**
- IP addresses hashed (same as form submissions — sha256 truncated to 8 hex)
- Email recorded only for the acting user (never for third parties)
- Log entries are immutable — append-only, no edit/delete
- Retention: 90 days, then auto-rotated
- Export: CSV/JSON export endpoint for data access requests

**Storage:** `_data/audit.jsonl`

### 3. Layer 2 — Server Log

Captures backend events that aren't user actions — errors, warnings, system events.

**Events tracked:**

| Category | Events |
|----------|--------|
| Errors | Unhandled exceptions, API route errors (4xx/5xx with context), validation failures |
| Deploy | Build started/completed/failed (with duration + error), blob upload progress, Pages enablement |
| Scheduler | Cron tick, agent run started/completed/failed, publish/unpublish executed |
| AI | LLM call started/completed/failed (model, tokens, latency, cost), rate limit hit |
| Backup | Started/completed/failed, cloud upload progress, quota check |
| Webhooks | Dispatch attempted/succeeded/failed per endpoint |
| Performance | Slow API responses (>2s), large response bodies, memory warnings |

**Integration:** Replace `console.log`/`console.error` with `serverLog()` in critical paths. Existing console output continues to PM2 logs — server log is a structured supplement, not a replacement.

**Storage:** `_data/server.jsonl` (rotated at 30 days)

### 4. Layer 3 — Client Log

Captures browser-side events that currently vanish.

**Events tracked:**

| Category | Events |
|----------|--------|
| Toasts | Every toast (success, error, info) with message + context |
| Fetch errors | Failed API calls with URL, status, error body |
| JS errors | Uncaught exceptions + React error boundaries (component, stack) |
| Navigation | Page views with path + timing (for debugging "blank page" reports) |
| User actions | Button clicks on critical actions (deploy, publish, delete, save) with result |

**Client → Server:** `POST /api/admin/log` endpoint that accepts batched client events. The client buffers events in memory and flushes every 10 seconds or on page unload (`navigator.sendBeacon`).

```typescript
// packages/cms-admin/src/lib/client-logger.ts (browser-side)

class ClientLogger {
  private buffer: ClientEvent[] = [];

  log(event: Omit<ClientEvent, "id" | "timestamp">) { ... }
  flush() { navigator.sendBeacon("/api/admin/log", JSON.stringify(this.buffer)); }
}

export const clientLog = new ClientLogger();
```

**Toast integration:** Wrap the existing `toast()` calls to auto-log every toast:

```typescript
// Before: toast.success("Published!")
// After:  toast.success("Published!") — auto-logged via wrapper
```

**Storage:** `_data/client.jsonl` (rotated at 7 days — high volume, short retention)

### 5. Write API

```typescript
// packages/cms-admin/src/lib/event-log.ts

/** Append to the appropriate layer's JSONL file (fire-and-forget, never throws) */
export async function logEvent(entry: Omit<LogEntry, "id" | "timestamp">): Promise<void>;

/** Convenience wrappers */
export async function auditLog(action: string, actor: LogEntry["actor"], target?: LogEntry["target"], details?: Record<string, unknown>): Promise<void>;
export async function serverLog(level: "info" | "warn" | "error", action: string, details?: Record<string, unknown>, error?: LogEntry["error"]): Promise<void>;
```

### 6. Read API + Endpoints

```
GET  /api/admin/log                → unified feed (all 3 layers, paginated, filterable)
GET  /api/admin/log/stats          → counts per layer/action for dashboard widget
GET  /api/admin/log/export         → CSV/JSON export (for GDPR data access requests)
POST /api/admin/log                → receive client-side events (batched)
```

Query params: `?layer=audit&action=document.*&userId=xxx&since=2026-04-01&limit=50&offset=0`

### 7. Admin UI — Event Log Page

New page at `/admin/log` in the Tools section.

```
┌──────────────────────────────────────────────────────────┐
│ Event Log                                [Export ▾] [CSV]│
│                                                          │
│ Layers: [● Audit] [● Server] [● Client]                │
│ Level:  [All ▾]  User: [All ▾]  Action: [All ▾]        │
│                                                          │
│ Today                                                    │
│ 🟢 13:45  audit   cb@webhouse.dk published posts/hello  │
│ 🔴 13:44  server  Deploy failed: blob 403 rate limit    │
│ 🟡 13:43  client  toast.error "Publish failed"          │
│ 🟢 13:40  audit   cb@webhouse.dk updated posts/hello    │
│ 🔵 13:38  server  AI call: claude-4, 1.2K tokens, $0.02│
│ 🟢 13:35  audit   john@doe.com login                    │
│ 🔴 13:35  audit   john@doe.com permission.denied        │
│           settings.edit (attempted /admin/settings)      │
│                                                          │
│ [Load more]                                              │
└──────────────────────────────────────────────────────────┘
```

Color coding: 🟢 info, 🟡 warn, 🔴 error. Layer badges: audit (shield), server (terminal), client (browser).

### 8. Dashboard Widget

"Recent Events" section on the Dashboard showing the last 10 entries across all layers. Errors highlighted. Click → opens full log page with that event focused.

### 9. Log Rotation

| Layer | Max lines | Max age | Rotated files kept |
|-------|-----------|---------|-------------------|
| Audit | 50,000 | 90 days | 4 (1 year total) |
| Server | 20,000 | 30 days | 3 (90 days total) |
| Client | 10,000 | 7 days | 2 (21 days total) |

Rotation runs on the instrumentation scheduled tick (same as backup/scheduler). Old files: `audit.2026-03.jsonl`, `server.2026-03.jsonl`, etc.

### 10. Permission Denied Logging

Every `requirePermission()` rejection auto-logs an audit entry:

```typescript
// In permissions.ts requirePermission():
if (!hasPermission(granted, permission)) {
  auditLog("permission.denied", { type: "user", userId: session.sub }, undefined, { permission, role });
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

This creates a complete trail of access attempts — critical for security auditing.

### 11. Integration with Existing Features

| Feature | Integration |
|---------|-------------|
| F35 Webhooks | Dispatch success/failure logged to server layer |
| F59 Auth | Login, logout, passkey add/remove, TOTP enable/disable logged to audit |
| F30 Forms | Submission received logged to audit, notification failures to server |
| F107 Chat | Tool executions logged to audit (who asked AI to do what) |
| MCP Server | Tool calls already have audit log — merge into unified system |
| Calendar | Historical publish events from audit log (replaces guessing from fields) |
| F97 SEO | Lighthouse scan results logged to server layer |

## Impact Analysis

### Files created (new)
- `packages/cms-admin/src/lib/event-log.ts` — unified write/read API
- `packages/cms-admin/src/lib/client-logger.ts` — browser-side logger
- `packages/cms-admin/src/lib/__tests__/event-log.test.ts` — tests
- `packages/cms-admin/src/app/api/admin/log/route.ts` — GET feed + POST client events
- `packages/cms-admin/src/app/api/admin/log/export/route.ts` — CSV/JSON export
- `packages/cms-admin/src/app/admin/(workspace)/log/page.tsx` — log viewer UI

### Files modified
- All mutation API routes (~30 files) — add `auditLog()` calls
- `packages/cms-admin/src/lib/permissions.ts` — add permission.denied logging
- `packages/cms-admin/src/lib/deploy-service.ts` — add server event logging
- `packages/cms-admin/src/lib/agent-runner.ts` — add agent run logging
- `packages/cms-admin/src/instrumentation-node.ts` — add rotation schedule
- `packages/cms-admin/src/components/sidebar.tsx` — add Event Log nav item
- `packages/cms-admin/src/app/admin/(workspace)/page.tsx` — add dashboard widget

### Blast radius
- Every mutation route is modified (same pattern as F35 webhook wiring — add one `auditLog()` call)
- JSONL append is non-blocking (`appendFileSync` or async with queue)
- Client logger adds ~2KB to the JS bundle
- `POST /api/admin/log` is a new public-ish endpoint (requires session but no role check — any authenticated user can log their own client events)

### Breaking changes
- None — purely additive

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Document create/update/delete logged to audit
- [ ] Settings update logged with changed-keys
- [ ] Login/logout logged to audit
- [ ] Deploy failure logged to server layer
- [ ] Client toast captured via POST endpoint
- [ ] Log rotation works at threshold
- [ ] Permission denied logged with user + attempted permission
- [ ] Export endpoint produces valid CSV/JSON
- [ ] Activity page shows filtered feed across all 3 layers
- [ ] Existing email/password login unaffected
- [ ] Existing content CRUD unaffected

## Implementation Steps

1. Create `event-log.ts` — types, `logEvent()`, `auditLog()`, `serverLog()`, `readLog()`
2. Create `GET/POST /api/admin/log` endpoints
3. Wire `auditLog()` into content routes (create, update, publish, trash, delete)
4. Wire into auth routes (login, logout, passkey, TOTP)
5. Wire into team/settings/deploy/backup/agent routes
6. Add `permission.denied` logging to `requirePermission()`
7. Create `client-logger.ts` browser module + sendBeacon flush
8. Wrap toast to auto-log
9. Build `/admin/log` page with filters + layer toggles
10. Add sidebar nav item (Tools → Event Log)
11. Add dashboard widget (Recent Events)
12. Log rotation in instrumentation scheduled tick
13. Export endpoint (CSV/JSON for GDPR)
14. Docs article

## Dependencies

- None — purely additive. Reuses existing patterns.
- F55 (Enterprise) can later add retention policies, log shipping to external SIEM, and per-user log access restrictions.

## Effort Estimate

**Large** — 5-6 days

- Day 1: Types, event-log.ts (write + read), API endpoints, tests
- Day 2: Wire audit into all mutation routes (~30 files, mechanical)
- Day 3: Server layer (deploy, scheduler, AI, webhooks) + permission.denied
- Day 4: Client logger, toast wrapper, sendBeacon, POST endpoint
- Day 5: Admin UI (log page with filters, dashboard widget, sidebar nav)
- Day 6: Log rotation, export, docs, polish

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).

> **NOTE — F107 Chat Integration:** Add `list_events` and `search_events` chat tools so admins can ask "what changed yesterday?" or "show me all errors this week" via chat.
