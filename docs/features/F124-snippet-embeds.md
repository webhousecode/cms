# F124 — Snippet Embeds

> TipTap node extension that renders `{{snippet:slug}}` as a visual pill in the richtext editor. Reusable code/content blocks stored once, embedded everywhere.

**Status:** Planned
**Depends on:** None (snippets collection is a site-level concept, not CMS core)

---

## Problem

The `{{snippet:slug}}` token works at build/render time but is invisible in the TipTap richtext editor. Authors see raw `{{snippet:create-project}}` text with no indication of what it resolves to. There is no way to browse or insert snippets from the editor toolbar. AI builders have no documentation about the syntax.

## Solution

A TipTap Node extension (`SnippetEmbed`) that:
1. Recognizes `{{snippet:slug}}` in markdown roundtrip
2. Renders as a visual pill showing snippet title + language badge
3. Click to expand and see the full code
4. Insert via toolbar button or `/snippet` slash command
5. Stores as `{{snippet:slug}}` in markdown (unchanged)

## Technical Design

### 1. TipTap Node Extension

```typescript
// packages/cms-admin/src/components/editor/rich-text-editor.tsx

const SnippetEmbed = TipTapNode.create({
  name: "snippetEmbed",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      slug: { default: "" },
      title: { default: "" },
      lang: { default: "" },
      code: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "cms-snippet" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["cms-snippet", HTMLAttributes];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SnippetNodeView);
  },
});
```

### 2. Node View Component

```typescript
// packages/cms-admin/src/components/editor/snippet-node-view.tsx

function SnippetNodeView({ node }: NodeViewProps) {
  const [expanded, setExpanded] = useState(false);
  const { slug, title, lang, code } = node.attrs;

  return (
    <NodeViewWrapper>
      <div className="snippet-embed" onClick={() => setExpanded(!expanded)}>
        <div className="snippet-header">
          <Code2 size={14} />
          <span className="snippet-title">{title || slug}</span>
          <span className="snippet-lang">{lang}</span>
          <ChevronDown size={12} style={{ transform: expanded ? "rotate(180deg)" : "" }} />
        </div>
        {expanded && (
          <pre className="snippet-code"><code>{code}</code></pre>
        )}
      </div>
    </NodeViewWrapper>
  );
}
```

### 3. Markdown Serialization

```typescript
// In tiptap-markdown storage config:
{
  serialize(state, node) {
    state.write(`{{snippet:${node.attrs.slug}}}`);
    state.closeBlock(node);
  },
  parse: {
    // Convert <p>{{snippet:slug}}</p> → <cms-snippet slug="slug">
    setup(markdownit) {
      markdownit.core.ruler.push("snippet_embed", (state) => {
        for (const token of state.tokens) {
          if (token.type === "inline" && token.children) {
            const text = token.children.map(c => c.content).join("");
            const match = text.match(/^\{\{snippet:([a-z0-9-]+)\}\}$/);
            if (match) {
              token.type = "html_block";
              token.content = `<cms-snippet slug="${match[1]}"></cms-snippet>`;
            }
          }
        }
      });
    },
  },
}
```

### 4. Snippet Picker (Toolbar + Slash Command)

```typescript
// Toolbar button in rich-text-editor.tsx toolbar section
<ToolbarButton
  icon={<Braces size={16} />}
  title="Insert snippet"
  onClick={() => setSnippetPickerOpen(true)}
/>

// Slash command: type /snippet in editor
// Shows dropdown of available snippets from content/snippets/
```

Picker fetches snippets from API:
```
GET /api/cms/snippets → list all snippet documents
```

### 5. Snippet Resolution API

```typescript
// packages/cms-admin/src/app/api/cms/snippets/[slug]/route.ts
// Returns snippet data for the node view to display

export async function GET(request, { params }) {
  const { slug } = await params;
  const cms = await getAdminCms();
  const doc = await cms.content.findBySlug("snippets", slug);
  if (!doc) return NextResponse.json(null, { status: 404 });
  return NextResponse.json({
    slug: doc.slug,
    title: doc.data.title,
    lang: doc.data.lang,
    code: doc.data.code,
  });
}
```

### 6. AI Builder Guide Update

Add to `packages/cms/CLAUDE.md` quick reference:

```markdown
### Shared Snippets

Store reusable code blocks in a `snippets` collection and reference them:

```
{{snippet:install-command}}
```

The token is resolved at render time. In TipTap, it appears as a visual pill.
Define snippets in `content/snippets/{slug}.json`:
```json
{
  "slug": "install-command",
  "data": { "title": "Install", "code": "npm create @webhouse/cms my-site", "lang": "bash" }
}
```
```

### 7. Build.ts Documentation

Add snippet resolution to the docs site build guide and AI builder guide module `13-site-building.md`.

## Impact Analysis

### Files affected

**New files:**
- `packages/cms-admin/src/components/editor/snippet-node-view.tsx` — React node view
- `packages/cms-admin/src/app/api/cms/snippets/[slug]/route.ts` — snippet data API

**Modified files:**
- `packages/cms-admin/src/components/editor/rich-text-editor.tsx` — add SnippetEmbed node + toolbar button
- `packages/cms/CLAUDE.md` — add snippet syntax to AI builder guide
- `docs/ai-guide/13-site-building.md` — add snippet resolution pattern

### Downstream dependents

`packages/cms-admin/src/components/editor/rich-text-editor.tsx` is imported by:
- `packages/cms-admin/src/components/editor/field-editor.tsx` (1 ref) — unaffected, renders the editor component

`packages/cms/CLAUDE.md` — no code imports, documentation only.

### Blast radius
- **TipTap extensions are isolated** — adding a new Node type does not affect existing nodes
- **Markdown roundtrip must be tested** — `{{snippet:slug}}` must survive save → reload without corruption
- **Sites without a snippets collection** — the feature is inert, no errors
- **Existing `{{snippet:...}}` in content** — already works at render time, editor just adds visual representation

### Breaking changes
None. The `{{snippet:slug}}` syntax is already in use at render time. This feature adds editor support without changing storage format.

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Insert snippet via toolbar button → visual pill appears
- [ ] Insert snippet via `/snippet` slash command → picker opens
- [ ] Save document → `{{snippet:slug}}` in stored markdown
- [ ] Reload document → pill re-rendered from markdown
- [ ] Click pill → expands to show code
- [ ] Site without snippets collection → no errors, feature hidden
- [ ] Regression: existing TipTap nodes (image, video, interactive) still work
- [ ] Regression: markdown roundtrip for all existing content types

## Implementation Steps

1. **SnippetEmbed TipTap Node** — Node.create with attrs, parseHTML, renderHTML
2. **SnippetNodeView React component** — pill with expand/collapse
3. **Markdown serialization** — write `{{snippet:slug}}`, parse from markdown
4. **Snippet resolution API** — GET /api/cms/snippets/[slug]
5. **Toolbar button** — Braces icon, opens picker modal
6. **Snippet picker modal** — list snippets, search, click to insert
7. **Slash command** — `/snippet` triggers picker
8. **CSS** — pill styling matching existing embed nodes
9. **AI builder guide** — document syntax in CLAUDE.md + module 13
10. **Tests** — roundtrip, insert, save, reload

## Dependencies

- **Snippets collection** — must be defined in site's cms.config.ts (site-level, not CMS core)
- **TipTap v3** — already in use (Done)

## Effort Estimate

**Small** — 2 days

- Day 1: TipTap node, node view, markdown serialization, API
- Day 2: Toolbar button, picker modal, slash command, docs, tests

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).

> **i18n (F48):** Snippet content is language-agnostic (code). Picker UI labels must respect locale.
