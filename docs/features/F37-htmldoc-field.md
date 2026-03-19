# F37 — HTML Document Field Type (`htmldoc`)

> A new field type for interactive HTML documents — rendered in sandboxed iframe with visual inline editing, AI edit mode, and code view. For infographics, presentations, and rich interactive content that can't be expressed in markdown.

## Problem

The CMS has `richtext` (markdown/prose) and `blocks` (structured sections), but neither can handle full interactive HTML documents — infographics with Chart.js, presentations with animations, interactive simulations, or any content that is fundamentally a self-contained HTML page. Today these are either:
- Crammed into richtext fields where they display as raw HTML tags
- Stored externally with no CMS management
- Impossible to edit visually without a code editor

## Solution

A new `htmldoc` field type that stores a complete HTML document as a string. In the admin editor, it renders in a sandboxed iframe with three editing modes:

1. **Preview** — live render of the HTML document
2. **Visual Edit** — inline contentEditable injected into the iframe (Pitch Vault pattern), floating toolbar for text formatting
3. **AI Edit** — chat interface that sends the HTML to AI with modification instructions, receives updated HTML
4. **Code** — syntax-highlighted textarea for direct HTML editing

The pattern is proven — WebHouse's Pitch Vault app uses this exact approach for editing HTML presentations.

## Technical Design

### Field Type Registration

```typescript
// packages/cms/src/schema/types.ts
export type FieldType =
  | 'text' | 'textarea' | 'richtext' | ... | 'audio'
  | 'htmldoc';  // NEW

// In cms.config.ts:
{ name: 'infographic', type: 'htmldoc', label: 'Interactive Infographic' }
```

### Storage

HTML documents are stored as strings in the document's `data` field, same as richtext. For large documents, the string can be substantial (50-200KB) but this is within JSON limits for all storage adapters.

```json
{
  "data": {
    "title": "Three-Lane AI Highway",
    "infographic": "<!DOCTYPE html>\n<html>..."
  }
}
```

### Admin Editor Component

```typescript
// packages/cms-admin/src/components/editor/htmldoc-editor.tsx

interface Props {
  value: string;        // HTML document string
  onChange: (html: string) => void;
  locked?: boolean;
  field: FieldConfig;
}

type EditMode = 'preview' | 'visual' | 'ai' | 'code';
```

### Mode 1: Preview (default)

```
┌─────────────────────────────────────────┐
│ [Preview] [Visual Edit] [AI] [Code]     │
├─────────────────────────────────────────┤
│                                         │
│   ┌─────────────────────────────────┐   │
│   │                                 │   │
│   │   (sandboxed iframe)            │   │
│   │   Live render of HTML           │   │
│   │                                 │   │
│   └─────────────────────────────────┘   │
│                                         │
│ [Upload HTML file]  [Expand fullscreen] │
└─────────────────────────────────────────┘
```

- Sandboxed iframe: `sandbox="allow-scripts allow-same-origin"`
- Uses `srcdoc` attribute with the HTML string
- Responsive container with aspect ratio or auto-height
- Upload button accepts `.html` files and reads them as text
- Fullscreen toggle for better preview

### Mode 2: Visual Edit

