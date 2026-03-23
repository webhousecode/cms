<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Richtext

## Richtext Features & Embedded Media

Every `richtext` field includes built-in TipTap nodes for embedding media and structured content.

| Node | Description |
|------|-------------|
| **Image** | Upload or paste an image. Supports resize handles and alignment (left, center, right). |
| **Video embed** | Paste a YouTube or Vimeo URL. Renders as a responsive iframe. |
| **Audio embed** | Upload an mp3, wav, or ogg file. Renders an inline `<audio>` player. |
| **File attachment** | Upload any file type. Renders as a download-link card with filename and size. |
| **Callout** | Styled info/warning/tip box with editable text inside. Variants: info, warning, tip, danger. |
| **Table** | Insert a structured data table with header row. |
| **Code block** | Fenced code block with syntax highlighting. |

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

| Feature | Toolbar item |
|---------|-------------|
| `bold` | Bold text |
| `italic` | Italic text |
| `strike` | Strikethrough |
| `code` | Inline code |
| `heading` | Heading selector (H1-H3) |
| `bulletList` | Bullet list |
| `orderedList` | Numbered list |
| `blockquote` | Blockquote |
| `horizontalRule` | Horizontal line |
| `link` | Hyperlink |
| `table` | Data table |
| `image` | Image upload/embed |
| `video` | Video embed (YouTube/Vimeo) |
| `audio` | Audio file upload |
| `file` | File attachment |
| `callout` | Info/warning/tip callout box |
| `interactive` | Interactive embed |

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

This covers: headings, lists, blockquotes, callouts (all variants), code blocks, tables, images, links, horizontal rules, video/audio embeds. Override with your own styles as needed.

### Embedded media vs. CMS blocks

These embedded media nodes are **not** the same as CMS blocks defined in `cms.config.ts`:

- **Richtext embedded media** — built into the TipTap editor, available everywhere, no config needed. The content is stored as HTML within the richtext field value.
- **CMS blocks** — defined per-site in `cms.config.ts`, used in `blocks`-type fields, stored as structured JSON with a `_block` discriminator.

### Rendering richtext content in Next.js

**Richtext fields store markdown.** Use `react-markdown` with custom components to render them — see the "Rendering richtext content" section in `13-site-building.md` for the full recommended pattern.

**NEVER use `dangerouslySetInnerHTML` with a regex-based markdown parser** — it breaks images with sizing, tables, embedded media, and any non-trivial markdown.

**For complex pages with mixed content (text + interactives + images + files):** Use `blocks`-type fields instead of a single richtext field. Each block type handles its own rendering.
