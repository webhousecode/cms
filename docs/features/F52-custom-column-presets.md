# F52 — Custom Column Presets

> Visual preset editor in Site Settings for creating custom column layouts beyond the 5 built-in presets.

## Problem

The columns block ships with 5 hardcoded presets (50/50, 66/33, 33/66, 3 equal, 4 equal). Real-world layouts need custom ratios — e.g. 20/60/20 for sidebar-content-sidebar, or 1/3/3/1 for asymmetric 4-column. Currently there's no way to add presets without modifying CMS core code.

## Solution

Add a "Column Presets" section to Site Settings where users can see the 5 built-in presets (read-only) and create custom presets with a visual drag-resize editor. Custom presets are stored per-site (in `_data/column-presets.json` for filesystem, or via GitHub API for GitHub sites) and appear alongside builtins in the columns block layout picker.

## Technical Design

### Data Model

```typescript
interface ColumnPreset {
  id: string;          // e.g. "sidebar-content-sidebar"
  label: string;       // e.g. "Sidebar + Content + Sidebar"
  columns: number[];   // fractional widths, e.g. [1, 3, 1] → 1fr 3fr 1fr
  builtin?: boolean;   // true for the 5 hardcoded presets
}
```

Built-in presets expressed in this model:
```typescript
{ id: "1-1",     label: "50 / 50",  columns: [1, 1],       builtin: true }
{ id: "2-1",     label: "66 / 33",  columns: [2, 1],       builtin: true }
{ id: "1-2",     label: "33 / 66",  columns: [1, 2],       builtin: true }
{ id: "1-1-1",   label: "3 equal",  columns: [1, 1, 1],    builtin: true }
{ id: "1-1-1-1", label: "4 equal",  columns: [1, 1, 1, 1], builtin: true }
```

Custom preset example:
```typescript
{ id: "sidebar-content-sidebar", label: "Sidebar + Content + Sidebar", columns: [1, 3, 1] }
```

### Storage

- **Filesystem sites:** `{projectDir}/_data/column-presets.json`
- **GitHub sites:** Read/write via GitHub Contents API to `_data/column-presets.json`
- Falls back to empty array (builtins only) if file doesn't exist

### API Endpoints

```
GET  /api/cms/column-presets     → { presets: ColumnPreset[] }  (builtins + custom)
POST /api/cms/column-presets     → { preset: ColumnPreset }     (create custom)
PUT  /api/cms/column-presets/:id → { preset: ColumnPreset }     (update custom)
DELETE /api/cms/column-presets/:id → { ok: true }               (delete custom)
```

### Site Settings UI — Column Presets Tab

New section in Site Settings (could be under Schema tab or its own "Layout" tab):

```
┌─────────────────────────────────────────────────────┐
│  COLUMN PRESETS                                      │
│                                                       │
│  Built-in (5)                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ ██ │ ██  │ │ ███ │ █  │ │ █ │ ███  │             │
│  │ 50   50  │ │  66   33 │ │ 33   66  │             │
│  └──────────┘ └──────────┘ └──────────┘             │
│  ┌──────────┐ ┌──────────┐                           │
│  │ █ │ █ │█ │ │█│█│█│█   │                           │
│  │ 3 equal  │ │ 4 equal  │                           │
│  └──────────┘ └──────────┘                           │
│                                                       │
│  Custom                                    + Add      │
│  ┌──────────────────────────────────────────────────┐│
│  │ "Sidebar + Content + Sidebar"  [1fr 3fr 1fr]  ✎ 🗑││
│  │ ┌──┬──────────────────┬──┐                       ││
│  │ │20│       60%        │20│  ← visual preview     ││
│  │ └──┴──────────────────┴──┘                       ││
│  └──────────────────────────────────────────────────┘│
│                                                       │
│  + Add preset                                         │
└─────────────────────────────────────────────────────┘
```

### Visual Preset Editor (Add/Edit)

When adding or editing a custom preset:

1. **Column count** — number input (2-6)
2. **Visual resize** — columns rendered as a bar, drag dividers to adjust ratios
3. **Percentage display** — shows current % for each column
4. **Label** — text input for display name
5. **Preview** — live CSS grid preview with proportions

The resize interaction: click and drag the border between two column cells. As you drag, the `fr` values update in real-time. Snap to common ratios (25%, 33%, 50%, 66%, 75%).

### ColumnsEditor Integration

`columns-editor.tsx` currently reads presets from `LAYOUT_PRESETS` constant. Change it to:

1. Fetch presets from `/api/cms/column-presets` on mount (cached)
2. Merge builtins + custom presets
3. Render all in the layout picker bar
4. Custom presets show their label, builtins show existing labels
5. `layout` field stores the preset `id` (e.g. `"sidebar-content-sidebar"`)
6. Grid CSS computed from `columns` array: `[1,3,1]` → `"1fr 3fr 1fr"`

### Site Rendering

Sites need to resolve custom preset IDs to CSS grid values. Two approaches:

1. **Store grid values in document data** — when saving, resolve preset ID to CSS grid string and store as `gridCols` field. Site reads `gridCols` directly. No lookup needed.
2. **Lookup at render time** — site reads `_data/column-presets.json` and resolves. More coupling.

Approach 1 is simpler and decoupled. The columns block data becomes:
```json
{
  "_block": "columns",
  "layout": "sidebar-content-sidebar",
  "gridCols": "1fr 3fr 1fr",
  "columns": [[], [], []]
}
```

Site rendering just uses `block.gridCols` (falling back to the existing lookup for builtins).

## Implementation Steps

1. **ColumnPreset type + storage** — `_data/column-presets.json` read/write helpers
2. **API endpoints** — CRUD for custom presets
3. **Site Settings UI** — presets section with visual preview cards
4. **Visual preset editor** — drag-resize column bar with live preview
5. **ColumnsEditor integration** — fetch and display custom presets in layout picker
6. **Data model update** — store `gridCols` in columns block data for site rendering
7. **Site rendering** — use `block.gridCols` with fallback to builtin lookup

## Dependencies

- Columns block system (done — this session)
- Site Settings infrastructure (done)
- GitHub API config writer (done — this session)

## Effort Estimate

**Medium** — 3-4 days. The visual drag-resize editor is the most complex part. Storage and API are straightforward. Integration into ColumnsEditor is minimal.
