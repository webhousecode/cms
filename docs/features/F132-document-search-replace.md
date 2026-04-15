# F132 — In-Document Search & Replace

> Cmd+F (find) and Cmd+Option+F (find + replace) scoped to the currently open document — works across ALL field types including rich text, without leaving the editor.

## Problem

When editing a long document, fixing a repeated typo, rename, or terminology change requires manually scanning every field, every rich-text block, every array item, every nested object. The browser's built-in Cmd+F finds text but can't edit it, and doesn't know about collapsed fields, TipTap's ProseMirror document, or array items rendered below the fold.

Editors working on site-wide terminology changes ("rename 'Vi' to 'Webhouse'", "replace 'clinic' with 'klinik'") currently have to jump field by field, re-reading each to make sure they caught every instance. Mistakes happen, and some fields hide content behind collapsed UI states.

This is a standard editor feature in every IDE, Google Docs, Notion, and Figma — CMS admin should have it too, **scoped to the current document**.

Note: This is distinct from **F66 Search Index** which is site-wide full-text search across all documents. F132 is in-document only — like Cmd+F inside a single Word file.

## Solution

A dockable search bar that slides down from the top of the document editor when the user presses **Cmd+F** (find) or **Cmd+Option+F** (find + replace). It walks the document's `data` object recursively, collects every string value + its JSON path, and highlights matches inline in the appropriate field renderer.

For plain fields (text, textarea, number) it uses a shared highlight overlay. For TipTap rich-text it uses `@tiptap/extension-search-and-replace` (or a custom ProseMirror decoration). For array/object/blocks it expands collapsed sections when a match is inside.

Replacement applies to the form's in-memory state — it does NOT auto-save. The editor's existing dirty-tracking marks the doc as modified so Save Changes / autosave picks it up.

## Technical Design

### 1. Field Value Walker

Shared utility that extracts all searchable string values from a document's data object with their path.

```typescript
// packages/cms-admin/src/lib/search-replace/walker.ts

export interface SearchableValue {
  /** JSON pointer path, e.g. ["title"], ["sections", 2, "body"], ["blocks", 0, "data", "text"] */
  path: (string | number)[];
  /** Current string value */
  value: string;
  /** Field type from schema — "text" | "textarea" | "richtext" | "code" | etc. */
  fieldType?: FieldType;
  /** True if value is HTML/ProseMirror JSON that needs special handling */
  isRichContent: boolean;
}

export function walkSearchableValues(
  data: Record<string, unknown>,
  fields: FieldConfig[],
): SearchableValue[];

export function getValueAtPath(data: unknown, path: (string | number)[]): unknown;
export function setValueAtPath(data: unknown, path: (string | number)[], value: unknown): unknown;
```

The walker respects field schema — for `richtext` fields it knows the value is HTML (filesystem) or ProseMirror JSON (depending on adapter), not a plain string, and dispatches to the right match extractor.

### 2. Match Finder

```typescript
// packages/cms-admin/src/lib/search-replace/matcher.ts

export interface SearchOptions {
  query: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export interface MatchLocation {
  path: (string | number)[];
  fieldType?: FieldType;
  /** Character offset within the string value */
  offset: number;
  length: number;
  /** Snippet with match in context (for results list) */
  preview: string;
}

export function findMatches(
  data: Record<string, unknown>,
  fields: FieldConfig[],
  options: SearchOptions,
): MatchLocation[];

export function replaceMatch(
  data: Record<string, unknown>,
  match: MatchLocation,
  replacement: string,
): Record<string, unknown>;

export function replaceAll(
  data: Record<string, unknown>,
  fields: FieldConfig[],
  options: SearchOptions,
  replacement: string,
): { data: Record<string, unknown>; count: number };
```

For `richtext` fields, the matcher walks the ProseMirror document node tree or parses HTML with a DOMParser (never string-matches raw HTML, which would break tags).

### 3. Search Bar UI

```typescript
// packages/cms-admin/src/components/editor/search-replace-bar.tsx

interface Props {
  data: Record<string, unknown>;
  fields: FieldConfig[];
  onReplace: (updatedData: Record<string, unknown>) => void;
  onClose: () => void;
  mode: "find" | "replace";
  /** Ref to the editor form so we can scroll matches into view */
  editorRef: React.RefObject<HTMLElement>;
}
```

