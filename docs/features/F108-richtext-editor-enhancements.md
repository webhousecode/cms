# F108 — Rich Text Editor Enhancements

> Underline, superscript/subscript, text alignment, highlight colors, editor zoom, and AI proofreading for the TipTap v3 richtext editor.

## Problem

The richtext editor has basic formatting (bold, italic, strike, code) but lacks several standard features that users expect from a modern content editor:

1. **No underline** — StarterKit v3 includes it but it's explicitly disabled
2. **No superscript/subscript** — needed for footnotes, chemical formulas, math
3. **No text alignment** — paragraphs can't be centered/right-aligned
4. **No highlight/background colors** — can't emphasize text with color
5. **No zoom** — editors working on long-form content can't adjust text size
6. **No proofreading** — AI can rewrite but can't check spelling/grammar across all languages

## Solution

Enable/add TipTap extensions for formatting, add toolbar buttons with reactive state tracking, implement editor zoom via CSS transform, and add an AI proofread action that auto-detects language and checks spelling/grammar/style.

### Markdown considerations

Standard markdown doesn't support underline, superscript, subscript, highlight, or text-align. Two approaches:
- **HTML-in-markdown**: Use `<u>`, `<sup>`, `<sub>`, `<mark>`, `<p style="text-align:center">` — supported by most markdown renderers
- **Custom serialization**: Add serialize/parse hooks to tiptap-markdown extension

We use **HTML-in-markdown** since tiptap-markdown already has `html: false` but our content is rendered via TipTap (admin) and marked/build.ts (static sites), both of which handle inline HTML.

## Technical Design

### 1. New TipTap Extensions

```bash
# Already in StarterKit v3 (just enable):
# - Underline

# Need to install:
pnpm add @tiptap/extension-superscript @tiptap/extension-subscript \
  @tiptap/extension-text-align @tiptap/extension-highlight \
  @tiptap/extension-color @tiptap/extension-text-style \
  -F @webhouse/cms-admin
```

### 2. Extension Configuration

```typescript
// In useEditor extensions array:
StarterKit.configure({
  link: false,
  // Remove: underline: false — let StarterKit enable it
}),
Superscript,
Subscript,
TextAlign.configure({ types: ["heading", "paragraph"] }),
TextStyle,
Highlight.configure({ multicolor: true }),
Color,
```

### 3. Toolbar Buttons

New buttons in the formatting section of the toolbar:

| Button | Feature key | Shortcut | Extension |
|--------|------------|----------|-----------|
| U̲ | `underline` | Cmd+U | StarterKit (built-in) |
| x² | `superscript` | Cmd+. | @tiptap/extension-superscript |
| x₂ | `subscript` | Cmd+, | @tiptap/extension-subscript |
| ≡← | `alignLeft` | — | @tiptap/extension-text-align |
| ≡↔ | `alignCenter` | — | @tiptap/extension-text-align |
| ≡→ | `alignRight` | — | @tiptap/extension-text-align |
| 🖍 | `highlight` | — | @tiptap/extension-highlight |

### 4. Highlight Color Picker

Small inline picker with 6 preset colors + clear:

```typescript
const HIGHLIGHT_COLORS = [
  { color: "#bbf7d0", label: "Green" },    // green-200
  { color: "#bfdbfe", label: "Blue" },     // blue-200
  { color: "#fde68a", label: "Yellow" },   // amber-200
  { color: "#fecaca", label: "Red" },      // red-200
  { color: "#e9d5ff", label: "Purple" },   // purple-200
  { color: "#fed7aa", label: "Orange" },   // orange-200
];
```

Rendered as a small dropdown from the highlight button with circular color swatches + a ⌀ (clear) button.

### 5. Editor Zoom

CSS-based zoom on the editor content area. State stored in component (not persisted — ephemeral per session).

```typescript
const [zoom, setZoom] = useState(100); // percentage

// Applied to editor wrapper
<div style={{ fontSize: `${zoom}%` }}>
  <EditorContent editor={editor} />
</div>
```

Toolbar: `[−] 100% [+]` — steps of 10%, range 50-200%.

### 6. AI Proofreading

New API endpoint + toolbar action. Auto-detects language, checks spelling/grammar/style, returns inline suggestions.

```typescript
// POST /api/cms/ai/proofread
// Body: { text: string }
// Response: { corrections: Correction[], language: string }

interface Correction {
  original: string;      // the problematic text
  suggestion: string;    // the corrected text
  reason: string;        // brief explanation
  from: number;          // character offset start
  to: number;            // character offset end
  type: "spelling" | "grammar" | "style";
}
```

