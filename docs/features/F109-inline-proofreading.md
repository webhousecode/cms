# F109 — Inline Proofreading

> TipTap-native inline spelling/grammar corrections with strikethrough + green replacement, accept/reject per correction, and navigation between issues.

## Problem

F108 added AI proofreading but displays results in a toast notification. The user must mentally map "original → suggestion" and manually find/replace text. Professional editors (Google Docs, Word, Grammarly, TipTap Pro) show corrections **inline** — directly in the text with visual markers (strikethrough for errors, colored text for suggestions). This is the expected UX for proofreading.

## Solution

Use ProseMirror Decorations to render inline correction markers directly in the editor content. Each correction shows the original text with strikethrough and the suggested replacement in green. A floating toolbar at the bottom of the editor provides navigation (← 1/9 →), accept/reject per correction, and accept all/reject all. The existing `/api/cms/ai/proofread` endpoint is reused — only the frontend changes.

## Technical Design

### 1. Correction Data Flow

```
User clicks Proofread → API returns corrections with character offsets
→ Map offsets to ProseMirror positions → Create Decoration widgets
→ Render inline: ~~original~~ suggestion → User accepts/rejects
→ On accept: replace text in document → Remove decoration
→ On reject: remove decoration (keep original text)
```

### 2. Enhanced API Response

Update `/api/cms/ai/proofread` to return character offsets for each correction:

```typescript
interface ProofreadCorrection {
  original: string;
  suggestion: string;
  reason: string;
  type: "spelling" | "grammar" | "style";
  offset: number;    // character offset in plain text
  length: number;    // length of original text
}
```

### 3. ProseMirror Plugin — ProofreadPlugin

A TipTap Extension that manages correction decorations:

```typescript
// packages/cms-admin/src/components/editor/proofread-plugin.ts

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

export interface ProofreadMatch {
  id: string;
  from: number;          // ProseMirror position
  to: number;            // ProseMirror position
  original: string;
  suggestion: string;
  reason: string;
  type: "spelling" | "grammar" | "style";
}

const proofreadKey = new PluginKey("proofread");

export const ProofreadPlugin = Extension.create({
  name: "proofread",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: proofreadKey,
        state: {
          init: () => ({ matches: [] as ProofreadMatch[], decorations: DecorationSet.empty }),
          apply(tr, prev) {
            const meta = tr.getMeta(proofreadKey);
            if (meta?.type === "set") {
              // Create decorations from matches
              const decorations = meta.matches.map((m: ProofreadMatch) =>
                Decoration.inline(m.from, m.to, {
                  class: "proofread-error",
                  "data-proofread-id": m.id,
                })
              );
              return { matches: meta.matches, decorations: DecorationSet.create(tr.doc, decorations) };
            }
            if (meta?.type === "remove") {
              const matches = prev.matches.filter((m: ProofreadMatch) => m.id !== meta.id);
              const decorations = DecorationSet.create(tr.doc,
                matches.map((m: ProofreadMatch) =>
                  Decoration.inline(m.from, m.to, { class: "proofread-error", "data-proofread-id": m.id })
                )
              );
              return { matches, decorations };
            }
            if (meta?.type === "clear") {
              return { matches: [], decorations: DecorationSet.empty };
            }
            // Map decorations through document changes
            return { ...prev, decorations: prev.decorations.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
```

### 4. Offset Mapping — Text to ProseMirror Positions

The AI returns character offsets in plain text. We need to map these to ProseMirror positions (which include node boundaries):

```typescript
function textOffsetToPos(doc: Node, textOffset: number): number {
  let charCount = 0;
  let result = 0;
  doc.descendants((node, pos) => {
    if (result) return false; // already found
    if (node.isText) {
      if (charCount + node.nodeSize > textOffset) {
        result = pos + (textOffset - charCount);
        return false;
      }
      charCount += node.nodeSize;
    } else if (node.isBlock && charCount > 0) {
      charCount += 1; // newline between blocks
    }
  });
  return result;
}
```

### 5. Inline Correction CSS

