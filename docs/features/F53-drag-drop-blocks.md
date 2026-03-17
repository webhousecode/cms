# F53 — Drag & Drop Blocks Between Columns

> Drag blocks between columns and reorder within columns using @dnd-kit.

## Problem

Blocks inside columns can only be reordered with up/down arrows within a single column. Moving a block from Column 1 to Column 3 requires deleting it and re-creating it. This is tedious for layout work — users expect drag & drop.

## Solution

Add `@dnd-kit/core` + `@dnd-kit/sortable` to the columns editor. Each block becomes a draggable item, each column becomes a droppable zone. Dragging a block between columns moves it. Dragging within a column reorders it. Visual drop targets with gold glow show where the block will land.

## Technical Design

### Dependencies (npm)

```
@dnd-kit/core
@dnd-kit/sortable
@dnd-kit/utilities
```

Already used for F40 (tab reordering) if implemented — otherwise a new dependency.

### DnD Architecture

Each block gets a unique ID: `{columnIndex}-{blockIndex}` (e.g. `"0-2"` = column 0, block 2).

```typescript
// Unique ID for each block across all columns
function blockId(colIdx: number, blockIdx: number): string {
  return `${colIdx}-${blockIdx}`;
}

// Parse back to indices
function parseBlockId(id: string): { colIdx: number; blockIdx: number } {
  const [col, block] = id.split("-").map(Number);
  return { colIdx: col, blockIdx: block };
}
```

### ColumnsEditor Changes

**File:** `packages/cms-admin/src/components/editor/columns-editor.tsx`

Wrap the columns grid in a `<DndContext>` with multiple `<SortableContext>` (one per column):

```tsx
<DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
  <div style={{ display: "grid", gridTemplateColumns: getGridCols(layout) }}>
    {normalizedColumns.map((colBlocks, colIdx) => (
      <SortableContext
        key={colIdx}
        items={colBlocks.map((_, blockIdx) => blockId(colIdx, blockIdx))}
        strategy={verticalListSortingStrategy}
      >
        <DroppableColumn colIdx={colIdx}>
          {colBlocks.map((block, blockIdx) => (
            <SortableBlock
              key={blockId(colIdx, blockIdx)}
              id={blockId(colIdx, blockIdx)}
              block={block}
              // ... existing block rendering props
            />
          ))}
        </DroppableColumn>
      </SortableContext>
    ))}
  </div>
</DndContext>
```

### handleDragEnd Logic

```typescript
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const from = parseBlockId(String(active.id));
  const to = parseBlockId(String(over.id));

  const newColumns = [...normalizedColumns.map(col => [...col])];

  // Remove from source
  const [moved] = newColumns[from.colIdx].splice(from.blockIdx, 1);

  // Insert at target
  newColumns[to.colIdx].splice(to.blockIdx, 0, moved);

  onChange({ ...block, columns: newColumns });
}
```

### SortableBlock Component

Wraps each block in `useSortable()`:

```tsx
function SortableBlock({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: "relative",
      }}
      {...attributes}
    >
      {/* Drag handle — the 6-dot grip icon in block header */}
      <div {...listeners} style={{ cursor: "grab" }}>
        <GripVertical style={{ width: 14, height: 14 }} />
      </div>
      {children}
    </div>
  );
}
```

### Visual Feedback

- **Dragging:** Block becomes semi-transparent (opacity 0.5)
- **Drop target:** Gold glow outline (`box-shadow: 0 0 12px rgba(247, 187, 46, 0.4)`) on the column receiving the block
- **Drop indicator:** A horizontal gold line shows insertion position between blocks
- **Drag overlay:** Ghost of the block follows the cursor (via `<DragOverlay>`)

### BlocksEditor Integration

The existing `BlocksEditor` gets an optional `enableDragHandle` prop. When true, it renders a drag handle (grip icon) in the block header instead of / alongside the up/down arrows. Inside columns, drag handles are enabled. In top-level sections, up/down arrows remain (drag is optional).

### Scope Boundaries

- **Within columns only** — blocks can be dragged between columns of the same `columns` block, not between different `columns` blocks or to top-level sections
- **No cross-block dragging** — a block in Columns A cannot be dragged to Columns B
- **Touch support** — `@dnd-kit` includes touch sensors out of the box
- **Keyboard support** — `@dnd-kit` includes keyboard sensor (Space to pick up, arrows to move, Space to drop)

## Implementation Steps

1. **Install @dnd-kit** — `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
2. **SortableBlock component** — wraps blocks with drag handle + sortable behavior
3. **ColumnsEditor DnD context** — `DndContext` with `SortableContext` per column
4. **handleDragEnd** — move blocks between columns, reorder within columns
5. **Visual feedback** — drag overlay, drop indicators, gold glow on targets
6. **Drag handle in block header** — grip icon, optional via prop
7. **Test** — drag between 2/3/4 columns, reorder within, keyboard, touch

## Dependencies

- Columns block system (done)
- `@dnd-kit/core` + `@dnd-kit/sortable` (new npm dependency)

## Effort Estimate

**Medium** — 2-3 days. @dnd-kit handles the heavy lifting. Main work is integrating with the existing block rendering and getting the visual feedback right.
