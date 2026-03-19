# F13 — Notification Channels

> Multi-channel notifications for CMS events via Discord, Slack, Telegram, and webhooks.

## Problem

CMS events (new content created, AI agent completed, publish, errors) are only visible in the admin UI. There is no way to get notifications in team communication tools or trigger external automations.

## Solution

A notification channel system that dispatches events to configured channels. Supports Discord, Slack, Telegram, and generic webhooks. Each channel can subscribe to specific event types. Users configure preferences per channel.

## Technical Design

### Channel Types

```typescript
// packages/cms-admin/src/lib/notifications/types.ts

export type ChannelType = 'discord' | 'slack' | 'telegram' | 'webhook' | 'email';

export type EventType =
  | 'content.created'
  | 'content.published'
  | 'content.deleted'
  | 'agent.completed'
  | 'agent.failed'
  | 'curation.new'
  | 'deploy.success'
  | 'deploy.failed'
  | 'link-check.broken'
  | 'scheduled.published';

export interface NotificationChannel {
  id: string;
  type: ChannelType;
  name: string;               // e.g. "Team Discord"
  config: DiscordConfig | SlackConfig | TelegramConfig | WebhookConfig | EmailConfig;
  events: EventType[];        // which events trigger this channel
  enabled: boolean;
  createdAt: string;
}

export interface DiscordConfig {
  webhookUrl: string;         // Discord webhook URL
}

export interface SlackConfig {
  webhookUrl: string;         // Slack incoming webhook URL
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  secret?: string;            // HMAC signing secret
}

export interface EmailConfig {
  to: string[];
}
```

### Notification Dispatcher

```typescript
// packages/cms-admin/src/lib/notifications/dispatcher.ts

export interface NotificationPayload {
  event: EventType;
  title: string;
  message: string;
  url?: string;               // link to admin page
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export class NotificationDispatcher {
  async dispatch(payload: NotificationPayload): Promise<void>;
  // Loads channels from <dataDir>/notification-channels.json
  // Filters channels by event type
  // Sends to each matching channel in parallel
}
```

### Channel Senders

```typescript
// packages/cms-admin/src/lib/notifications/senders/
// discord.ts — POST to webhook URL with Discord embed format
// slack.ts — POST to webhook URL with Slack Block Kit format
// telegram.ts — POST to Telegram Bot API
// webhook.ts — POST/PUT with HMAC signature in X-Signature header
```

### Storage

Channels stored at `<dataDir>/notification-channels.json`. Notification log at `<dataDir>/notification-log.jsonl`.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/notifications/channels` | List channels |
| `POST` | `/api/admin/notifications/channels` | Create channel |
| `PUT` | `/api/admin/notifications/channels/[id]` | Update channel |
| `DELETE` | `/api/admin/notifications/channels/[id]` | Delete channel |
| `POST` | `/api/admin/notifications/channels/[id]/test` | Send test notification |

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/notifications/types.ts` — new notification types
- `packages/cms-admin/src/lib/notifications/dispatcher.ts` — new dispatcher
- `packages/cms-admin/src/lib/notifications/senders/discord.ts` — new Discord sender
- `packages/cms-admin/src/lib/notifications/senders/slack.ts` — new Slack sender
- `packages/cms-admin/src/lib/notifications/senders/telegram.ts` — new Telegram sender
- `packages/cms-admin/src/lib/notifications/senders/webhook.ts` — new webhook sender
- `packages/cms-admin/src/app/api/admin/notifications/` — new API routes
- `packages/cms-admin/src/app/admin/settings/notifications/page.tsx` — new settings page

### Blast radius
- Event dispatch hooks need to be wired into existing content/agent lifecycle — could add latency
- Webhook payloads are a public API contract

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Discord webhook delivers notification
- [ ] Event filtering works per channel
- [ ] Test notification button sends sample message
- [ ] Notification log records deliveries

## Implementation Steps

1. Create `packages/cms-admin/src/lib/notifications/types.ts` with interfaces
2. Create senders: `discord.ts`, `slack.ts`, `telegram.ts`, `webhook.ts`
3. Create `packages/cms-admin/src/lib/notifications/dispatcher.ts`
4. Create API routes at `packages/cms-admin/src/app/api/admin/notifications/`
5. Build channel management UI at `packages/cms-admin/src/app/admin/settings/notifications/page.tsx`
6. Add "Test" button that sends a sample notification to the channel
7. Hook dispatcher into existing event points: document create/publish/delete, agent runner completion, link checker results
8. Add notification log viewer in admin

## Dependencies

- None — standalone system that hooks into existing events

## Effort Estimate

**Medium** — 3-4 days
