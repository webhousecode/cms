# F71 — Multi-Player Editing

> Optimistic document locking (v1) to prevent concurrent edit conflicts, with a future path to real-time collaborative editing via CRDTs (v2).

## Problem

When multiple users have access to the CMS admin (via F01 Invite Users), nothing prevents two users from editing the same document simultaneously. The last save wins, silently overwriting the other user's changes. This causes data loss and frustration — especially in agency scenarios where multiple editors work on the same site. There is no indication that someone else is currently editing a document.

## Solution

**v1 — Optimistic Locking** (ships first, simple, prevents data loss):
When a user opens a document for editing, the document is locked. Other users see a "Being edited by [name]" banner and all fields become read-only. Locks auto-expire after 10 minutes of inactivity. This is a pragmatic, low-complexity solution that solves the real problem (concurrent edit conflicts) without requiring WebSocket infrastructure.

**v2 — Real-Time Collaboration** (future, aspirational):
Google Docs-style collaboration using CRDTs (Yjs) for conflict-free merge and a real-time presence layer (PartyKit or Ably) for live cursors and field highlights. This is significantly more complex and is planned as a separate phase.

## Technical Design

### v1 — Optimistic Locking

#### 1. Lock Data Model

The lock is stored in the document's `_fieldMeta` alongside existing AI Lock metadata. This reuses the established pattern without adding a new system.

```typescript
// packages/cms/src/types/field-meta.ts — extend existing type

interface DocumentLock {
  userId: string;           // ID of the user who holds the lock
  userName: string;         // Display name for the banner
  lockedAt: string;         // ISO timestamp when lock was acquired
  expiresAt: string;        // ISO timestamp: lockedAt + 10 minutes
  lastPingAt: string;       // Updated every 30s by the editing client
}

// In _fieldMeta:
interface DocumentFieldMeta {
  // Existing AI Lock fields...
  _lock?: DocumentLock;     // Document-level edit lock
}
```

#### 2. Lock API

```
// packages/cms-admin/src/app/api/cms/[collection]/[slug]/lock/route.ts

GET  /api/cms/[collection]/[slug]/lock
  → Returns current lock status
  → Response: { locked: boolean, lock?: DocumentLock }

POST /api/cms/[collection]/[slug]/lock
  → Acquire lock for current user
  → Request: { userId: string, userName: string }
  → Response: { success: true, lock: DocumentLock }
  → Error 409: { success: false, lock: DocumentLock }  // Already locked by someone else

PUT  /api/cms/[collection]/[slug]/lock/ping
  → Keep lock alive (called every 30s by editing client)
  → Request: { userId: string }
  → Response: { success: true, expiresAt: string }

DELETE /api/cms/[collection]/[slug]/lock
  → Release lock (on save or close)
  → Request: { userId: string }
  → Response: { success: true }

DELETE /api/cms/[collection]/[slug]/lock/force
  → Force-unlock by admin only
  → Request: { userId: string, role: 'admin' }
  → Response: { success: true }
```

#### 3. Lock Lifecycle

```
User A opens document:
  → POST /api/cms/[collection]/[slug]/lock { userId: A }
  → Lock acquired, A edits normally
  → Client sends PUT .../lock/ping every 30s to keep lock alive

User B opens same document:
  → POST /api/cms/[collection]/[slug]/lock { userId: B }
  → 409 Conflict: locked by A
  → B sees "Being edited by [A's name]" banner
  → All fields rendered as read-only
  → B can still view the document but cannot save

User A saves:
  → Normal save flow (PATCH /api/cms/[collection]/[slug])
  → DELETE /api/cms/[collection]/[slug]/lock
  → Lock released

User A closes browser without saving:
  → Ping stops
  → After 10 min: lock auto-expires
  → Next user who opens the document acquires the lock

User A idle for 10 min:
  → Client detects inactivity (no keystrokes, no focus)
  → Client releases lock proactively
  → Shows "Your editing session has expired" toast
```