The AI prompt instructs Claude to:
1. Auto-detect the language
2. Return ONLY actual errors (not style preferences)
3. Preserve the author's voice and tone
4. Return corrections as structured JSON

UI: button in toolbar opens a panel showing corrections. Each correction can be accepted (replaces text) or dismissed.

### 7. Toolbar State Tracking

Add to `useEditorState` selector:

```typescript
isUnderline: ctx.editor?.isActive("underline") ?? false,
isSuperscript: ctx.editor?.isActive("superscript") ?? false,
isSubscript: ctx.editor?.isActive("subscript") ?? false,
isHighlight: ctx.editor?.isActive("highlight") ?? false,
textAlign: (ctx.editor?.isActive({ textAlign: "center" }) ? "center"
  : ctx.editor?.isActive({ textAlign: "right" }) ? "right"
  : "left") as string,
```

### 8. Markdown Serialization

Enable `html: true` in tiptap-markdown config so inline HTML tags are preserved:

```typescript
Markdown.configure({ html: true, transformPastedText: true }),
```

This means `<u>`, `<sup>`, `<sub>`, `<mark>` tags survive the markdown round-trip.

For text-align, add custom paragraph serialization that adds `style="text-align:..."` when alignment is not left.

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/app/api/cms/ai/proofread/route.ts` — AI proofread endpoint

**Modified files:**
- `packages/cms-admin/package.json` — add 5 new @tiptap extension deps
- `packages/cms-admin/src/components/editor/rich-text-editor.tsx` — extensions, toolbar, state
- `packages/cms-admin/src/components/editor/editor-icons.tsx` — new icons
- `pnpm-lock.yaml` — lockfile

### Downstream dependents

`rich-text-editor.tsx` is imported by:
- `packages/cms-admin/src/components/editor/field-editor.tsx` (1 ref) — unaffected, props unchanged

`editor-icons.tsx` is imported by:
- `packages/cms-admin/src/components/editor/rich-text-editor.tsx` (1 ref) — being modified, coordinated

`package.json` — all workspace packages depend transitively, but only version bumps.

### Blast radius

- **Markdown format**: Enabling `html: true` in tiptap-markdown means existing content with HTML tags will be preserved instead of stripped. This is additive — no existing content breaks.
- **Build output**: `build.ts` uses `marked()` which handles inline HTML (`<u>`, `<sup>`, etc.) by default.
- **Toolbar layout**: Adding 7+ new buttons. May need overflow/wrapping for narrow screens.
- **Content portability**: Content using these features won't render correctly in plain markdown viewers (GitHub, etc.) — but that's expected for rich formatting.

### Breaking changes

None. All features are additive. Existing content and toolbar buttons are unchanged.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Underline: Cmd+U toggles, toolbar button reflects state
- [ ] Superscript: Cmd+. toggles, renders correctly
- [ ] Subscript: Cmd+, toggles, renders correctly
- [ ] Text align: left/center/right, persists across save
- [ ] Highlight: color picker shows, applies background color, persists
- [ ] Zoom: +/- buttons scale editor content, doesn't affect toolbar
- [ ] Proofread: detects language, shows corrections, accept/dismiss works
- [ ] Content roundtrip: all new formatting survives save → reload
- [ ] Existing content: documents without new formatting load correctly
- [ ] Playwright: `e2e/richtext-roundtrip.spec.ts` still passes (3/3)

## Implementation Steps

1. Install new TipTap extensions (`superscript`, `subscript`, `text-align`, `highlight`, `color`, `text-style`)
2. Enable underline in StarterKit config (remove `underline: false`)
3. Add extensions to `useEditor` config
4. Change tiptap-markdown to `html: true`
5. Add toolbar state tracking in `useEditorState` selector
6. Add icons to `editor-icons.tsx` (underline, superscript, subscript, align-left/center/right, highlight)
7. Add toolbar buttons for underline, superscript, subscript
8. Add text alignment button group (3 buttons)
9. Add highlight button with color picker dropdown
10. Add zoom controls (`[−] 100% [+]`) at far right of toolbar
11. Create `/api/cms/ai/proofread` endpoint
12. Add proofread button + corrections panel
13. Run tests, verify roundtrip
14. Commit + push

## Dependencies

- **F106 TipTap v3 Upgrade** — Done (prerequisite for new extension APIs)

## Effort Estimate

**Medium** — 1-2 days

- Day 1: Extensions, toolbar buttons, zoom, markdown config
- Day 2: Highlight color picker, AI proofreading endpoint + UI, testing
