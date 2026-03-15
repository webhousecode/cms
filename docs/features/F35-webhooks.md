# F35 — Webhooks

> Outbound webhook system that dispatches content lifecycle events to external services with retry logic, delivery tracking, and preset integrations.

## Problem

When content changes in the CMS, there's no way to notify external systems automatically. Developers need to trigger site rebuilds (Vercel, Netlify), invalidate CDN caches, update search indexes, sync to analytics pipelines, or push to external APIs. F13 (Notification Channels) covers human-facing notifications (Discord, Slack) but lacks the infrastructure needed for reliable machine-to-machine event delivery: retries, delivery logs, event filtering, and signing.

## Solution

A webhook management system built into the CMS engine. Webhooks are configured per site (in `_data/webhooks.json` or via admin UI). Each webhook subscribes to specific events and collections. Events are dispatched asynchronously with exponential backoff retry. Delivery attempts are logged for debugging. Preset templates for Vercel, Netlify, and Cloudflare make common integrations one-click.

## Technical Design

### Webhook Configuration

```typescript
// packages/cms/src/webhooks/types.ts

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  secret?: string;                    // HMAC-SHA256 signing secret
  events: WebhookEvent[];             // which events trigger this webhook
  collections?: string[];             // filter to specific collections (empty = all)
  enabled: boolean;
  headers?: Record<string, string>;   // custom headers
  preset?: 'vercel' | 'netlify' | 'cloudflare' | 'custom';
}

export type WebhookEvent =
  | 'content.created'
  | 'content.updated'
  | 'content.published'
  | 'content.unpublished'
  | 'content.deleted'
  | 'content.bulk'        // batch operations
  | 'media.uploaded'
  | 'media.deleted'
  | 'site.build'          // manual build trigger
  | 'agent.completed';    // AI agent finished a run

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  lastAttemptAt: string;
  responseStatus?: number;
  responseBody?: string;
  createdAt: string;
}
```

### Webhook Dispatcher

```typescript
// packages/cms/src/webhooks/dispatcher.ts

export class WebhookDispatcher {
  constructor(private config: WebhookConfig[]) {}

  /** Dispatch event to all matching webhooks */
  async dispatch(event: WebhookEvent, payload: {
    collection?: string;
    slug?: string;
    document?: Record<string, unknown>;
    actor?: string;
  }): Promise<void>;

  /** Deliver to a single webhook with retry */
  private async deliver(
    webhook: WebhookConfig,
    event: WebhookEvent,
    payload: Record<string, unknown>,
    attempt?: number,
  ): Promise<WebhookDelivery>;

  /** Sign payload with HMAC-SHA256 */
  private sign(payload: string, secret: string): string;
}
```

### Payload Format

```json
{
  "event": "content.published",
  "timestamp": "2026-03-15T10:00:00Z",
  "site": { "id": "webhouse-site", "name": "WebHouse Site" },
  "collection": "posts",
  "document": {
    "id": "abc123",
    "slug": "hello-world",
    "status": "published",
    "data": { "title": "Hello World" }
  },
  "actor": "user:admin@webhouse.app"
}
```

Headers sent with every delivery:
- `Content-Type: application/json`
- `X-Webhook-Event: content.published`
- `X-Webhook-Id: wh_abc123`
- `X-Webhook-Signature: sha256=...` (if secret configured)
- `X-Webhook-Delivery: del_xyz789`

### Preset Templates

```typescript
// packages/cms-admin/src/lib/webhook-presets.ts

export const WEBHOOK_PRESETS = {
  vercel: {
    name: 'Vercel Deploy Hook',
    events: ['content.published', 'content.unpublished', 'content.deleted'],
    headers: {},
    // URL format: https://api.vercel.com/v1/integrations/deploy/prj_xxx/hook_xxx
  },
  netlify: {
    name: 'Netlify Build Hook',
    events: ['content.published', 'content.unpublished', 'content.deleted'],
    // URL format: https://api.netlify.com/build_hooks/xxx
  },
  cloudflare: {
    name: 'Cloudflare Pages Deploy Hook',
    events: ['content.published', 'content.unpublished', 'content.deleted'],
    // URL format: https://api.cloudflare.com/client/v4/pages/webhooks/...
  },
};
```

### Admin UI

```
Site Settings → Webhooks tab

┌──────────────────────────────────────────────┐
│ WEBHOOKS                                      │
│                                               │
│ ┌─────────────────────────────────────────┐   │
│ │ ● Vercel Deploy Hook          Active    │   │
│ │   content.published, content.deleted    │   │
│ │   Last delivery: 2 min ago (200 OK)     │   │
│ └─────────────────────────────────────────┘   │
│                                               │
│ ┌─────────────────────────────────────────┐   │
│ │ ○ Analytics Sync              Disabled  │   │
│ │   content.created, content.updated      │   │
│ │   Last delivery: never                  │   │
│ └─────────────────────────────────────────┘   │
│                                               │
│ [+ Add webhook]  [Presets ▾]                  │
└──────────────────────────────────────────────┘
```

### Storage

Webhook configs stored in `_data/webhooks.json`.
Delivery logs stored in `_data/webhook-deliveries.json` (rolling, max 500 entries).

### Integration with ContentService

```typescript
// In packages/cms/src/content/service.ts — after create/update/delete

// Wire into existing lifecycle hooks (F21)
afterCreate: async (doc) => {
  await dispatcher.dispatch('content.created', { collection, slug: doc.slug, document: doc });
},
afterUpdate: async (doc) => {
  const event = doc.status === 'published' ? 'content.published' : 'content.updated';
  await dispatcher.dispatch(event, { collection, slug: doc.slug, document: doc });
},
afterDelete: async (doc) => {
  await dispatcher.dispatch('content.deleted', { collection, slug: doc.slug, document: doc });
},
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/webhooks` | List all webhooks |
| `POST` | `/api/admin/webhooks` | Create webhook |
| `PATCH` | `/api/admin/webhooks/:id` | Update webhook |
| `DELETE` | `/api/admin/webhooks/:id` | Delete webhook |
| `POST` | `/api/admin/webhooks/:id/test` | Send test delivery |
| `GET` | `/api/admin/webhooks/:id/deliveries` | Delivery log |

## Implementation Steps

1. Create `packages/cms/src/webhooks/types.ts` with interfaces
2. Create `packages/cms/src/webhooks/dispatcher.ts` with dispatch, deliver, sign, retry logic
3. Add webhook storage helpers in `packages/cms-admin/src/lib/webhooks.ts` (read/write `_data/webhooks.json`)
4. Wire dispatcher into ContentService via lifecycle hooks (afterCreate, afterUpdate, afterDelete)
5. Create API routes for CRUD + test delivery + delivery log
6. Build admin UI: webhook list, create/edit form with preset picker, delivery log viewer
7. Add "Webhooks" tab to Site Settings
8. Create preset templates (Vercel, Netlify, Cloudflare)
9. Add retry logic with exponential backoff (3 attempts: 0s, 30s, 5min)
10. Add delivery log with rolling cleanup

## Dependencies

- **#21 Plugin lifecycle hooks** — uses afterCreate/afterUpdate/afterDelete hooks (Done)
- **F13 Notification Channels** — complementary, not dependent. F13 handles human notifications, F35 handles machine integrations.

## Effort Estimate

**Medium** — 3-4 days