Rendered as a sticky bar below the action bar, above the form fields.

Layout:

```
┌────────────────────────────────────────────────────────────────┐
│ [🔍 query_______________]  3 of 12  [↑] [↓]  [Aa] [Wd] [.*]  [✕]│
│ [↻ replace____________]    [Replace] [Replace all]              │
└────────────────────────────────────────────────────────────────┘
```

- Arrow buttons cycle through matches with scroll-into-view + inline highlight
- Aa = case sensitive, Wd = whole word, .* = regex
- ✕ closes the bar (also Esc)
- Replace applies to current match, Replace all applies to all

### 4. Match Highlighting

Per field type:

| Field type | Highlight strategy |
|-----------|-------------------|
| `text`, `number`, `date` | Overlay div positioned over the input, using `<mark>` on the current match |
| `textarea`, `htmldoc` | Same overlay technique, synced scroll |
| `richtext` (TipTap) | TipTap's `@tiptap/extension-search-and-replace` OR custom ProseMirror decoration plugin that adds `class="cms-search-match"` |
| `array`, `object`, `blocks` | Auto-expand collapsed sections on navigation; highlight leaf fields as above |
| `code` (Monaco-based editors, if any) | Use Monaco's built-in Find API via editor instance |
| `image`, `file`, `boolean`, `relation` | Not searchable — skipped |
| `select`, `tags` | Match against option labels, not the selected value set |
| `map` | Match against embedded description/location text only |

### 5. Document Editor Integration

`document-editor.tsx` gets:

1. A ref to the form container
2. Global keyboard shortcut listener for Cmd+F / Cmd+Option+F (only when an input inside the editor is NOT focused, or when the editor root is focused — avoids hijacking browser Cmd+F when user is in a non-searchable element)
3. State `{ searchOpen: boolean; searchMode: "find" | "replace" }`
4. Renders `<SearchReplaceBar>` when open
5. Passes its form data + fields to the bar
6. When bar calls `onReplace(updatedData)`, editor calls its existing `handleChange(data)` which marks dirty + triggers autosave

### 6. Rich Text Integration

For `RichTextEditor` component, add imperative handle:

```typescript
export interface RichTextEditorHandle {
  /** Highlight matches in the ProseMirror document */
  setSearchQuery(query: string, options: SearchOptions): number; // returns match count
  /** Navigate to Nth match (scrolls and focuses it) */
  goToMatch(index: number): void;
  /** Replace current match with text */
  replaceCurrent(replacement: string): void;
  /** Replace all matches with text */
  replaceAll(replacement: string): number;
  /** Clear search decorations */
  clearSearch(): void;
}
```

Use `@tiptap/extension-search-and-replace` (community, MIT, 1.3k weekly downloads) — adds the plugin at editor init time. When the search bar is open, it calls the handle on every keystroke.

### 7. Array/Object/Blocks Auto-Expand

Field renderers for `array`, `object`, `blocks` have collapsed states. Add a `focusPath` prop that the editor passes down — when it changes to a path inside the field, the renderer auto-expands and scrolls to the item.

## Impact Analysis

### Files created (new)
- `packages/cms-admin/src/lib/search-replace/walker.ts` — value extraction + path navigation
- `packages/cms-admin/src/lib/search-replace/matcher.ts` — find + replace logic
- `packages/cms-admin/src/lib/search-replace/__tests__/walker.test.ts`
- `packages/cms-admin/src/lib/search-replace/__tests__/matcher.test.ts`
- `packages/cms-admin/src/components/editor/search-replace-bar.tsx` — UI
- `packages/cms-admin/src/components/editor/search-replace-context.tsx` — shared state context for field renderers to read current match path

### Files modified
- `packages/cms-admin/src/components/editor/document-editor.tsx` — mount search bar, wire keyboard shortcut, pass focusPath to field renderers
- `packages/cms-admin/src/components/editor/rich-text-editor.tsx` — add search extension, expose imperative handle
- `packages/cms-admin/src/components/editor/field-editor.tsx` — pass focusPath through to children; auto-expand array/object/blocks
- `packages/cms-admin/package.json` — add `@tiptap/extension-search-and-replace`

### Downstream dependents for modified files

**`document-editor.tsx`** is imported by 1 file (1 ref):
- `app/admin/(workspace)/[collection]/[slug]/page.tsx` — unaffected, only uses `<DocumentEditor>` component

