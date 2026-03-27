# F94 — Favorites

> Heart-toggle on any page, document, or admin function — quick access from sidebar and Command Palette.

See [reference screenshot](assets/favorites-reference.png) for the heart icon interaction pattern.

## Problem

Power users navigate to the same 5-10 places repeatedly: a specific blog post being edited, Site Settings, Deploy, a particular interactive, the curation queue. Today the only quick-access mechanism is open tabs (which get lost on cookie clear) and the Command Palette (which requires remembering the name and typing it).

There's no persistent "my shortcuts" list that survives across sessions and is always one click away.

## Solution

A heart/star toggle (♡ → ♥) on every navigable item in the CMS admin. Favorited items appear in:

1. **Sidebar** — collapsible "Favorites" section at the top (above Sites/Dashboard)
2. **Command Palette** — "Favorites" section shown first when palette opens (before search results)

Favorites are persisted per-user in `UserState` (F43 — already shipped). They can be documents, collections, admin pages, tools, or settings routes.

## Technical Design

### 1. Favorite Data Model

```typescript
// Extend UserState in packages/cms-admin/src/lib/user-state.ts

export interface Favorite {
  id: string;              // unique ID (auto-generated)
  type: "document" | "collection" | "page" | "tool" | "interactive";
  label: string;           // display name, e.g. "The Smart Gatekeeper"
  path: string;            // admin route, e.g. "/admin/posts/smart-gatekeeper"
  icon?: string;           // lucide icon name, e.g. "FileText", "Settings", "Rocket"
  collection?: string;     // for documents: which collection
  slug?: string;           // for documents: which slug
  addedAt: string;         // ISO timestamp
}

export interface UserState {
  // ...existing fields
  favorites: Favorite[];
}
```

### 2. Heart Toggle Component

```typescript
// packages/cms-admin/src/components/favorite-toggle.tsx
"use client";

import { Heart } from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";

export function FavoriteToggle({
  type, label, path, icon, collection, slug,
}: Omit<Favorite, "id" | "addedAt">) {
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(path);

  return (
    <button
      type="button"
      onClick={() => toggle({ type, label, path, icon, collection, slug })}
      title={active ? "Remove from favorites" : "Add to favorites"}
      className="transition-colors"
      style={{
        background: "none", border: "none", cursor: "pointer", padding: "0.25rem",
        color: active ? "#ef4444" : "var(--muted-foreground)",
      }}
    >
      <Heart
        className="w-4 h-4"
        fill={active ? "#ef4444" : "none"}
        strokeWidth={active ? 0 : 1.5}
      />
    </button>
  );
}
```

### 3. Favorites Hook

```typescript
// packages/cms-admin/src/hooks/use-favorites.ts

import { useState, useEffect, useCallback } from "react";

export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  useEffect(() => {
    // Load from localStorage (fast) + server (authoritative)
    const cached = localStorage.getItem("cms-favorites");
    if (cached) setFavorites(JSON.parse(cached));

    fetch("/api/admin/user-state")
      .then(r => r.json())
      .then(state => {
        setFavorites(state.favorites ?? []);
        localStorage.setItem("cms-favorites", JSON.stringify(state.favorites ?? []));
      })
      .catch(() => {});
  }, []);

  const isFavorite = useCallback(
    (path: string) => favorites.some(f => f.path === path),
    [favorites],
  );

  const toggle = useCallback(async (item: Omit<Favorite, "id" | "addedAt">) => {
    const exists = favorites.find(f => f.path === item.path);
    let updated: Favorite[];

    if (exists) {
      updated = favorites.filter(f => f.path !== item.path);
    } else {
      updated = [...favorites, { ...item, id: crypto.randomUUID(), addedAt: new Date().toISOString() }];
    }

    setFavorites(updated);
    localStorage.setItem("cms-favorites", JSON.stringify(updated));

    // Persist to server
    fetch("/api/admin/user-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorites: updated }),
    }).catch(() => {});
  }, [favorites]);

  return { favorites, isFavorite, toggle };
}
```

### 4. Where the Heart Toggle Appears

| Location | What gets favorited | Type |
|----------|-------------------|------|
| Document editor — action bar | The specific document | `document` |
| Collection list — page header | The collection page | `collection` |
| Interactives detail — action bar | The specific interactive | `interactive` |
| Site Settings — page header | Settings page | `page` |
| Deploy — page header | Deploy page | `page` |
| Dashboard — page header | Dashboard | `page` |
| Tools (Link Checker, Screenshots) | The tool tab | `tool` |
| Any admin page with ActionBar | That page route | `page` |

Implementation: Add `<FavoriteToggle>` to the `ActionBar` component as an optional prop, so every page that uses `ActionBar` automatically gets a heart icon.

### 5. Sidebar — Favorites Section

