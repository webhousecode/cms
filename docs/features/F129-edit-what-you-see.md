# F129 — Edit What You See (Visual Inline Editing)

> **Status:** Tier 1
> **Created:** 2026-04-09
> **Updated:** 2026-04-10 — merged with Pitch Vault inline editing research + framework consumer strategy
> **Applies to:** cms (build.ts), cms-admin (preview + editor), cms-mobile (FAB)

## Summary

Two complementary editing modes that transform preview from "nice to look at" into the **primary editing interface**:

1. **Edit FAB** — tap a pencil button while previewing → jump to the JSON editor for that exact page. One-tap browser-to-editor. Works on any site (static, Next.js, Go, .NET, anything).

2. **Visual Inline Editing** — click directly on text in the rendered page and edit it in-place with `contenteditable`. Changes flow back to the JSON content file. No more switching between preview and editor. Inspired by and ported from the [Pitch Vault](file:///Users/cb/Apps/cbroberg/pitch) WYSIWYG system.

No other CMS has both of these. Together they eliminate the "edit JSON, rebuild, check preview, go back, edit again" cycle entirely.

## Prior Art: Pitch Vault

`/Users/cb/Apps/cbroberg/pitch` implements a production-grade inline editing system:

- **~550-line vanilla JS** script (`lib/wysiwyg-inject.ts`) injected into an iframe
- Targets all text elements (`h1-h6, p, li, td, figcaption, ...`) via semantic selectors
- Click → `contenteditable="true"` + blue border + floating toolbar (bold/italic/font-size/color/emoji)
- Edits tracked by **DOM path** (`BODY:0/MAIN:0/DIV:3/P:1`) — no special markup required
- Save: edits applied to a clean copy of the original HTML, sent via `postMessage` to parent
- Parent writes the full HTML file to disk

**Key insight from Pitch Vault:** The system works with *any* HTML because it uses DOM structure, not data-attributes. This makes it the perfect fallback for sites where we don't control the rendering (Next.js, Go, .NET, etc.).

## Two Strategies for Two Worlds

### Strategy A — Data-Attribute Injection (build.ts sites)

For sites built by `cms build`, we control the rendering pipeline. We can emit `data-cms-*` attributes that create a **deterministic, field-level** mapping between DOM elements and JSON content fields.

```html
<!-- build.ts output in visual-edit mode -->
<h1 data-cms-collection="posts" data-cms-slug="my-post" data-cms-field="title">
  Developer-First CMS Bygget på 30 års erfaring
</h1>
<p data-cms-collection="posts" data-cms-slug="my-post" data-cms-field="excerpt">
  @webhouse/cms løser de problemer, der ødelægger traditionelle CMS'er...
</p>
<span data-cms-collection="stats" data-cms-slug="overview" data-cms-field="productionSites">
  1.000+
</span>
```

**Advantages:**
- Deterministic — no guessing, no AI, no ambiguity
- Field-level granularity — save individual fields, not the whole HTML
- Type-aware — CMS knows the field type (text vs richtext vs number) and can adapt the editor
- Works with any template structure — attributes survive minification, reordering, nesting

**Save flow:**
1. User edits text in the iframe
2. `wysiwyg-inject.ts` reads `data-cms-*` attributes from the edited element
3. Sends `{ type: 'wh-visual-edit', collection, slug, field, value }` via `postMessage`
4. Parent calls `PATCH /api/cms/<collection>/<slug>` with `{ [field]: value }`
5. JSON content file updated
6. Incremental rebuild of that one page (or instant revalidation for Next.js)
7. Preview refreshes

### Strategy B — DOM-Path Mapping (framework consumer sites)

For the 13 framework consumers (`examples/consumers/`) and any Next.js/Astro/SvelteKit site that renders CMS content with its own templates, we **don't** control the HTML output. We can't inject data-attributes at build time.

Here we use the Pitch Vault approach: edit by DOM path, then map edits back to JSON fields using content matching.

**Resolution algorithm:**
1. User edits text at DOM path `BODY:0/MAIN:0/ARTICLE:0/H1:0`
2. Original text: "Developer-First CMS Bygget på 30 års erfaring"
3. New text: "Developer-First CMS Bygget på 35 års erfaring"
4. CMS searches all documents in the resolved collection for a field whose current value matches the original text
5. Match found: `posts/my-post.json` → `data.title`
6. Save the new value to that field

**Fallback when content matching fails:**
- Multiple documents have the same text → ambiguous → show a picker
- No match found → offer to save as a raw HTML override (stored separately, applied as a post-build patch)
- AI-assisted: send the surrounding HTML context + all candidate fields to Claude → "which field is this?" → high confidence match

**This strategy works for:**
- Next.js sites (`examples/consumers/nextjs-blog`)
- Go/Gin, .NET/Razor, Ruby/Rails, Java/Spring, etc.
- Any HTML page served through the preview proxy
- Externally hosted sites accessed via live URL preview

### Strategy C — Hybrid (automatic selection)

The system auto-detects which strategy to use:

```
if (element.hasAttribute('data-cms-field'))
  → Strategy A (deterministic field save)
else
  → Strategy B (DOM path + content matching)
```

Build.ts sites get A by default. Framework sites get B. Sites that use `{{form:name}}` shortcodes get A for the form, B for the rest. Zero configuration.

## Technical Design

### 1. Visual Editor Script (`visual-edit-inject.ts`)

Ported from Pitch Vault's `wysiwyg-inject.ts`, adapted for CMS:

```typescript
// packages/cms/src/visual-edit/inject.ts (~600 lines, vanilla JS, zero deps)

// Differences from Pitch Vault:
// - Reads data-cms-* attributes for Strategy A (deterministic save)
// - Falls back to DOM-path tracking for Strategy B
// - postMessage protocol includes collection/slug/field when available
// - Toolbar adapted: removes emoji picker, adds "Open in editor" button
// - Gold brand color (#F7BB2E) instead of Pitch Vault's blue
// - ESC deactivates, Cmd+S triggers save
```

**Editable element detection:**
- Strategy A: `[data-cms-field]` → all elements with the attribute
- Strategy B: `h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, figcaption, [data-cms-editable]`
- Skip: `nav, header, footer, script, style, svg, img, video, iframe` (non-text)

**Visual feedback (brand-consistent):**
- Hover: subtle gold outline (`1px dashed #F7BB2E40`)
- Active: solid gold border (`2px solid #F7BB2E`) + slight elevation shadow
- Floating toolbar: dark theme matching CMS admin (#0D0D0D bg, gold accents)

**postMessage protocol:**
```typescript
// Strategy A — deterministic
{ type: 'wh-visual-edit', collection: 'posts', slug: 'my-post', field: 'title', value: 'New title', strategy: 'attribute' }

// Strategy B — content-matched
{ type: 'wh-visual-edit', path: 'BODY:0/MAIN:0/H1:0', originalText: 'Old title', value: 'New title', strategy: 'content-match' }

// URL tracking (from original F129)
{ type: 'wh-preview-url', url: '/blog/my-post' }
```

### 2. Build.ts Edit Mode

`packages/cms/src/build/render.ts` gains an `editMode` option:

```typescript
export function renderDocument(doc, context, opts?: { editMode?: boolean }) {
  const attr = opts?.editMode
    ? ` data-cms-collection="${doc.collection}" data-cms-slug="${doc.slug}"`
    : '';

  // Each field render wraps output with data-cms-field:
  const title = opts?.editMode
    ? `<h1${attr} data-cms-field="title">${esc(doc.data.title)}</h1>`
    : `<h1>${esc(doc.data.title)}</h1>`;
  // ... same for excerpt, content, date, etc.
}
```

Build pipeline gets a new flag:
```bash
# Normal build (no edit attributes)
cms build

# Edit-mode build (with data-cms-* attributes, used by admin preview)
cms build --edit-mode
```

Admin's `preview-serve` route builds with `editMode: true` when visual editing is active.

### 3. URL → Document Resolver

```
GET /api/admin/content/resolve?path=/blog/my-post

Response: { collection: "posts", slug: "cms-chronicle-13" }
```

**Algorithm:**
1. Load collections with `urlPrefix` from cms.config.ts
2. Match `path` against each collection's `urlPrefix + "/" + slug` pattern
3. Handle `urlPattern` (e.g. `/:category/:slug`) for category-based URLs
4. Handle locale prefixes (`/da/blog/...`)
5. Verify slug exists in content
6. Return first match or 404

**Client-side version** for desktop (no API call):
```typescript
function resolvePathToDocument(path: string, collections: CollectionConfig[]): { collection: string; slug: string } | null
```

### 4. Admin Preview Integration

**Visual Edit toggle** in the preview panel header:

```
[ Preview URL: https://webhouse.dk/blog/... ]  [ 👁 View ] [ ✏️ Edit ]  [ ↗ Open ]
```

- **View mode** (default): iframe shows the site normally
- **Edit mode**: iframe loads the edit-mode build (data-cms-* attributes) + injected `visual-edit-inject.ts`
- **Toggle**: client-side, no rebuild needed (two iframes, swap visibility)

**Save handler in the parent:**
```typescript
window.addEventListener('message', async (e) => {
  if (e.data?.type !== 'wh-visual-edit') return;

  if (e.data.strategy === 'attribute') {
    // Strategy A: direct field save
    await fetch(`/api/cms/${e.data.collection}/${e.data.slug}`, {
      method: 'PATCH',
      body: JSON.stringify({ [e.data.field]: e.data.value }),
    });
  } else {
    // Strategy B: content-match resolution
    const match = await fetch('/api/admin/content/resolve-field', {
      method: 'POST',
      body: JSON.stringify({ originalText: e.data.originalText, path: currentPreviewPath }),
    });
    // ... apply matched field
  }

  // Refresh preview (incremental rebuild or revalidation)
  refreshPreview();
});
```

### 5. Edit FAB (Mobile + Desktop)

From original F129 — a floating action button on preview:

**Mobile (cms-mobile):**
- Gold pencil FAB (bottom-right, replaces Chat FAB during preview)
- Tap → resolve URL → navigate to document editor
- Visual Edit mode accessible via long-press on FAB → "Edit inline"

**Desktop (cms-admin):**
- Small edit icon overlay on preview panel
- Click → resolve URL → open document in new tab
- Toggle "Visual Edit" mode → inline editing enabled

### 6. Content Match Resolver (Strategy B)

```
POST /api/admin/content/resolve-field
Body: { originalText: "1.000+", previewPath: "/", siteId: "webhouse-site" }

Response: {
  match: { collection: "stats", slug: "overview", field: "productionSites" },
  confidence: "exact",  // "exact" | "fuzzy" | "ai" | "ambiguous"
  alternatives: []       // populated when confidence < exact
}
```

**Resolution cascade:**
1. **Exact match** — search all document fields for `value === originalText` → single match → done
2. **Fuzzy match** — normalize whitespace, strip HTML, compare → threshold 95% → done
3. **AI match** — send context (surrounding HTML, candidate fields, originalText) to Claude → parse response
4. **Ambiguous** — multiple matches → return alternatives, frontend shows a picker

### 7. Framework Consumer Support

For the 13 framework examples in `examples/consumers/`:

| Framework | Rendering | Strategy | Notes |
|-----------|-----------|----------|-------|
| Static (build.ts) | CMS-controlled | A (attributes) | Full field-level editing |
| Next.js | React SSR/SSG | B (content-match) | Works through preview-proxy |
| Astro | Astro templates | B | Works through preview-proxy |
| SvelteKit | Svelte templates | B | Works through preview-proxy |
| Go (Gin) | html/template | B | Proxy relays localhost |
| .NET (Razor) | Razor Pages | B | Proxy relays localhost |
| Java (Spring) | Thymeleaf | B | Proxy relays localhost |
| Ruby (Rails) | ERB/Slim | B | Proxy relays localhost |
| Hugo | Go templates | A* | Hugo can output data-attrs via partial |
| Rust, Swift, Elixir | Native templates | B | Proxy relays localhost |

*Hugo and other static generators CAN output data-attributes if their templates are configured — upgrade path from B to A.

## Implementation Phases

### Phase 1 — Edit FAB + URL Resolver (2 days)
1. URL → document resolver endpoint
2. postMessage URL tracking injection in preview-proxy
3. Edit FAB on mobile (fullscreen preview)
4. Edit button on desktop preview panel
5. Client-side resolver for desktop

### Phase 2 — Visual Inline Editing for build.ts sites (3 days)
6. Port Pitch Vault `wysiwyg-inject.ts` → `@webhouse/cms/visual-edit/inject.ts`
7. Adapt: gold branding, data-cms-* awareness, postMessage protocol
8. Build.ts `--edit-mode` flag: render with `data-cms-field` attributes
9. Admin preview: "View/Edit" toggle, inject script in edit mode
10. Save handler: parse postMessage → PATCH content API → incremental rebuild

### Phase 3 — Content-Match for framework sites (2 days)
11. `POST /api/admin/content/resolve-field` — exact + fuzzy match
12. Strategy B save flow: DOM-path edit → content-match → field save
13. Fallback: AI-assisted match when fuzzy fails
14. Ambiguity picker UI (multiple candidates → user selects)

### Phase 4 — Polish + edge cases (1 day)
15. Richtext fields: contenteditable with basic formatting (bold/italic/links)
16. Number/date fields: input overlay instead of contenteditable
17. Image fields: click to open media picker overlay
18. Undo (Cmd+Z): revert to previous field value, not just text undo
19. Multi-field save: batch edits, single PATCH call when user clicks "Save all"

**Total: 8 days**

## Impact Analysis

### Files created
- `packages/cms/src/visual-edit/inject.ts` — ported + adapted visual editor script
- `packages/cms/src/visual-edit/index.ts` — export as string for injection
- `packages/cms-admin/src/app/api/admin/content/resolve/route.ts` — URL → document resolver
- `packages/cms-admin/src/app/api/admin/content/resolve-field/route.ts` — content-match resolver
- `packages/cms-admin/src/components/preview/visual-edit-toggle.tsx` — View/Edit mode switch
- `packages/cms-admin/src/components/preview/visual-edit-handler.tsx` — postMessage listener + save
- `packages/cms-mobile/src/components/EditFab.tsx` — mobile FAB

### Files modified
- `packages/cms/src/build/render.ts` — add `editMode` option with data-cms-* attributes
- `packages/cms/src/build/pipeline.ts` — pass `editMode` option through
- `packages/cms-admin/src/app/api/mobile/preview-proxy/route.ts` — inject URL tracking + edit script
- `packages/cms-admin/src/app/api/preview-serve/route.ts` — support edit-mode builds
- `packages/cms-admin/src/components/sidebar.tsx` — (none — preview panel is separate)

### Downstream dependents for modified files

**`packages/cms/src/build/render.ts`** is imported by:
- `packages/cms/src/build/pipeline.ts` — pass editMode through (needs change)
- No other downstream dependents

**`packages/cms/src/build/pipeline.ts`** is imported by:
- `packages/cms/src/index.ts` — re-export, unaffected
- `packages/cms-cli/src/commands/build.ts` — add `--edit-mode` CLI flag
- `packages/cms-admin/src/app/api/preview-build/route.ts` — pass editMode when visual editing

**`packages/cms-admin/src/app/api/mobile/preview-proxy/route.ts`** — no downstream dependents (leaf route)

### Blast radius
- Edit-mode build outputs slightly larger HTML (data-attributes add ~50-100 bytes per field). Only produced when `editMode: true` — normal builds unaffected.
- Content-match resolver (Strategy B) searches all documents — O(n) where n = total fields across all docs. Fine for <10K docs. For larger sites, index content on first call.
- `contenteditable` can produce unexpected HTML (browser adds `<div>`, `<br>`, `<span style="...">`). The save handler must strip/normalize before writing to JSON.

### Breaking changes
None. Everything is additive. Edit mode is opt-in (toggle in preview panel).

## Test Plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Edit FAB resolves `/blog/cms-chronicle-13` → `posts/cms-chronicle-13`
- [ ] Edit FAB shows toast for unresolvable URL
- [ ] Visual edit on build.ts site: click title → edit → save → JSON updated
- [ ] Visual edit preserves formatting (no stray `<div>`, `<br>`)
- [ ] Content-match resolves "1.000+" → `stats/overview.productionSites`
- [ ] Ambiguous match shows picker
- [ ] Normal build output has NO data-cms-* attributes
- [ ] Edit-mode build output HAS data-cms-* attributes
- [ ] Existing preview (non-edit mode) is byte-for-byte identical to before
- [ ] Framework consumer (Go example) visual edit → saves to JSON

## Dependencies
- F30 (Form Engine) — Done. `{{form:name}}` shortcodes can coexist with visual edit
- Preview infrastructure (sirv, preview-proxy) — Done
- Incremental rebuild / revalidation — Done (F119 instant content deployment)

## Effort Estimate
**Large** — 8 days (4 phases)

## Reference: Pitch Vault Implementation

Key files to port from:
- `/Users/cb/Apps/cbroberg/pitch/lib/wysiwyg-inject.ts` — core editor (550 lines)
- `/Users/cb/Apps/cbroberg/pitch/app/(app)/pitches/[id]/visual/page.tsx` — iframe + postMessage + save
- `/Users/cb/Apps/cbroberg/pitch/scripts/clean-pitch-html.mjs` — strip editor artifacts