Injects a WYSIWYG script into the HTML before setting `srcdoc`. The script (adapted from Pitch Vault's `wysiwyg-inject.ts`):

- Makes semantic text elements (`h1-h6, p, li, td, th, blockquote, figcaption`) contentEditable on click
- Shows floating toolbar with B/I/U, font size, color picker, emoji
- Hover highlights editable elements with dashed border
- ESC or click-outside deactivates editing
- `postMessage` API for save: parent sends `{ type: 'getHtml' }`, iframe responds with `{ type: 'htmlContent', html: '...' }` after stripping injected elements

```typescript
// packages/cms-admin/src/lib/wysiwyg-inject.ts
// Adapted from /Users/cb/Apps/cbroberg/pitch/lib/wysiwyg-inject.ts
// Styled with CMS admin design (--border, --card, --primary CSS vars)

export function injectWysiwyg(html: string): string;
export const WYSIWYG_SCRIPT: string;
```

### Mode 3: AI Edit

Chat interface that modifies HTML via AI:

```
┌─────────────────────────────────────────┐
│ [Preview] [Visual Edit] [AI] [Code]     │
├───────────────────────┬─────────────────┤
│                       │ AI Chat         │
│   (iframe preview)    │                 │
│                       │ "Make the hero  │
│                       │  section use    │
│                       │  a dark blue    │
│                       │  gradient"      │
│                       │                 │
│                       │ [Send]          │
├───────────────────────┴─────────────────┤
│ [Apply] [Revert]                        │
└─────────────────────────────────────────┘
```

- Split view: iframe preview (left) + chat (right)
- **Reuses the existing AI chat component** from Brand Voice interview / AI Panel — same generic chat interface, just with a different system prompt. No new chat UI. Update the shared component once, improvements apply everywhere.
- Prompt template: system context sets "you are editing an HTML document", user message is the modification instruction, response is complete HTML
- Preview updates live as AI responds
- Apply/Revert buttons to commit or discard changes

### Mode 4: Code View

```
┌─────────────────────────────────────────┐
│ [Preview] [Visual Edit] [AI] [Code]     │
├─────────────────────────────────────────┤
│                                         │
│   <textarea                             │
│     class="font-mono text-xs"           │
│     spellCheck={false}                  │
│   >                                     │
│     <!DOCTYPE html>                     │
│     <html>                              │
│       <head>...</head>                  │
│       <body>...</body>                  │
│     </html>                             │
│   </textarea>                           │
│                                         │
└─────────────────────────────────────────┘
```

- Monospace textarea with syntax highlighting (via CSS, not Monaco)
- Line numbers
- Full HTML editing
- Changes apply on blur or via debounce

### Upload Flow

When the field is empty, show a prominent upload area:

```
┌─────────────────────────────────────────┐
│                                         │
│   Drop HTML file here or click to       │
│   upload                                │
│                                         │
│   Or paste HTML below:                  │
│   ┌─────────────────────────────────┐   │
│   │                                 │   │
│   └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### Relation to Interactive Islands (Phase 6.4)

`htmldoc` is the first concrete implementation of the Islands concept from CMS-ENGINE.md. An htmldoc field stores a self-contained interactive HTML page that:
- Renders independently (has its own CSS/JS)
- Can be embedded in a page via iframe
- Can be managed through the CMS admin
- Can be AI-generated or AI-modified

Future evolution: htmldoc blocks in the block editor, allowing pages composed of static CMS content + embedded interactive islands.

## Impact Analysis

### Files affected
- `packages/cms/src/schema/types.ts` — add `htmldoc` to `FieldType` union + Zod validation
- `packages/cms-admin/src/lib/wysiwyg-inject.ts` — new WYSIWYG injection module
- `packages/cms-admin/src/components/editor/htmldoc-editor.tsx` — new editor component
- `packages/cms-admin/src/components/editor/field-editor.tsx` — add `case 'htmldoc'` routing

### Blast radius
- `FieldType` union change affects all field type checks, Zod validation, and admin editor routing
- `field-editor.tsx` is the central field routing component — must not break existing types

### Breaking changes
- `FieldType` gains `'htmldoc'` value — existing code using exhaustive switch must add case

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Preview mode renders HTML in sandboxed iframe
- [ ] Visual edit injects WYSIWYG and saves via postMessage
- [ ] AI edit mode modifies HTML via chat
- [ ] Code view allows direct HTML editing
- [ ] Upload dropzone accepts .html files

## Implementation Steps

1. Add `'htmldoc'` to `FieldType` union in `types.ts` and Zod validation
2. Create `packages/cms-admin/src/lib/wysiwyg-inject.ts` — adapted from Pitch Vault, styled with CMS CSS vars
3. Create `packages/cms-admin/src/components/editor/htmldoc-editor.tsx`:
   - Mode tabs (Preview/Visual/AI/Code)
   - Preview: sandboxed iframe with srcdoc
   - Visual: iframe with injected WYSIWYG + postMessage save
   - AI: split view with chat panel + iframe preview
   - Code: monospace textarea
   - Upload dropzone for empty state
   - Fullscreen toggle
4. Add `case 'htmldoc'` to `field-editor.tsx` routing
5. Build the CMS package with new field type
6. Update CLAUDE.md with htmldoc documentation
7. Test with SproutLake infographics — update infographic collection to use `htmldoc` for the interactive HTML content

## Dependencies

- None — all infrastructure exists. Reuses existing AI panel pattern, upload API, and field editor architecture.
- Reference implementation: Pitch Vault at `/Users/cb/Apps/cbroberg/pitch`

## Effort Estimate

**Large** — 5-6 days (wysiwyg injection 1d, editor component 2d, AI edit mode 1d, testing/polish 1-2d)
