# F106 — TipTap v3 Upgrade

> Upgrade richtext editor from TipTap v2.x to v3.x for React 19 compatibility, Static Renderer, Drag Handle, and consolidated packages.

## Problem

CMS admin runs TipTap v2.11 with React 19 (Next.js 16). This causes:

1. **flushSync warnings** — "flushSync was called from inside a lifecycle method" on every editor render. TipTap v2 uses `flushSync` in lifecycle methods which React 19 flags as errors.
2. **No Static Renderer** — CMS has no way to render TipTap JSON to HTML without an editor instance. This blocks server-side content preview, static site generation from JSON, and API content delivery.
3. **10 Pro extensions locked behind paywall** — Drag Handle, Emoji, Math, File Handling etc. are free in v3 but paid in v2.
4. **v2 end-of-life** — TipTap v2 will stop receiving security patches and bug fixes.

## Solution

Upgrade all `@tiptap/*` packages from v2 to v3. Migrate imports to consolidated packages (TableKit, ListKit, TextStyleKit). Replace Tippy.js BubbleMenu with Floating UI. Verify all 6 custom NodeViews. Add Static Renderer for server-side content rendering.

## Technical Design

### Package Migration

| v2 Package | v3 Replacement |
|---|---|
| `@tiptap/react` | `@tiptap/react` (BubbleMenu moves to `@tiptap/react/menus`) |
| `@tiptap/starter-kit` | `@tiptap/starter-kit` (now includes Link, Underline, ListKeymap) |
| `@tiptap/extension-table` + `table-row` + `table-cell` + `table-header` | `@tiptap/extension-table` (consolidated, use `TableKit`) |
| `@tiptap/extension-placeholder` | `@tiptap/extensions` |
| `@tiptap/extension-image` | `@tiptap/extension-image` (unchanged) |
| `@tiptap/extension-link` | Disable in StarterKit (already in StarterKit v3) or keep standalone |
| `@tiptap/core` | `@tiptap/core` (unchanged) |
| `tippy.js` (transitive) | `@floating-ui/dom@^1.6.0` |
| — (new) | `@tiptap/static-renderer` |

### BubbleMenu Migration

**File:** `packages/cms-admin/src/components/editor/ai-bubble-menu.tsx`

```typescript
// v2
import { BubbleMenu } from "@tiptap/react";
<BubbleMenu tippyOptions={{ duration: 100, placement: "top-start" }}>

// v3
import { BubbleMenu } from "@tiptap/react/menus";
<BubbleMenu options={{ placement: "top-start" }}>
```

### StarterKit Config

```typescript
// v2
StarterKit.configure({ history: false })

// v3
StarterKit.configure({
  undoRedo: false,          // renamed from history
  link: false,              // disable — configured separately
  underline: false,         // disable — configured separately
})
```

### Static Renderer (new capability)

```typescript
import { renderHTML } from "@tiptap/static-renderer";

// Render TipTap JSON to HTML without editor instance
const html = renderHTML(doc.data.content, { extensions: [...] });
```

Use cases:
- `/api/cms/content/:collection/:slug` can return rendered HTML
- Static site builder can render content server-side
- Preview thumbnails can use HTML snapshots

### Custom NodeViews

All 6 custom NodeViews already use `NodeViewWrapper` and `ReactNodeViewRenderer`. The only required change is `getPos()` undefined check — but this is already handled correctly at line 353.

NodeViews to verify:
1. `ImageNodeView` — image resize, float, width
2. `BlockMarkerView` — block markers
3. `VideoNodeView` — video embeds
4. `AudioNodeView` — audio embeds
5. `InteractiveNodeView` — interactive embeds
6. `FileAttachmentView` — file attachments
7. `CalloutNodeView` — callout/notice blocks

### shouldRerenderOnTransaction

v3 disables `shouldRerenderOnTransaction` by default. The CMS uses `useEditorState` (line 2074) for toolbar state — this should continue working. Verify toolbar buttons reflect current state after upgrade.

## Impact Analysis

### Files affected

