<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Richtext Embedded Media

## Richtext Embedded Media

Every `richtext` field includes built-in TipTap nodes for embedding media and structured content. These are available on ALL sites in ALL richtext fields without any configuration — they are part of the editor itself.

| Node | Description |
|------|-------------|
| **Image** | Upload or paste an image. Supports resize handles and alignment (left, center, right). |
| **Video embed** | Paste a YouTube or Vimeo URL. Renders as a responsive iframe. |
| **Audio embed** | Upload an mp3, wav, or ogg file. Renders an inline `<audio>` player. |
| **File attachment** | Upload any file type. Renders as a download-link card with filename and size. |
| **Callout** | Styled info/warning/tip box with editable text inside. |

### Embedded media vs. CMS blocks

These embedded media nodes are **not** the same as CMS blocks defined in `cms.config.ts`:

- **Richtext embedded media** — built into the TipTap editor, available everywhere, no config needed. The content is stored as HTML within the richtext field value.
- **CMS blocks** — defined per-site in `cms.config.ts`, used in `blocks`-type fields, stored as structured JSON with a `_block` discriminator.

### Rendering richtext content in Next.js

**Richtext fields store markdown.** Use `react-markdown` with custom components to render them — see the "Rendering richtext content" section below in Site Building Patterns for the full recommended pattern.

**NEVER use `dangerouslySetInnerHTML` with a regex-based markdown parser** — it breaks images with sizing, tables, embedded media, and any non-trivial markdown.

**For complex pages with mixed content (text + interactives + images + files):** Use `blocks`-type fields instead of a single richtext field. Each block type handles its own rendering:
- `text` block → rendered with `react-markdown`
- `interactive` block → rendered as scaled iframe (supports `viewportWidth`, `viewportHeight`, `scale` fields)
- `image` block → rendered as `<img>` with caption
- `file` block → rendered as download link
