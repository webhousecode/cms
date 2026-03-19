# F64 — Toast Notifications System

> Comprehensive toast notification system with event-driven feedback across all CMS admin actions.

## Problem

Users performing actions in the CMS admin (save, publish, upload, AI generation) get inconsistent or no feedback. Some actions complete silently, leaving users unsure if their action succeeded. Background processes (scheduled publishing, AI agent runs, link checks) complete without any notification, forcing users to manually check results. There is no unified notification layer.

## Solution

A two-phase toast notification system built on Sonner. Phase 1 (already complete) covers core CRUD feedback and scheduler push notifications with custom audio. Phase 2 extends coverage to AI operations, error states, undo actions, and user-configurable notification preferences including native browser notifications.

## What's Already Done (Phase 1 — COMPLETE)

- Sonner installed and configured with dark theme, richColors
- SSE push from scheduler daemon (publish/expire events)
- Scheduler toasts with custom Web Audio notification sounds
- Toast test endpoint (`/api/admin/scheduler-test`)
- Basic toasts on: document save/publish/unpublish/clone/trash, media upload, interactives upload, all settings saves, team invitations, password change, webhook/email tests

## What's Planned (Phase 2)

### AI & Agent Toasts
- **AI generation/rewrite done** — toast when AI finishes generating or rewriting content
- **Brand voice interview complete** — toast when interview finishes
- **Agent run complete** — toast when scheduled AI agent finishes

### Action Feedback Toasts
- **Undo-trash** — trash toast includes "Undo" button that restores the document
- **Link checker scan complete** — toast with result summary (X links checked, Y broken)

### Error Toasts
- **Network failures** — connection lost, request timeout
- **Save conflicts** — another user modified the same document
- **Auth expired** — session timeout, re-login required

### User Preferences
- **Notification preferences** — user can choose which toasts to see (in Account Preferences)
- **Browser Notification API** — optional native OS notifications for background tabs (requires user permission)

## Technical Design

### 1. Existing Infrastructure

```
packages/cms-admin/src/
  app/layout.tsx           → <Toaster /> component (Sonner)
  lib/scheduler-bus.ts     → EventEmitter for SSE events
  lib/notification-sound.ts → Web Audio API notification chimes
  api/admin/scheduler-sse/ → SSE endpoint for push notifications
```

### 2. SSE Bus Extension

Phase 2 events from AI/agents reuse the same SSE bus pattern:

```typescript
// scheduler-bus.ts — add new event types
export type BusEvent =
  | { type: "scheduler:published"; slug: string; collection: string }
  | { type: "scheduler:expired"; slug: string; collection: string }
  // Phase 2
  | { type: "ai:generated"; collection: string; slug: string; agent?: string }
  | { type: "ai:rewritten"; collection: string; slug: string }
  | { type: "agent:complete"; agentId: string; agentName: string; result: string }
  | { type: "linkcheck:complete"; total: number; broken: number }
  | { type: "interview:complete"; siteId: string };
```

### 3. Undo-Trash Pattern

```typescript
// On trash action
toast("Document moved to trash", {
  action: {
    label: "Undo",
    onClick: async () => {
      await fetch(`/api/cms/${collection}/${slug}`, {
        method: "PATCH",
        body: JSON.stringify({ _status: "draft" }),
      });
      router.refresh();
    },
  },
  duration: 8000, // longer duration for undo
});
```

### 4. Notification Preferences

Stored in user-state (F43) per-user, per-site:

```typescript
interface NotificationPreferences {
  toasts: {
    scheduler: boolean;     // default: true
    ai: boolean;            // default: true
    errors: boolean;        // default: true
    saves: boolean;         // default: true
  };
  browserNotifications: boolean;  // default: false
  sound: boolean;                 // default: true
}
```

### 5. Browser Notification API

```typescript
async function sendBrowserNotification(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission === "granted" && document.hidden) {
    new Notification(title, { body, icon: "/favicon.ico" });
  }
}
```

Only fires when the tab is not focused (`document.hidden`). Permission prompt shown in Account Preferences when user enables browser notifications.

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/scheduler-bus.ts` — extend with new event types
- `packages/cms-admin/src/components/` — add toasts to AI/agent/link-check completion
- `packages/cms-admin/src/app/admin/account/` — notification preferences UI
- `packages/cms-admin/src/lib/user-state.ts` — store notification preferences

### Blast radius
- SSE bus extension adds new event types — listeners must handle unknown types gracefully
- Browser Notification API requires permission prompt — must not be intrusive

### Breaking changes
- None — new toast events are additive

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] AI generation toast appears on completion
- [ ] Undo-trash restores document when clicked
- [ ] Notification preferences toggle toasts on/off
- [ ] Browser notification fires when tab is hidden

## Implementation Steps

1. **Add AI/agent events to SSE bus** — extend `scheduler-bus.ts` with new event types
2. **Wire AI generation toasts** — toast on generation/rewrite complete in AI panel
3. **Wire agent run toasts** — SSE push when scheduled agent finishes
4. **Wire link checker toast** — result summary after scan
5. **Implement undo-trash** — add Undo button to trash toast, PATCH to restore
6. **Add error toasts** — network error interceptor, auth expiry handler, save conflict detection
7. **Build notification preferences UI** — section in Account Preferences
8. **Store preferences in user-state** — read preferences before showing toasts
9. **Browser Notification API** — permission prompt, send when tab is hidden
10. **Wire brand voice interview toast** — notify when interview finishes

## Dependencies

- F47 Content Scheduling (done) — scheduler SSE infrastructure
- Sonner (done) — toast component library
- F43 Persist User State (done) — notification preferences storage

## Effort Estimate

**Small** — 2-3 days (Phase 1 already complete, Phase 2 is incremental)

- Day 1: AI/agent toasts, undo-trash, error toasts
- Day 2: Notification preferences UI, user-state integration, browser notifications
- Day 3: Testing, polish, edge cases