```css
/* Strikethrough on original text */
.proofread-error {
  text-decoration: line-through;
  text-decoration-color: rgba(248, 113, 113, 0.7);
  background: rgba(248, 113, 113, 0.08);
  border-radius: 2px;
  cursor: pointer;
  position: relative;
}

/* Green suggestion shown via ::after or widget decoration */
.proofread-suggestion {
  color: #4ade80;
  font-weight: 500;
  cursor: pointer;
}

/* Active/selected correction */
.proofread-error.active {
  background: rgba(248, 113, 113, 0.2);
  outline: 2px solid rgba(248, 113, 113, 0.4);
  outline-offset: 1px;
}
```

### 6. Correction Toolbar — Bottom Bar

A fixed bar at the bottom of the editor (inside the RTE component, not a toast):

```
┌────────────────────────────────────────────────────────────────┐
│  Reject all   Accept all   ← 1 / 9 →   ✕ Reject  ✓ Accept  ✕ │
└────────────────────────────────────────────────────────────────┘
```

- **← →** Navigate between corrections (scrolls editor to show each one)
- **Accept** — replaces original with suggestion, removes decoration
- **Reject** — keeps original, removes decoration
- **Accept all** — applies all remaining corrections
- **Reject all** — dismisses all corrections
- **✕** — closes the proofread mode entirely

### 7. Integration with Existing Proofread Button

The existing toolbar Proofread button (F108) triggers the flow:
1. Calls `/api/cms/ai/proofread`
2. Maps corrections to ProseMirror positions
3. Dispatches `set` meta to the ProofreadPlugin
4. Shows the correction toolbar
5. First correction is auto-selected

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/components/editor/proofread-plugin.ts` — ProseMirror plugin + extension

**Modified files:**
- `packages/cms-admin/src/components/editor/rich-text-editor.tsx` — add ProofreadPlugin to extensions, replace toast-based proofread with inline UI, add correction toolbar
- `packages/cms-admin/src/app/api/cms/ai/proofread/route.ts` — add offset/length to response
- `packages/cms-admin/src/app/globals.css` — proofread decoration styles

### Downstream dependents

`rich-text-editor.tsx` is imported by:
- `packages/cms-admin/src/components/editor/field-editor.tsx` (1 ref) — unaffected, props unchanged

`globals.css` — global stylesheet, no imports. Adding classes is additive.

`proofread/route.ts` — called via fetch only, no imports. Adding fields is backwards compatible.

### Blast radius

- **Editor content**: Decorations are non-destructive — they don't modify the document. Accept/reject uses standard editor commands (replaceRange).
- **Existing proofread button**: Replaced from toast-based to inline. The button itself stays the same.
- **Performance**: Decorations are lightweight. Even 50+ corrections should render without jank.
- **Content safety**: Reject = no change. Accept = explicit user action. No automatic text modification.

### Breaking changes

None. The API gains new fields (offset, length) but existing fields are unchanged. The toolbar button behavior changes from toast to inline, but this is a UX improvement, not a breaking API change.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Proofread button shows inline corrections in the editor
- [ ] Corrections show strikethrough on original + green suggestion
- [ ] ← → navigation scrolls to each correction
- [ ] Accept replaces text and removes decoration
- [ ] Reject removes decoration without changing text
- [ ] Accept all applies all corrections
- [ ] Reject all dismisses all corrections
- [ ] ✕ closes proofread mode
- [ ] Corrections survive undo (Cmd+Z undoes accepted corrections)
- [ ] Playwright roundtrip tests still pass (3/3)
- [ ] Existing toolbar buttons unaffected

## Implementation Steps

1. Update `/api/cms/ai/proofread` to return offset + length per correction
2. Create `proofread-plugin.ts` with ProseMirror Decoration plugin
3. Add `textOffsetToPos()` mapping function
4. Add ProofreadPlugin to useEditor extensions
5. Replace toast-based proofread handler with inline decoration flow
6. Build correction toolbar component (bottom bar)
7. Implement accept/reject/navigate actions
8. Add CSS for strikethrough + green suggestion styling
9. Test full flow with multi-language content
10. Run Playwright tests

## Dependencies

- **F108 Rich Text Editor Enhancements** (Done) — provides the Proofread button and API endpoint

## Effort Estimate

**Medium** — 2-3 days

- Day 1: Plugin architecture, offset mapping, decoration rendering
- Day 2: Correction toolbar, accept/reject/navigate actions
- Day 3: Polish, edge cases (corrections spanning nodes), testing
