# F43 — Persist User State in Database

> Server-side persistence of open tabs, UI preferences, and editor state — survives browser clears, device switches, and cookie resets.

## Problem

All user-specific UI state (open tabs, sidebar collapse, zoom level, content section toggle, recent searches) is stored in `localStorage`. This means:

- Clearing cookies/site data wipes everything — including tabs the user had open
- Switching browsers or devices loses all state
- Multiple users on the same machine share localStorage
- No way to restore state after a re-login

For a professional CMS, this is unacceptable. An editor who logs in from a new device should see exactly the same workspace they left.

## Solution

Persist user UI state in the existing `_data/users.json` file (or a separate `_data/user-state/{userId}.json` per user). The state is synced to the server on every change (debounced) and loaded on login. localStorage acts as a fast cache but the server is the source of truth.

## Technical Design

### 1. User State Shape

```typescript
// packages/cms-admin/src/lib/user-state.ts

export interface UserState {
  /** Open editor tabs with order */
  tabs: {
    id: string;           // "{collection}/{slug}" or "settings" etc.
    label: string;
    collection?: string;
    slug?: string;
    active: boolean;
  }[];

  /** Sidebar preferences */
  sidebar: {
    collapsed: boolean;
    contentOpen: boolean;  // Content section toggle
  };

  /** UI preferences */
  ui: {
    zoom: number;          // Already exists on User model
    showCloseAllTabs: boolean;
  };

  /** Recent searches (last 20) */
  recentSearches: string[];

  /** Column sort preferences per collection */
  columnSort: Record<string, { column: string; direction: "asc" | "desc" }>;

  /** Last active site (org + site ID) */
  activeSite: {
    orgId: string;
    siteId: string;
  } | null;

  /** Timestamp of last sync */
  updatedAt: string;
}
```

### 2. Storage — Per-User JSON File

```
_data/user-state/
  fb4eda6a-bc5c-4dec-8cb6-c77c9fb74cd9.json   # One file per user ID
```

Using separate files avoids read/write contention when multiple users are active.

### 3. API Endpoints

```
GET  /api/admin/user-state        → returns full UserState
POST /api/admin/user-state        → merges partial update into stored state
```

The POST endpoint accepts a partial `UserState` and deep-merges it with the existing state. This allows granular updates (e.g. only send `tabs` when tabs change).

### 4. Client-Side Sync Hook

```typescript
// packages/cms-admin/src/hooks/use-user-state.ts

export function useUserState() {
  // 1. On mount: fetch from server, merge with localStorage (server wins)
  // 2. On change: update localStorage immediately (fast), debounce POST to server (300ms)
  // 3. Expose state + updaters: setTabs, setSidebar, setZoom, etc.
}
```

### 5. Migration Path

On first load after this feature ships:
1. Server has no `user-state/{userId}.json`
2. Client reads from localStorage (existing behavior)
3. Client POSTs the localStorage state to server as initial seed
4. From then on, server is source of truth

### 6. Integration Points

Update these components to use `useUserState()` instead of direct localStorage:

| Component | Current storage key | State field |
|-----------|-------------------|-------------|
| `tab-bar.tsx` | `cms-open-tabs` | `tabs` |
| `sidebar.tsx` | `cms-content-open` | `sidebar.contentOpen` |
| `sidebar.tsx` | `cms-sidebar-collapsed` | `sidebar.collapsed` |
| `general-settings-panel.tsx` | zoom on User model | `ui.zoom` |
| `collection-list.tsx` | sort preferences | `columnSort` |
| `search.tsx` | recent searches | `recentSearches` |

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/user-state.ts` — new user state read/write module
- `packages/cms-admin/src/hooks/use-user-state.ts` — new sync hook
- `packages/cms-admin/src/app/api/admin/user-state/route.ts` — new API endpoints
- `packages/cms-admin/src/components/tab-bar.tsx` — migrate from localStorage
- `packages/cms-admin/src/components/sidebar.tsx` — migrate from localStorage
- `packages/cms-admin/src/components/collection-list.tsx` — migrate sort preferences

### Blast radius
- All components reading from localStorage need migration — phased rollout recommended
- Server-side state becomes source of truth — conflicts with localStorage during transition

### Breaking changes
- None — localStorage acts as fallback during migration

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] User state persists across browser clear + re-login
- [ ] Initial seed from localStorage to server works
- [ ] Debounced sync doesn't cause excessive API calls
- [ ] Tab state restored after login on new device

## Implementation Steps

1. **Create `UserState` interface and `user-state.ts` lib** — read/write per-user JSON files
2. **Create `GET/POST /api/admin/user-state` endpoints**
3. **Create `useUserState()` hook** — fetch on mount, debounced sync, localStorage cache
4. **Migrate tab-bar.tsx** — use `useUserState().tabs` instead of localStorage
5. **Migrate sidebar.tsx** — collapse state + content toggle
6. **Migrate collection-list sort** — column sort preferences
7. **Migrate search** — recent searches
8. **Add migration logic** — seed server from localStorage on first use
9. **Load state after login** — fetch user-state immediately after successful auth
10. **Test** — login from incognito, verify tabs persist; clear site data, re-login, verify restoration

## Dependencies

- **F01 Invite Users** — when multiple users exist, each gets their own state file (works today with single user too)
- **F34 Multi-Tenancy** — state is per-user, not per-site; but `activeSite` field tracks which site was last active

## Effort Estimate

**Small** — 1-2 days

- Day 1: UserState type, API endpoints, useUserState hook, tab migration
- Day 2: Remaining migrations (sidebar, sort, search), testing, localStorage→server seed