**Modified:**
- `packages/cms-admin/package.json` — bump all `@tiptap/*` to v3, add `@floating-ui/dom`
- `packages/cms-admin/src/components/editor/rich-text-editor.tsx` — import changes, StarterKit config, Table consolidation
- `packages/cms-admin/src/components/editor/ai-bubble-menu.tsx` — BubbleMenu import + tippyOptions → options
- `pnpm-lock.yaml` — lockfile update

**Created:**
- (none initially, Static Renderer usage added in follow-up)

**Deleted:**
- (none)

### Downstream dependents

`packages/cms-admin/src/components/editor/rich-text-editor.tsx` is imported by 3 files:
- `packages/cms-admin/src/components/editor/field-editor.tsx` (1 ref) — imports `RichTextEditor`, unaffected (props unchanged)
- `packages/cms-admin/src/components/editor/ai-bubble-menu.tsx` (0 refs) — not imported, but uses same TipTap types
- `packages/cms-admin/src/components/editor/document-editor.tsx` (0 refs) — uses field-editor, not direct import

`packages/cms-admin/src/components/editor/ai-bubble-menu.tsx` is imported by 1 file:
- `packages/cms-admin/src/components/editor/rich-text-editor.tsx` (1 ref) — import unchanged

`packages/cms-admin/package.json` — all packages depend on this, but only version bumps.

### Blast radius

- **Toolbar state** — `shouldRerenderOnTransaction` default change could cause toolbar buttons to not reflect current formatting. Mitigated by existing `useEditorState` usage.
- **BubbleMenu positioning** — Floating UI may position differently than Tippy.js. AI bubble menu placement needs visual verification.
- **Content compatibility** — TipTap v3 JSON format is backwards compatible with v2. No content migration needed.
- **Interactive embed roundtrip** — Already broken (noted in memory `int-roundtrip-unsolved`). May behave differently with v3 rerender behavior.
- **CSS** — No TipTap CSS changes. ProseMirror class names unchanged.

### Breaking changes

No breaking changes to CMS APIs, data formats, or component props. The upgrade is internal to the richtext editor. Content JSON remains compatible.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Create new document with richtext field — verify toolbar renders
- [ ] Bold, italic, headings, lists, code blocks — all formatting works
- [ ] Insert image — resize, float left/right/center
- [ ] Insert video embed — play, alignment
- [ ] Insert audio embed — play, alignment
- [ ] Insert interactive embed — renders iframe
- [ ] Insert file attachment — shows download link
- [ ] Insert callout — info/warning/tip variants
- [ ] Table — create, add rows/columns, delete
- [ ] AI bubble menu — appears on text selection, rewrite works
- [ ] AI Assistant panel — insert into richtext field
- [ ] Undo/redo — keyboard shortcuts work
- [ ] Link — insert, edit, remove
- [ ] No `flushSync` console warnings
- [ ] Toolbar buttons reflect current formatting state (bold active when cursor in bold text)
- [ ] Content saved in v2 loads correctly in v3 editor
- [ ] Regression: existing content roundtrip (load → save → reload → unchanged)

## Implementation Steps

1. **Branch** — create `feat/tiptap-v3` branch
2. **Bump packages** — update all `@tiptap/*` to v3 in `packages/cms-admin/package.json`
3. **Install Floating UI** — `pnpm add @floating-ui/dom@^1.6.0 -F @webhouse/cms-admin`
4. **Fix BubbleMenu** — update `ai-bubble-menu.tsx` import and props
5. **Fix StarterKit** — rename `history` → `undoRedo`, disable Link + Underline
6. **Consolidate Table** — replace 4 table imports with single `@tiptap/extension-table`
7. **Verify getPos** — confirm all NodeViews handle `getPos()` returning undefined
8. **Test toolbar state** — verify `useEditorState` still drives toolbar reactivity
9. **Test all block types** — run through test plan
10. **Fix issues** — address any rendering/behavior differences
11. **Merge** — merge to main after all tests pass
12. **Follow-up: Static Renderer** — add `@tiptap/static-renderer` for server-side content rendering (separate PR)

## Dependencies

- None — this is an infrastructure upgrade with no feature dependencies.

## Effort Estimate

**Medium** — 1-2 days

- Day 1: Package bump, import fixes, BubbleMenu migration, basic testing
- Day 2: Full block-type testing, edge case fixes, Static Renderer exploration
