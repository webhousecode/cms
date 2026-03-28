# F13 — Notification Channels

> Multi-channel webhook notifications for CMS automation events (backup, link check, publish, agent completion).

## Status: In Progress (Phase 2)

**Phase 1 (Done):** UI, config, publish webhooks
**Phase 2 (Current):** Shared dispatcher, wire remaining automations, notification log

## What's Already Built

### Webhook List UI (`webhook-list.tsx`)
- Add/remove/reorder webhook URLs
- Auto-detect Discord/Slack URLs → send correctly formatted test messages
- Per-webhook test button with success/failure feedback
- Used in Settings → Automation for all 4 webhook categories

### SiteConfig Storage (`site-config.ts`)
- `backupWebhooks: { id: string; url: string }[]`
- `linkCheckWebhooks: { id: string; url: string }[]`
- `publishWebhooks: { id: string; url: string }[]`
- `agentDefaultWebhooks: { id: string; url: string }[]`
- Org-level inheritance via F87

### Publish Webhook Dispatch (`scheduler-notify.ts`)
- Sends Discord embeds / Slack blocks / generic JSON on scheduled publish/unpublish
- Called from `instrumentation-node.ts` every 60s
- **Legacy issue:** Still reads from `schedulerWebhookUrl` (single URL) instead of `publishWebhooks` array

### Settings UI (`tools-settings-panel.tsx`)
- Backup: frequency, time, retention, webhooks
- Link Checker: frequency, time, webhooks
- Content Publishing: webhooks
- AI Agents (Default): webhooks

## What's Missing (Phase 2)

### 1. Shared Webhook Dispatch Utility
Create `packages/cms-admin/src/lib/webhook-dispatch.ts`:
- Accepts `webhooks: { id: string; url: string }[]` + event payload
- Auto-detect Discord/Slack/generic and format accordingly
- Parallel dispatch to all webhooks in array
- Error handling per webhook (don't let one failure block others)
- Appends to notification log

### 2. Migrate Publish Webhooks
Update `scheduler-notify.ts` to use `publishWebhooks` array via the shared dispatcher instead of legacy `schedulerWebhookUrl`.

### 3. Wire Backup Webhooks
In `tools-scheduler.ts`, after successful backup → dispatch to `config.backupWebhooks` with backup details (fileName, documentCount, trigger).

### 4. Wire Link Check Webhooks
In `tools-scheduler.ts`, after successful link check → dispatch to `config.linkCheckWebhooks` with results (total links, broken count).

### 5. Wire Agent Completion Webhooks
In agent runner, after agent completion/failure → dispatch to `config.agentDefaultWebhooks` with agent name, status, summary.

### 6. Notification Log
Append all webhook dispatches to `<dataDir>/notification-log.jsonl`:
```json
{"timestamp":"...","event":"backup.completed","webhookUrl":"...","success":true,"statusCode":200}
```

## Technical Design

### Shared Dispatcher Interface

```typescript
// packages/cms-admin/src/lib/webhook-dispatch.ts

interface WebhookEvent {
  event: string;                    // e.g. "backup.completed", "content.published"
  title: string;                    // Discord embed title / Slack header
  message: string;                  // Description body
  color?: number;                   // Discord embed color (hex)
  fields?: { name: string; value: string }[];  // Extra fields
  orgName?: string;
  siteName?: string;
  instanceUrl?: string;
}

export async function dispatchWebhooks(
  webhooks: { id: string; url: string }[],
  event: WebhookEvent,
  dataDir?: string,                 // for notification log
): Promise<void>;
```

### Event Types

| Event | Source | Payload |
|-------|--------|---------|
| `content.published` | scheduler-notify | collection, slug, title, action |
| `content.unpublished` | scheduler-notify | collection, slug, title, action |
| `backup.completed` | tools-scheduler | fileName, documentCount, trigger |
| `backup.failed` | tools-scheduler | error message |
| `linkcheck.completed` | tools-scheduler | total, broken |
| `agent.completed` | agent-runner | agent name, collection, documents generated |
| `agent.failed` | agent-runner | agent name, error |

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/webhook-dispatch.ts` — **new**: shared dispatcher
- `packages/cms-admin/src/lib/notification-log.ts` — **new**: JSONL log append/read
- `packages/cms-admin/src/lib/scheduler-notify.ts` — **modify**: use shared dispatcher + publishWebhooks array
- `packages/cms-admin/src/lib/tools-scheduler.ts` — **modify**: dispatch backup + link check webhooks
- `packages/cms-admin/src/lib/agent-runner.ts` — **modify**: dispatch agent webhooks

### Blast radius
- Publish webhook behavior changes from single URL to array — existing single URL migrated via legacy field
- No UI changes needed (webhook-list already supports arrays)

### Breaking changes
- None. Legacy `schedulerWebhookUrl` continues to work via migration in `readSiteConfig()`.

## Test Plan
- [ ] Shared dispatcher formats Discord embeds correctly
- [ ] Shared dispatcher formats Slack blocks correctly
- [ ] Shared dispatcher sends generic JSON for unknown URLs
- [ ] Empty webhook array = no dispatches, no errors
- [ ] Failed fetch for one webhook doesn't block others
- [ ] Backup completion triggers backupWebhooks
- [ ] Link check completion triggers linkCheckWebhooks
- [ ] Agent completion triggers agentDefaultWebhooks
- [ ] Publish still works with publishWebhooks array
- [ ] Notification log records all dispatches
- [ ] TypeScript compiles: `npx tsc --noEmit`

## Effort Estimate

**Small** — 1-2 days. Most infrastructure exists. Core work is the shared dispatcher + wiring 3 missing automation hooks.

---

> **Testing (F99):** Unit tests in `packages/cms-admin/src/lib/__tests__/webhook-dispatch.test.ts`
