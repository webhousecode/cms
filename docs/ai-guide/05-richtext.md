<!-- @webhouse/cms ai-guide v0.4.0 — last updated 2026-03-27 -->

# Richtext

## Richtext Features & Embedded Media

Every `richtext` field includes a built-in TipTap v3 editor with embedded media and structured content nodes.

| Node | Description |
|------|-------------|
| **Image** | Upload or paste an image. Supports resize handles and alignment (left, center, right). |
| **Video embed** | Paste a YouTube or Vimeo URL. Renders as a responsive iframe. |
| **Audio embed** | Upload an mp3, wav, or ogg file. Renders an inline `<audio>` player. |
| **File attachment** | Upload any file type. Renders as a download-link card with filename and size. |
| **Callout** | Styled info/warning/tip box with editable text inside. Variants: info, warning, tip, danger. |
| **Table** | Insert a structured data table with header row. Add/delete rows and columns via context toolbar. |
| **Code block** | Fenced code block with syntax highlighting. |
| **Interactive embed** | Embed an Interactive (HTML app) from the Interactives manager. |

### Controlling available features

Use the `features` array on a richtext field to control which toolbar items are shown. **If omitted, all features are available.** If specified, only listed features appear in the toolbar.

```typescript
// Full-featured richtext (default — all tools available)
{ name: 'content', type: 'richtext', label: 'Content' }

// Restricted richtext — only basic formatting + images
{
  name: 'content',
  type: 'richtext',
  label: 'Content',
  features: ['bold', 'italic', 'heading', 'link', 'image', 'bulletList', 'orderedList']
}

// Minimal richtext — text only, no media
{
  name: 'bio',
  type: 'richtext',
  label: 'Bio',
  features: ['bold', 'italic', 'link']
}
```

**Available feature names:**

| Feature | Toolbar item | Shortcut |
|---------|-------------|----------|
| `bold` | Bold text | Cmd+B |
| `italic` | Italic text | Cmd+I |
| `underline` | Underline | Cmd+U |
| `strike` | Strikethrough | Cmd+Shift+S |
| `code` | Inline code | |
| `superscript` | Superscript (x²) | Cmd+. |
| `subscript` | Subscript (x₂) | Cmd+, |
| `heading` | Heading selector (H1-H3) | |
| `bulletList` | Bullet list | |
| `orderedList` | Numbered list | |
| `blockquote` | Blockquote | |
| `horizontalRule` | Horizontal line | |
| `textAlign` | Text alignment (left/center/right) | |
| `highlight` | Highlight with color picker (6 colors) | |
| `link` | Hyperlink | Cmd+K |
| `table` | Data table (with context toolbar for rows/columns) | |
| `image` | Image upload/embed | |
| `video` | Video embed (YouTube/Vimeo) | |
| `audio` | Audio file upload | |
| `file` | File attachment | |
| `callout` | Info/warning/tip callout box | |
| `interactive` | Interactive embed | |

### Markdown storage & HTML-in-markdown

Richtext fields store **markdown**. Standard formatting (bold, italic, headings, lists, links) uses native markdown syntax. Features that markdown doesn't support use inline HTML tags:

| Feature | Stored as |
|---------|-----------|
| Underline | `<u>text</u>` |
| Superscript | `<sup>text</sup>` |
| Subscript | `<sub>text</sub>` |
| Highlight | `<mark style="background-color:#fde68a">text</mark>` |
| Text alignment | `<p style="text-align:center">text</p>` |
| Interactive embed | `!!INTERACTIVE[id|title|align:left]` |
| File embed | `!!FILE[filename|label]` |

The `tiptap-markdown` extension is configured with `html: true` to preserve these tags through the roundtrip.

### Rendering embed tokens in static sites

When building static HTML from richtext content, your `build.ts` or renderer must handle the `!!INTERACTIVE` and `!!FILE` tokens. After parsing markdown, replace these tokens:

```typescript
// Render !!INTERACTIVE[id|title|options] as iframe
html = html.replace(
  /!!INTERACTIVE\[([^\]]+)\]/g,
  (_match, inner) => {
    const [id, title = id, options = ""] = inner.split("|").map(s => s.trim());
    const align = options.match(/align:(\w+)/)?.[1] || "center";
    return `<iframe src="/uploads/interactives/${id}.html" title="${title}"
      style="width:100%; border:none; border-radius:0.5rem; overflow:hidden;"
      onload="this.style.height=this.contentDocument.documentElement.scrollHeight+'px'"
      loading="lazy" sandbox="allow-scripts allow-same-origin"></iframe>`;
  },
);

// Render !!FILE[filename|label] as download link
html = html.replace(
  /!!FILE\[([^\]]+)\]/g,
  (_match, inner) => {
    const [filename, label = filename] = inner.split("|").map(s => s.trim());
    return `<a href="/uploads/${filename}" download>📎 ${label}</a>`;
  },
);
```

### Additional toolbar features

- **Zoom** — [−] 100% [+] at the right side of the toolbar. Scales editor content from 50% to 200%. Session-only, not persisted.
- **AI Proofread** — auto-detects language, checks spelling/grammar/style errors. Results shown in toast.
- **AI Bubble Menu** — select text to see AI rewrite options (shorter, longer, formal, casual, translate).

**IMPORTANT:** Only enable features that your site's CSS can render. If your site doesn't have callout styles, don't enable `callout`. Use `features` to match your site's rendering capabilities.

### Default richtext CSS

The CMS ships a default CSS file at `@webhouse/cms/static/richtext-defaults.css` that provides unstyled-but-visible rendering for ALL richtext elements. Import it in your site as a baseline:

```tsx
// Next.js: import in layout.tsx
import '@webhouse/cms/static/richtext-defaults.css';
```

```html
<!-- Static sites: link in <head> -->
<link rel="stylesheet" href="/richtext-defaults.css">
```

This covers: headings, lists, blockquotes, callouts (all variants), code blocks, tables, images, links, horizontal rules, video/audio embeds, highlights, underline, superscript, subscript. Override with your own styles as needed.

### Embedded media vs. CMS blocks

These embedded media nodes are **not** the same as CMS blocks defined in `cms.config.ts`:

- **Richtext embedded media** — built into the TipTap editor, available everywhere, no config needed. The content is stored as markdown (with HTML-in-markdown for advanced formatting) within the richtext field value.
- **CMS blocks** — defined per-site in `cms.config.ts`, used in `blocks`-type fields, stored as structured JSON with a `_block` discriminator.

### Rendering richtext content in Next.js

**Richtext fields store markdown.** Use `react-markdown` with custom components to render them — see the "Rendering richtext content" section in `13-site-building.md` for the full recommended pattern.

**NEVER use `dangerouslySetInnerHTML` with a regex-based markdown parser** — it breaks images with sizing, tables, embedded media, and any non-trivial markdown.

**For complex pages with mixed content (text + interactives + images + files):** Use `blocks`-type fields instead of a single richtext field. Each block type handles its own rendering.