```
Sidebar:
  ★ Favorites              ← new collapsible section (above Sites)
    ♥ The Smart Gatekeeper     /admin/interactives/statistical-anomaly-detection
    ♥ Site Settings            /admin/settings
    ♥ Deploy                   /admin/deploy
    ♥ Posts                    /admin/posts
  ──────────────
  Sites
  Dashboard
  ...
```

- Collapsible (persisted in UserState like `sidebarContentOpen`)
- Hidden when empty (no favorites yet)
- Max 10 items shown, "Show all" link if more
- Items are `SidebarMenuButton` with dynamic icons
- Drag to reorder (optional, future)

### 6. Command Palette — Favorites First

```
⌘K opens:
  ┌─────────────────────────────────────┐
  │ Search...                            │
  │                                     │
  │ FAVORITES                           │
  │ ♥ The Smart Gatekeeper              │
  │ ♥ Site Settings                     │
  │ ♥ Deploy                            │
  │                                     │
  │ PAGES                               │
  │   Dashboard                         │
  │   Sites                             │
  │   ...                               │
  └─────────────────────────────────────┘
```

Favorites section appears at the top of Command Palette results, before the standard page/action list. When searching, favorites matching the query are boosted to the top.

### 7. Persistence

Uses the existing `UserState` system (F43):

```
Client: localStorage("cms-favorites") → instant read
Server: PATCH /api/admin/user-state { favorites: [...] } → debounced sync
```

Survives browser clears, device switches (server-side persistence), and cookie resets.

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/user-state.ts` — add `favorites: Favorite[]` to `UserState`
- `packages/cms-admin/src/hooks/use-favorites.ts` — **new** custom hook
- `packages/cms-admin/src/components/favorite-toggle.tsx` — **new** heart component
- `packages/cms-admin/src/components/sidebar.tsx` — add Favorites section
- `packages/cms-admin/src/components/command-palette.tsx` — add Favorites group
- `packages/cms-admin/src/components/action-bar.tsx` — add optional heart toggle

### Downstream dependents

`user-state.ts` is imported by:
- `app/api/admin/user-state/route.ts` (2 refs) — unaffected, reads/writes full UserState
- `components/sidebar.tsx` (1 ref) — **modified** (adds Favorites section)
- `components/settings/general-settings-panel.tsx` (1 ref) — unaffected
- `lib/tabs-context.ts` (1 ref) — unaffected

`sidebar.tsx` is imported by:
- `components/sidebar-client.tsx` (1 ref) — unaffected, wraps sidebar
- No other direct importers

`command-palette.tsx` is imported by:
- `app/admin/(workspace)/layout.tsx` (1 ref) — unaffected, renders provider

`action-bar.tsx` is imported by:
- ~8 page components — unaffected, new prop is optional

### Blast radius
- `UserState` gains `favorites` field — optional array, defaults to `[]`, backwards-compatible
- Sidebar gains new section — only visible when user has favorites, no visual change for new users
- Command Palette gains new group — additive, existing behavior unchanged
- ActionBar gains optional `favorite` prop — existing pages don't pass it, no change

### Breaking changes
- None — all additions are optional/additive

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Heart toggle adds/removes favorite
- [ ] Favorites persist across page reloads (localStorage)
- [ ] Favorites persist across browser clears (server sync)
- [ ] Sidebar shows Favorites section when ≥1 favorite exists
- [ ] Sidebar hides Favorites section when empty
- [ ] Command Palette shows favorites at top
- [ ] Command Palette search boosts matching favorites
- [ ] Favoriting a document from editor works
- [ ] Favoriting a page (Settings, Deploy) from action bar works
- [ ] Existing sidebar/palette behavior unchanged when no favorites

## Implementation Steps

1. Add `Favorite` type + `favorites: Favorite[]` to `UserState` interface
2. Create `packages/cms-admin/src/hooks/use-favorites.ts`
3. Create `packages/cms-admin/src/components/favorite-toggle.tsx`
4. Add `<FavoriteToggle>` as optional prop to `ActionBar` component
5. Add Favorites section to sidebar (collapsible, hidden when empty)
6. Add Favorites group to Command Palette (above standard results)
7. Add `<FavoriteToggle>` to document editor action bar
8. Add `<FavoriteToggle>` to interactives detail action bar
9. Add `<FavoriteToggle>` to collection list pages
10. Add `<FavoriteToggle>` to Settings, Deploy, Dashboard, Tools pages
11. Test persistence: localStorage fast path + server sync


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- F43 (Persist User State) — Done. Provides `UserState` + `/api/admin/user-state`
- F86 (Action Bar) — provides standardized bar where heart toggle lives

## Effort Estimate

**Small** — 1-2 days

- Day 1: Hook, toggle component, UserState extension, sidebar section
- Day 2: Command Palette integration, add toggle to all pages, test persistence
