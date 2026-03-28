# F86 — Action Bar

> Standardized sticky action bar below tabs — consistent height, breadcrumbs left, action buttons right — across every admin page.

## Problem

The action bar area between tabs and content is inconsistent across pages:
- **Documents**: breadcrumb + status badge + Save/Publish buttons (well done)
- **Interactives detail**: breadcrumb + tool buttons (well done)
- **Agents detail**: breadcrumb + Clone (well done)
- **Settings**: plain "Site Settings" text, Save buttons scattered throughout page sections
- **Collection lists**: just a label, no actions in bar
- **Backup, Link Checker, Media, Calendar, Performance**: no bar or inconsistent bar
- **Button sizes vary** between pages — no standard height/padding

Users can't build muscle memory because every page has different button placement. Settings pages require scrolling to find Save buttons. Action buttons should always be visible.

## Solution

Create a standardized `<ActionBar>` component with fixed 40px height, sticky positioning below tabs. Left slot for breadcrumb/title, right slot for action buttons. All pages adopt ActionBar with page-specific buttons. Settings pages get one Save button in the bar per tab instead of multiple scattered saves.

## Technical Design

### ActionBar Component

```typescript
// packages/cms-admin/src/components/action-bar.tsx

interface ActionBarProps {
  children?: React.ReactNode;        // Left side content (breadcrumb, title)
  actions?: React.ReactNode;         // Right side buttons
}

export function ActionBar({ children, actions }: ActionBarProps) {
  return (
    <div style={{
      position: "sticky",
      top: 48,           // below header (48px)
      zIndex: 30,
      height: "40px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 1.5rem",
      borderBottom: "1px solid var(--border)",
      backgroundColor: "var(--card)",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", overflow: "hidden" }}>
        {children}
      </div>
      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
```

### ActionButton Component

```typescript
// packages/cms-admin/src/components/action-bar.tsx

interface ActionButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  children: React.ReactNode;
  title?: string;
}

export function ActionButton({ onClick, disabled, variant = "secondary", children, title }: ActionButtonProps) {
  // height: 28px, consistent padding, font-size: 0.75rem
  const styles = {
    primary: { background: "var(--primary)", color: "var(--primary-foreground)", border: "none" },
    secondary: { background: "transparent", color: "var(--foreground)", border: "1px solid var(--border)" },
    ghost: { background: "transparent", color: "var(--muted-foreground)", border: "none" },
  };
  // ... render button with 28px height
}
```

### Per-page action bar content

| Page | Left (breadcrumb) | Right (actions) |
|------|-------------------|-----------------|
| Dashboard | "Dashboard" | — |
| Collection list | "{Collection}" | [New] [Generate with AI] |
| Document editor | "{Collection} / {slug}" + status | [Draft ▾] [Save] |
| Interactives list | "Interactives" | [New] |
| Interactive detail | "Interactives / {name}" | [Clone] [Generate] [Code] [Delete] |
| Agent detail | "Agents / {name}" | [Clone] |
| Settings (any tab) | "Settings / {tab}" | [Save] |
| Backup | "Tools / Backup" | [Create Backup] |
| Link Checker | "Tools / Link Checker" | [Run Check] |
| Media | "Media" | [Upload] |
| Calendar | "Calendar" | [Subscribe] |
| Performance | "Performance" | — |
| Trash | "Trash" | — |

### Settings refactor

Settings tabs currently have per-section Save buttons. With ActionBar:
- One `[Save]` button in the bar for the entire tab
- Each settings panel becomes a controlled form (no internal save logic)
- Parent tab collects all state and saves on bar Save click

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/components/action-bar.tsx` — ActionBar + ActionButton components

**Modified files (Phase 1 — new pages that lack bars):**
- `packages/cms-admin/src/app/admin/(workspace)/backup/page.tsx` — add ActionBar
- `packages/cms-admin/src/app/admin/(workspace)/link-checker/page.tsx` — add ActionBar
- `packages/cms-admin/src/app/admin/(workspace)/media/page.tsx` — add ActionBar
- `packages/cms-admin/src/app/admin/(workspace)/scheduled/calendar-client.tsx` — add ActionBar
- `packages/cms-admin/src/app/admin/(workspace)/performance/page.tsx` — add ActionBar

**Modified files (Phase 2 — harmonize existing bars):**
- `packages/cms-admin/src/app/admin/(workspace)/[collection]/page.tsx` — adopt ActionBar
- `packages/cms-admin/src/app/admin/(workspace)/[collection]/[slug]/page.tsx` — adopt ActionBar
- `packages/cms-admin/src/app/admin/(workspace)/interactives/[id]/page.tsx` — adopt ActionBar
- `packages/cms-admin/src/app/admin/(workspace)/agents/[id]/page.tsx` — adopt ActionBar

**Modified files (Phase 3 — Settings refactor):**
- `packages/cms-admin/src/app/admin/(workspace)/settings/page.tsx` — ActionBar with per-tab Save
- `packages/cms-admin/src/components/settings/tools-settings-panel.tsx` — remove internal Save
- `packages/cms-admin/src/components/settings/general-settings-panel.tsx` — remove internal Save
- `packages/cms-admin/src/components/settings/email-settings-panel.tsx` — remove internal Save
- `packages/cms-admin/src/components/settings/ai-settings-panel.tsx` — remove internal Save

### Blast radius
- Document editor Save/Publish buttons are the most sensitive — must preserve exact behavior
- Settings save refactor changes from per-section to per-tab save — data model unchanged, only UI
- PageHeader component may become deprecated or simplified
- Interactives toolbar has complex state (code view toggle, generate modal) — careful migration

### Breaking changes
None — ActionBar is additive. Existing page-specific bars replaced gradually.

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] ActionBar renders at correct position (sticky, below tabs)
- [ ] Document editor Save/Publish still works
- [ ] Settings Save in bar saves all fields in current tab
- [ ] Interactives tools still work (Clone, Generate, Code, Delete)
- [ ] Backup "Create Backup" button works from action bar
- [ ] Link Checker "Run Check" button works from action bar
- [ ] Action buttons have consistent 28px height across all pages
- [ ] Bar height is exactly 40px on all pages

## Implementation Steps

1. Create `action-bar.tsx` with ActionBar + ActionButton components
2. Phase 1: Add ActionBar to pages that currently have no bar (Backup, Link Checker, Media, Calendar, Performance)
3. Phase 2: Migrate existing bars (document editor, interactives, agents, collection lists) to use ActionBar
4. Phase 3: Refactor Settings — one bar Save per tab, remove per-section saves
5. Remove or simplify PageHeader if fully replaced

## Dependencies
- None

## Effort Estimate
**Medium** — 3-4 days (phased rollout, each phase is independently shippable)

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
