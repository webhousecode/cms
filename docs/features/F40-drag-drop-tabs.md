# F40 — Drag and Drop Tab Reordering

> Allow users to reorder open tabs in the admin UI by dragging them, using `@dnd-kit/sortable` integrated into the existing `TabsProvider` and `TabBar` components.

## Problem

The CMS admin supports multi-tab navigation (`TabsProvider` in `packages/cms-admin/src/lib/tabs-context.tsx`), but tabs are always ordered by creation time. Power users working with many open tabs cannot rearrange them to group related documents together. There is no way to move a tab to a different position without closing and re-opening it in the desired order.

## Solution

Add drag-and-drop reordering to the `TabBar` component (`packages/cms-admin/src/components/tab-bar.tsx`) using `@dnd-kit/sortable`. The new tab order persists in `localStorage` alongside the existing tab state.

## Library Choice: `@dnd-kit/sortable`

| Criteria | @dnd-kit/sortable | react-beautiful-dnd |
|----------|-------------------|---------------------|
| Maintained | Active, React 18/19 compatible | Deprecated by Atlassian |
| Bundle size | ~12 KB gzipped (core + sortable) | ~30 KB gzipped |
| Accessibility | Built-in keyboard + screen reader | Good but heavier |
| Horizontal lists | First-class support | Supported |
| Touch support | Built-in sensors | Built-in |

`@dnd-kit` is the clear winner: actively maintained, lightweight, accessible, and designed for exactly this use case.

## Impact Analysis

### Files affected
- `packages/cms-admin/package.json` — add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `packages/cms-admin/src/lib/tabs-context.tsx` — add `reorderTabs` to context
- `packages/cms-admin/src/components/tab-bar.tsx` — wrap tabs in DndContext + SortableContext

### Blast radius
- Tab bar is visible on every admin page — drag must not interfere with click/close
- localStorage persistence format unchanged — no migration needed

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Tabs reorder via drag and drop
- [ ] Close button still works (not intercepted by drag)
- [ ] Keyboard reordering accessible
- [ ] Tab order persists in localStorage after reload

## Implementation Plan

### Phase 1 — Context Layer (`tabs-context.tsx`)

Add a `reorderTabs` function to the `TabsCtx` type and `TabsProvider`:

```ts
// New method on TabsCtx
reorderTabs: (activeId: string, overId: string) => void;
```

Implementation inside `TabsProvider`:

```ts
const reorderTabs = useCallback((dragId: string, overId: string) => {
  const prev = tabsRef.current;
  const oldIndex = prev.findIndex((t) => t.id === dragId);
  const newIndex = prev.findIndex((t) => t.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
  const next = arrayMove(prev, oldIndex, newIndex); // from @dnd-kit/sortable
  applyTabs(next, activeIdRef.current);
}, []);
```

This uses `arrayMove` from `@dnd-kit/sortable` — a pure utility that reorders an array by index. The result is passed through the existing `applyTabs()` function, which updates state, refs, and `localStorage` in one call. No changes to the persistence format needed — the `tabs` array order already determines display order.

### Phase 2 — TabBar Component (`tab-bar.tsx`)

Wrap the tab strip in dnd-kit's sortable context:

```tsx
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

**SortableTab wrapper component:**

```tsx
function SortableTab({ tab, isActive, switchTab, closeTab }: {
  tab: Tab;
  isActive: boolean;
  switchTab: (id: string) => void;
  closeTab: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    // ... existing tab styles
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
         onClick={() => switchTab(tab.id)}>
      {/* existing tab content: icon, status dot, title, close button */}
    </div>
  );
}
```

**Updated TabBar render:**

```tsx
export function TabBar() {
  const { tabs, activeId, openTab, closeTab, closeAllTabs, switchTab, reorderTabs } = useTabs();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderTabs(active.id as string, over.id as string);
    }
  }

  return (
    <div style={{ /* existing container styles */ }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tabs.map(t => t.id)} strategy={horizontalListSortingStrategy}>
          {tabs.map((tab) => (
            <SortableTab key={tab.id} tab={tab} isActive={tab.id === activeId}
                         switchTab={switchTab} closeTab={closeTab} />
          ))}
        </SortableContext>
      </DndContext>

      {/* New tab button and Close All button remain outside DndContext */}
    </div>
  );
}
```

### Phase 3 — Visual Feedback

- **Drag activation:** 5px distance constraint prevents accidental drags during click
- **Dragging tab:** 50% opacity, slight scale transform
- **Drop indicator:** dnd-kit's built-in CSS transforms animate the placeholder position
- **Cursor:** `grab` on hover, `grabbing` while dragging
- **Keyboard:** Arrow keys move tabs left/right when focused (built-in with `KeyboardSensor`)

### Phase 4 — Persistence

No schema changes needed. The existing `save()` function in `tabs-context.tsx` already serializes the `tabs` array to `localStorage` key `cms-admin-tabs-v1`. Since array order determines display order, reordering is automatically persisted through the existing `applyTabs()` call.

## Files Changed

| File | Change |
|------|--------|
| `packages/cms-admin/package.json` | Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| `packages/cms-admin/src/lib/tabs-context.tsx` | Add `reorderTabs` to `TabsCtx` type and `TabsProvider`; export in context value |
| `packages/cms-admin/src/components/tab-bar.tsx` | Wrap tabs in `DndContext` + `SortableContext`; extract `SortableTab` component |

## Accessibility

- `@dnd-kit` provides built-in ARIA attributes (`aria-roledescription`, `aria-describedby`)
- Keyboard reordering: focus a tab, press Space to pick up, Arrow keys to move, Space to drop
- Screen reader announcements for drag start, drag over, and drop events
- The existing `role="tab"` and `aria-selected` attributes are preserved on each tab

## Edge Cases

- **Single tab:** DndContext renders but has nothing to reorder — no visual change
- **Close button during drag:** The `distance: 5` activation constraint means quick clicks on the close button (X) work normally without triggering a drag
- **New tab insertion:** New tabs always append to the end (existing behavior unchanged)
- **Tab overflow / wrapping:** `horizontalListSortingStrategy` handles wrapped flex layouts correctly
- **Touch devices:** `PointerSensor` handles both mouse and touch input

## Estimate

- **Size:** Small (1-2 hours)
- **Risk:** Low — additive change, no modifications to tab state shape or persistence format
- **Dependencies:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (all from same maintainer)

> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
> - **Unit tests** → `packages/cms-admin/src/lib/__tests__/{feature}.test.ts` or `packages/cms/src/__tests__/{feature}.test.ts`
> - **API tests** → `packages/cms-admin/tests/api/{feature}.test.ts`
> - **E2E tests** → `packages/cms-admin/e2e/suites/{nn}-{feature}.spec.ts`
> - Use shared fixtures: `auth.ts` (JWT login), `mock-llm.ts` (intercept AI), `test-data.ts` (seed/cleanup)
> - Tests are written BEFORE implementation. All tests must pass before merge.