**`rich-text-editor.tsx`** is imported by 1 file (1 ref):
- `components/editor/field-editor.tsx` — unaffected, will gain optional `searchRef` prop that it can pass through

**`field-editor.tsx`** is imported by ~15 files (form components that render individual fields). All existing consumers pass through props; new `focusPath` prop is optional and additive — no breaking changes.

### Blast radius
- New keyboard shortcut Cmd+F when focus is in the document editor — could surprise users expecting native browser search. Mitigated by showing the bar immediately (clear UX) and leaving Cmd+F native when focus is outside the editor.
- TipTap extension adds ~12KB to the editor bundle.
- Rich-text fields currently render without a search context; adding the extension should not affect existing save/load paths but needs manual verification that cursor position, undo history, and paste behavior are unchanged.
- Auto-expanding array/object/blocks on match-navigation must not mark the document dirty (expanding is a UI-only operation).

### Breaking changes
None. All changes are additive:
- New keyboard shortcut only active when editor is focused
- New optional prop `focusPath` on field renderers
- New optional `searchRef` on RichTextEditor
- No storage format change, no API change

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Unit: walker extracts all string values from a nested doc (array + object + richtext)
- [ ] Unit: matcher finds case-sensitive, whole-word, regex matches correctly
- [ ] Unit: replaceAll produces correct updated data without mutating input
- [ ] Unit: richtext matcher walks ProseMirror JSON without breaking HTML tags
- [ ] Manual: Cmd+F opens bar in document editor, Esc closes, arrows cycle matches
- [ ] Manual: Cmd+Option+F opens with replace input, Replace replaces current, Replace all replaces all
- [ ] Manual: Match inside collapsed array item auto-expands the item
- [ ] Manual: Match inside richtext highlights in-place with correct position after scroll
- [ ] Manual: Replace marks document dirty, Save button enables
- [ ] Manual: Undo (Ctrl+Z) in richtext undoes replace correctly
- [ ] Regression: Autosave works as before after a replace
- [ ] Regression: Existing Cmd+F behavior unchanged outside the editor
- [ ] Regression: Rich-text paste, undo, selection work unchanged with extension loaded
- [ ] Regression: No dirty state from opening/closing the bar without replacing

## Implementation Steps

1. Create `walker.ts` with `walkSearchableValues()` + path utilities + unit tests
2. Create `matcher.ts` with `findMatches()`, `replaceMatch()`, `replaceAll()` + unit tests
3. Build `SearchReplaceBar` component with query/replace inputs, nav buttons, toggles
4. Wire keyboard shortcut + mount in `document-editor.tsx` (start with plain text fields only)
5. Add match highlighting overlay for text/textarea fields
6. Add `@tiptap/extension-search-and-replace`, expose imperative handle on `RichTextEditor`
7. Integrate rich text handle with search bar — findMatches becomes the union of plain + richtext matches
8. Add `focusPath` prop to field-editor → auto-expand array/object/blocks when match is inside
9. Handle edge cases: select/tags option labels, map description text
10. Polish: match counter, empty state, regex error display, preserve search state across field blur
11. Docs article + screenshot

## Dependencies

None — purely additive. Uses existing document editor, field system, and TipTap editor.

Optional synergy with F66 Search Index (site-wide search) later: the bar could have a "Search in all documents" toggle that delegates to F66's endpoint, but that's a separate feature.

## Effort Estimate

**Medium** — 3-4 days

- Day 1: walker + matcher + tests
- Day 2: Search bar UI + plain field highlighting + keyboard shortcut
- Day 3: Rich-text integration (TipTap extension + imperative handle)
- Day 4: Array/object/blocks auto-expand, polish, edge cases, docs

---

> **Testing (F99):** This feature MUST include tests using the F99 Test Infrastructure. Unit tests for walker and matcher are pure logic — no fixtures needed. Manual browser verification is required for the UI integration (keyboard, scroll, highlight positioning) since those aren't meaningfully automatable.

> **Chat integration (F107):** Add optional `find_in_document` and `replace_in_document` chat tools so AI can assist with bulk rename ("replace every 'clinic' with 'klinik' in this document") — thin wrappers over matcher/replaceAll keyed to the document currently open in the chat's context.