#### 4. Client Implementation

```typescript
// packages/cms-admin/src/hooks/use-document-lock.ts

interface UseDocumentLockReturn {
  isLocked: boolean;                // Document is locked by someone else
  isLockOwner: boolean;             // Current user holds the lock
  lockHolder: DocumentLock | null;  // Who holds the lock
  acquireLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
}

export function useDocumentLock(
  collection: string,
  slug: string,
  userId: string,
  userName: string
): UseDocumentLockReturn {
  // 1. On mount: try to acquire lock
  // 2. If acquired: start 30s ping interval
  // 3. If locked by someone else: set isLocked=true, show banner
  // 4. On unmount (navigate away / close): release lock
  // 5. On window beforeunload: release lock via navigator.sendBeacon
  // 6. On 10 min inactivity: release lock, show expiry toast
}
```

#### 5. UI Components

```typescript
// packages/cms-admin/src/components/editor/lock-banner.tsx

interface LockBannerProps {
  lock: DocumentLock;
  onForceUnlock?: () => void;  // Only shown to admin users
}

// Renders at top of document editor:
// "Being edited by Mikkel (since 14:32). All fields are read-only."
// Admin users see: "Force unlock" button
```

```typescript
// packages/cms-admin/src/components/editor/lock-indicator.tsx

// Small indicator in the tab bar showing lock status:
// 🔒 (locked by someone else — yellow)
// ✏️ (you hold the lock — green)
// (no icon — no lock)
```

#### 6. Lock Storage

The lock is stored as part of the document's `_fieldMeta` in the same storage adapter (filesystem or GitHub). This means:

- No additional database or service needed
- Lock survives CMS restarts (persisted to disk)
- Lock is visible via the standard Content API
- GitHub adapter: lock changes create small commits (throttled to avoid noise)

For the filesystem adapter, a lightweight approach: store locks in a separate `_locks/` directory rather than modifying the document JSON on every ping:

```
content/
  articles/
    my-post.json           # Document data
  _locks/
    articles--my-post.json  # { userId, userName, lockedAt, expiresAt, lastPingAt }
```

Lock files are ephemeral — not committed to GitHub, not included in builds.

#### 7. Expired Lock Cleanup

```typescript
// packages/cms/src/content/lock-manager.ts

export class LockManager {
  async acquireLock(collection: string, slug: string, user: LockUser): Promise<LockResult>;
  async releaseLock(collection: string, slug: string, userId: string): Promise<void>;
  async forceUnlock(collection: string, slug: string, adminId: string): Promise<void>;
  async pingLock(collection: string, slug: string, userId: string): Promise<void>;
  async getLock(collection: string, slug: string): Promise<DocumentLock | null>;
  async isLocked(collection: string, slug: string): Promise<boolean>;
  async cleanupExpiredLocks(): Promise<number>;  // Called periodically or on access
}
```

Expired lock cleanup happens lazily: whenever a lock is checked, if it's expired, it's removed. No background process needed.

---

### v2 — Real-Time Collaboration (Future)

#### 1. Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Presence | PartyKit or Ably | Real-time user presence, cursor positions |
| CRDT | Yjs | Conflict-free collaborative editing |
| Rich text | TipTap Collaboration (Yjs binding) | Collaborative rich text editing |
| Transport | WebSocket | Real-time sync |

#### 2. Architecture

```
User A browser  ──WebSocket──►  PartyKit Room (per document)  ◄──WebSocket──  User B browser
                                       │
                                    Yjs Doc
                                  (CRDT state)
                                       │
                                  On idle/save
                                       │
                                       ▼
                              CMS Content API
                              (persist to disk)
```

#### 3. Features

- **Live presence**: see who is currently viewing/editing the document
- **Field-level awareness**: colored border around the field another user is editing
- **Live cursors**: see other users' cursor positions in rich text fields
- **Conflict-free merge**: Yjs CRDT ensures all edits merge without conflicts
- **Offline support**: Yjs handles offline edits and syncs when reconnected

#### 4. Integration Points

```typescript
// packages/cms-admin/src/components/editor/collaborative-editor.tsx

// Wraps the existing document editor with:
// 1. PartyKit WebSocket connection to document room
// 2. Yjs provider for CRDT state sync
// 3. TipTap Collaboration extension for rich text
// 4. Presence indicators (avatars, cursors, field highlights)
// 5. Automatic save when all users disconnect
```

#### 5. PartyKit Room (per document)

```typescript
// packages/cms-admin/src/lib/partykit/document-room.ts

// Room ID: {collection}--{slug}
// State: Yjs Y.Doc with fields mapped to Y.Map / Y.Text / Y.Array
// Presence: { userId, userName, color, cursor, activeField }
// Persistence: snapshot to CMS Content API on idle + on last user disconnect
```

## Impact Analysis

### Files affected
- `packages/cms/src/types/field-meta.ts` — add `DocumentLock` type
- `packages/cms/src/content/lock-manager.ts` — new lock manager
- `packages/cms-admin/src/app/api/cms/[collection]/[slug]/lock/route.ts` — new lock API routes
- `packages/cms-admin/src/hooks/use-document-lock.ts` — new client hook
- `packages/cms-admin/src/components/editor/lock-banner.tsx` — new banner component
- `packages/cms-admin/src/components/editor/lock-indicator.tsx` — new tab indicator
- `packages/cms-admin/src/components/editor/document-editor.tsx` — integrate lock

### Blast radius
- Document editor integration is core — must not interfere with save flow
- Lock files in `_locks/` directory — must be excluded from git commits and builds
- `navigator.sendBeacon` for cleanup may not fire in all browsers

### Breaking changes
- None — locking is transparent to the document data model

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Lock acquired when user opens document
- [ ] Second user sees read-only banner
- [ ] Lock expires after 10 min inactivity
- [ ] Force-unlock works for admin users
- [ ] Lock released on save and navigation

## Implementation Steps

### v1 — Optimistic Locking (days 1-3)
1. Add `DocumentLock` type to `packages/cms/src/types/field-meta.ts`
2. Implement `LockManager` class in `packages/cms/src/content/lock-manager.ts`
3. Add lock file storage in `_locks/` directory (filesystem adapter)
4. Build lock API routes in `packages/cms-admin/src/app/api/cms/[collection]/[slug]/lock/`
5. Implement `useDocumentLock` hook with ping interval and inactivity detection
6. Build `LockBanner` component with read-only state enforcement
7. Build `LockIndicator` component for tab bar
8. Add `navigator.sendBeacon` lock release on browser close
9. Add force-unlock capability for admin users
10. Test: two users editing same document, lock expiry, force-unlock

### v2 — Real-Time Collaboration (days 1-10, future)
11. Set up PartyKit project for document rooms
12. Integrate Yjs as CRDT engine
13. Map CMS document fields to Yjs data types
14. Integrate TipTap Collaboration extension for rich text fields
15. Build presence UI: user avatars, active field indicators
16. Build live cursor rendering in rich text editor
17. Implement persistence: Yjs state -> CMS Content API
18. Handle offline/reconnect scenarios
19. Migration path: v1 locking gracefully upgrades to v2 (v2 replaces v1 when active)
20. Load testing: 5+ simultaneous editors on one document


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- **F01 — Invite Users (Done)** — prerequisite: multiple users must exist in the system
- **F43 — Persist User State (Done)** — used for tracking user identity in lock operations
- v2 additionally requires: PartyKit or Ably account, Yjs library, TipTap Collaboration extension

## Effort Estimate

- **v1 — Small** — 2-3 days (optimistic locking: API, hook, UI components, cleanup)
- **v2 — Large** — 8-10 days (real-time: PartyKit setup, Yjs integration, TipTap Collaboration, presence UI, persistence, offline handling)
