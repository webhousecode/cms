# @webhouse/cms — Claude Code Reference

## What is @webhouse/cms

`@webhouse/cms` is a file-based, AI-native CMS engine for TypeScript projects. You define collections and fields in a `cms.config.ts` file, and the CMS stores content as flat JSON files in a `content/` directory (one file per document, organized by collection). It provides a REST API server, a static site builder, AI content generation via `@webhouse/cms-ai`, and a visual admin UI at [webhouse.app](https://webhouse.app). The primary use case is powering Next.js websites where content is read directly from JSON files at build time or runtime.

## Quick Start

```bash
# Scaffold a new project
npm create @webhouse/cms my-site

# Or with the CLI directly
npx @webhouse/cms-cli init my-site
```

This generates:
```
my-site/
  cms.config.ts          # Collection + field definitions
  package.json           # Dependencies: @webhouse/cms, @webhouse/cms-cli, @webhouse/cms-ai
  .env                   # AI provider keys (ANTHROPIC_API_KEY or OPENAI_API_KEY)
  content/
    posts/
      hello-world.json   # Example document
```

Then:
```bash
cd my-site
npm install
npx cms dev       # Start dev server + admin UI
npx cms build     # Build static site
```

## cms.config.ts Reference

The config file uses helper functions for type safety. All are identity functions that return their input:

```typescript
import { defineConfig, defineCollection, defineBlock, defineField } from '@webhouse/cms';

export default defineConfig({
  collections: [ /* ... */ ],
  blocks: [ /* ... */ ],
  defaultLocale: 'en',           // Optional: default locale for <html lang="">
  locales: ['en', 'da'],         // Optional: supported locales for AI translation
  autolinks: [ /* ... */ ],      // Optional: automatic internal linking rules
  storage: { /* ... */ },        // Optional: storage adapter config
  build: { outDir: 'dist', baseUrl: '/' },
  api: { port: 3000 },
});
```

### Collection Config

```typescript
defineCollection({
  name: 'posts',                 // Required: unique identifier, used as directory name
  label: 'Blog Posts',           // Optional: human-readable label for admin UI
  slug: 'posts',                 // Optional: URL slug override
  urlPrefix: '/blog',            // Optional: URL prefix for generated pages
  sourceLocale: 'en',            // Optional: primary authoring locale
  locales: ['en', 'da'],         // Optional: translatable locales
  fields: [ /* ... */ ],         // Required: array of FieldConfig
  hooks: {                       // Optional: lifecycle hooks
    beforeCreate: 'path/to/hook.js',
    afterCreate: 'path/to/hook.js',
    beforeUpdate: 'path/to/hook.js',
    afterUpdate: 'path/to/hook.js',
    beforeDelete: 'path/to/hook.js',
    afterDelete: 'path/to/hook.js',
  },
})
```

### Complete Field Type Reference

Every field has these common properties:
```typescript
{
  name: string;          // Required: field key in the document data object
  type: FieldType;       // Required: one of the types below
  label?: string;        // Optional: human-readable label for admin UI
  required?: boolean;    // Optional: whether field must have a value
  defaultValue?: unknown; // Optional: default value
  ai?: {                 // Optional: hints for AI content generation
    hint?: string;       // Instruction for the AI, e.g. "Write in a friendly tone"
    maxLength?: number;  // Maximum character count for AI output
    tone?: string;       // Tone instruction, e.g. "professional", "casual"
  };
  aiLock?: {             // Optional: AI lock behavior
    autoLockOnEdit?: boolean;   // Lock field when user edits it (default: true)
    lockable?: boolean;         // Whether field can be locked at all (default: true)
    requireApproval?: boolean;  // Require human approval before AI can write
  };
}
```

#### text
Single-line text input.
```typescript
{ name: 'title', type: 'text', label: 'Title', required: true, maxLength: 120, minLength: 3 }
```

#### textarea
Multi-line plain text.
```typescript
{ name: 'excerpt', type: 'textarea', label: 'Excerpt', maxLength: 300 }
```

#### richtext
Rich text / Markdown content. Rendered as a block editor in the admin UI.
```typescript
{ name: 'content', type: 'richtext', label: 'Content' }
```

#### number
Numeric value.
```typescript
{ name: 'price', type: 'number', label: 'Price' }
```

#### boolean
True/false toggle.
```typescript
{ name: 'featured', type: 'boolean', label: 'Featured' }
```

#### date
ISO date string.
```typescript
{ name: 'publishDate', type: 'date', label: 'Publish Date' }
```

#### image
Single image reference (URL or path).
```typescript
{ name: 'heroImage', type: 'image', label: 'Hero Image' }
```

#### image-gallery
Multiple images.
```typescript
{ name: 'photos', type: 'image-gallery', label: 'Photo Gallery' }
```

#### video
Video reference (URL or embed).
```typescript
{ name: 'intro', type: 'video', label: 'Intro Video' }
```

#### audio
Audio reference. Accepts a URL input or file upload in the admin UI. Stores the URL as a string. Renders an HTML5 `<audio>` player in the admin for preview.
```typescript
{ name: 'podcast', type: 'audio', label: 'Episode Audio' }
```

#### htmldoc
Full HTML document editor (visual WYSIWYG). Stores complete HTML as a string. Used for standalone HTML pages, email templates, or landing page sections.
```typescript
{ name: 'template', type: 'htmldoc', label: 'Email Template' }
```

#### file
File attachment. Stores a URL string to the uploaded file.
```typescript
{ name: 'download', type: 'file', label: 'Downloadable PDF' }
```

#### interactive
Reference to an Interactive (standalone HTML component managed in the Interactives library). Stores an interactive ID string.
```typescript
{ name: 'chart', type: 'interactive', label: 'Interactive Chart' }
```

#### column-slots
Multi-column layout with configurable slot count. Each slot contains nested fields.
```typescript
{ name: 'layout', type: 'column-slots', label: 'Two Column Layout' }
```

#### select
Dropdown selection from predefined options. Requires `options` array.
```typescript
{
  name: 'category',
  type: 'select',
  label: 'Category',
  options: [
    { label: 'Web Development', value: 'web' },
    { label: 'Mobile App', value: 'mobile' },
    { label: 'AI Tools', value: 'ai' },
  ],
}
```

#### tags
Free-form tag input. Stored as `string[]`.
```typescript
{ name: 'tags', type: 'tags', label: 'Tags' }
```

#### relation
Reference to documents in another collection. Set `multiple: true` for many-to-many.
```typescript
{ name: 'author', type: 'relation', collection: 'team', label: 'Author' }
{ name: 'relatedPosts', type: 'relation', collection: 'posts', multiple: true, label: 'Related Posts' }
```

#### array
Repeatable list of sub-fields. Each item is an object with the defined fields. If `fields` is omitted, it stores a plain `string[]`.
```typescript
{
  name: 'bullets',
  type: 'array',
  label: 'Bullet Points',
  // No fields = string array
}

{
  name: 'stats',
  type: 'array',
  label: 'Stats',
  fields: [
    { name: 'value', type: 'text', label: 'Value' },
    { name: 'label', type: 'text', label: 'Label' },
  ],
}
```

#### object
A nested group of fields. Stored as a single object.
```typescript
{
  name: 'dropdown',
  type: 'object',
  label: 'Dropdown Menu',
  fields: [
    { name: 'type', type: 'select', options: [
      { label: 'List', value: 'list' },
      { label: 'Columns', value: 'columns' },
    ]},
    { name: 'sections', type: 'array', label: 'Sections', fields: [
      { name: 'heading', type: 'text' },
      { name: 'links', type: 'array', fields: [
        { name: 'label', type: 'text' },
        { name: 'href', type: 'text' },
        { name: 'external', type: 'boolean' },
      ]},
    ]},
  ],
}
```

#### blocks
Dynamic content sections using the block system. Stored as an array of block objects, each with a `_block` discriminator field.
```typescript
{
  name: 'sections',
  type: 'blocks',
  label: 'Page Sections',
  blocks: ['hero', 'features', 'cta'],  // References block names defined in config.blocks
}
```

## Block System

Blocks are reusable content structures used within `blocks`-type fields. Define them at the top level of your config:

```typescript
export default defineConfig({
  blocks: [
    defineBlock({
      name: 'hero',          // Unique block identifier
      label: 'Hero Section', // Human-readable label
      fields: [
        { name: 'tagline', type: 'text', label: 'Tagline' },
        { name: 'description', type: 'textarea' },
        { name: 'ctaText', type: 'text', label: 'CTA Text' },
        { name: 'ctaUrl', type: 'text', label: 'CTA URL' },
      ],
    }),
    defineBlock({
      name: 'features',
      label: 'Features Grid',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'items', type: 'array', fields: [
          { name: 'icon', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'description', type: 'textarea' },
        ]},
      ],
    }),
  ],
  collections: [
    defineCollection({
      name: 'pages',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'sections', type: 'blocks', blocks: ['hero', 'features'] },
      ],
    }),
  ],
});
```

In the stored JSON, each block item includes a `_block` discriminator:
```json
{
  "data": {
    "sections": [
      { "_block": "hero", "tagline": "Build faster", "ctaText": "Get Started" },
      { "_block": "features", "title": "Why Us", "items": [ /* ... */ ] }
    ]
  }
}
```

When rendering, use `_block` to determine which component to render:
```typescript
function renderSection(block: Record<string, unknown>) {
  switch (block._block) {
    case 'hero': return <Hero tagline={block.tagline as string} />;
    case 'features': return <Features items={block.items as Item[]} />;
  }
}
```

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

## Storage Adapters

### Filesystem (default)
Stores documents as JSON files in `content/<collection>/<slug>.json`. Best for Git-based workflows.

```typescript
storage: {
  adapter: 'filesystem',
  filesystem: { contentDir: 'content' },  // Default: 'content'
}
```

### GitHub
Reads and writes JSON files directly via the GitHub API. Each create/update/delete is a commit.

```typescript
storage: {
  adapter: 'github',
  github: {
    owner: 'your-org',
    repo: 'your-repo',
    branch: 'main',              // Default: 'main'
    contentDir: 'content',       // Default: 'content'
    token: process.env.GITHUB_TOKEN!,
  },
}
```

### SQLite
Stores documents in a local SQLite database. Useful for API-heavy use cases.

```typescript
storage: {
  adapter: 'sqlite',
  sqlite: { path: './data/cms.db' },  // Optional, has a default path
}
```

## Content Structure

Every document is stored as a JSON file at `content/<collection>/<slug>.json` with this shape:

```typescript
interface Document {
  id: string;                    // Unique ID (generated, e.g. "a1b2c3d4")
  slug: string;                  // URL-safe identifier, used as filename
  collection: string;            // Collection name
  // Status: 'draft' (not live), 'published' (live), 'expired' (scheduler unpublished), 'archived'
  status: 'draft' | 'published' | 'archived' | 'expired';
  data: Record<string, unknown>; // All field values live here
  _fieldMeta: Record<string, {   // Per-field metadata (AI provenance, locks)
    lockedBy?: 'user' | 'ai' | 'import';
    lockedAt?: string;
    aiGenerated?: boolean;
    aiModel?: string;
  }>;
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  locale?: string;               // BCP 47 locale tag, e.g. "en", "da"
  translationOf?: string;        // Slug of source document (for translations)
  publishAt?: string;            // ISO timestamp for scheduled publishing
  unpublishAt?: string;          // ISO timestamp for scheduled expiry
}
```

Example file `content/posts/hello-world.json`:
```json
{
  "id": "abc123",
  "slug": "hello-world",
  "collection": "posts",
  "status": "published",
  "data": {
    "title": "Hello, World!",
    "excerpt": "My first post.",
    "content": "# Hello\n\nWelcome to my blog.",
    "date": "2025-01-15T10:00:00.000Z",
    "tags": ["intro", "welcome"]
  },
  "_fieldMeta": {},
  "createdAt": "2025-01-15T10:00:00.000Z",
  "updatedAt": "2025-01-15T10:00:00.000Z"
}
```

## Reading Content in Next.js

Content is stored as flat JSON files. Read them directly with `fs` — no SDK client needed.

### Loader Functions

```typescript
// lib/content.ts
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CONTENT_DIR = join(process.cwd(), 'content');

interface Document<T = Record<string, unknown>> {
  id: string;
  slug: string;
  collection: string;
  status: 'draft' | 'published' | 'archived';
  data: T;
  createdAt: string;
  updatedAt: string;
}

/** Get all documents in a collection */
export function getCollection<T = Record<string, unknown>>(
  collection: string,
  status: 'published' | 'draft' | 'all' = 'published'
): Document<T>[] {
  const dir = join(CONTENT_DIR, collection);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Document<T>)
    .filter(doc => status === 'all' || doc.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Get a single document by slug */
export function getDocument<T = Record<string, unknown>>(
  collection: string,
  slug: string
): Document<T> | null {
  const filePath = join(CONTENT_DIR, collection, `${slug}.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as Document<T>;
}

/** Get a singleton document (e.g. global settings) */
export function getSingleton<T = Record<string, unknown>>(
  collection: string,
  slug: string = collection
): T | null {
  const doc = getDocument<T>(collection, slug);
  return doc?.data ?? null;
}
```

### Example Next.js Page (App Router)

```typescript
// app/blog/page.tsx
import { getCollection } from '@/lib/content';

interface Post {
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
}

export default function BlogPage() {
  const posts = getCollection<Post>('posts');

  return (
    <main>
      <h1>Blog</h1>
      {posts.map(post => (
        <article key={post.slug}>
          <a href={`/blog/${post.slug}`}>
            <h2>{post.data.title}</h2>
            <p>{post.data.excerpt}</p>
            <time>{post.data.date}</time>
          </a>
        </article>
      ))}
    </main>
  );
}
```

```typescript
// app/blog/[slug]/page.tsx
import { getDocument, getCollection } from '@/lib/content';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return getCollection('posts').map(p => ({ slug: p.slug }));
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getDocument<{ title: string; content: string }>('posts', slug);
  if (!post) notFound();

  return (
    <article>
      <h1>{post.data.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.data.content }} />
    </article>
  );
}
```

### Rendering Blocks

```typescript
// app/[slug]/page.tsx
import { getDocument } from '@/lib/content';

interface Block { _block: string; [key: string]: unknown; }

function renderBlock(block: Block, index: number) {
  switch (block._block) {
    case 'hero':
      return <section key={index}><h1>{block.tagline as string}</h1></section>;
    case 'features':
      return (
        <section key={index}>
          {(block.items as { title: string; description: string }[]).map((item, i) => (
            <div key={i}><h3>{item.title}</h3><p>{item.description}</p></div>
          ))}
        </section>
      );
    default:
      return null;
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getDocument<{ title: string; sections: Block[] }>('pages', slug);
  if (!page) return null;

  return (
    <main>
      {page.data.sections?.map((block, i) => renderBlock(block, i))}
    </main>
  );
}
```

## CLI Commands

All commands are run via `npx cms <command>` (provided by `@webhouse/cms-cli`).

| Command | Description |
|---------|-------------|
| `cms init [name]` | Scaffold a new CMS project |
| `cms dev [--port 3000]` | Start dev server with hot reload |
| `cms build [--outDir dist]` | Build static site |
| `cms serve [--port 5000] [--dir dist]` | Serve the built static site |
| `cms ai generate <collection> "<prompt>"` | Generate a new document with AI |
| `cms ai rewrite <collection>/<slug> "<instruction>"` | Rewrite an existing document with AI |
| `cms ai seo [--status published]` | Run SEO optimization on all documents |
| `cms mcp keygen [--label "My key"] [--scopes "read,write"]` | Generate MCP API key |
| `cms mcp test [--endpoint url]` | Test local MCP server |
| `cms mcp status [--endpoint url]` | Check MCP server status |

### AI Commands

AI commands require `@webhouse/cms-ai` and an `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env`.

```bash
# Generate a blog post
npx cms ai generate posts "Write a guide to TypeScript generics"

# Rewrite with instructions
npx cms ai rewrite posts/hello-world "Make it more concise and add code examples"

# SEO optimization across all published content
npx cms ai seo
```

## Complete cms.config.ts Example

A realistic config with multiple collections, blocks, nested arrays, relations, and i18n:

```typescript
import { defineConfig, defineCollection, defineBlock } from '@webhouse/cms';

export default defineConfig({
  defaultLocale: 'en',
  locales: ['en', 'da'],

  blocks: [
    defineBlock({
      name: 'hero',
      label: 'Hero Section',
      fields: [
        { name: 'badge', type: 'text', label: 'Badge Text' },
        { name: 'tagline', type: 'text', label: 'Tagline', required: true },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'image', type: 'image', label: 'Background Image' },
        { name: 'ctas', type: 'array', label: 'Call-to-Actions', fields: [
          { name: 'label', type: 'text', label: 'Label' },
          { name: 'href', type: 'text', label: 'URL' },
          { name: 'variant', type: 'select', options: [
            { label: 'Solid', value: 'solid' },
            { label: 'Outline', value: 'outline' },
          ]},
        ]},
      ],
    }),
    defineBlock({
      name: 'features',
      label: 'Features Grid',
      fields: [
        { name: 'title', type: 'text', label: 'Section Title' },
        { name: 'description', type: 'textarea', label: 'Section Description' },
        { name: 'items', type: 'array', label: 'Feature Cards', fields: [
          { name: 'icon', type: 'text', label: 'Icon' },
          { name: 'title', type: 'text', label: 'Title' },
          { name: 'description', type: 'textarea', label: 'Description' },
        ]},
      ],
    }),
    defineBlock({
      name: 'notice',
      label: 'Notice / Callout',
      fields: [
        { name: 'text', type: 'textarea', label: 'Text' },
        { name: 'variant', type: 'select', label: 'Variant', options: [
          { label: 'Info', value: 'info' },
          { label: 'Warning', value: 'warning' },
          { label: 'Tip', value: 'tip' },
        ]},
      ],
    }),
    defineBlock({
      name: 'carousel',
      label: 'Image Carousel',
      fields: [
        { name: 'images', type: 'image-gallery', label: 'Images' },
        { name: 'caption', type: 'text', label: 'Caption' },
      ],
    }),
  ],

  autolinks: [
    { term: 'TypeScript', href: '/blog/typescript', title: 'TypeScript articles' },
  ],

  collections: [
    defineCollection({
      name: 'global',
      label: 'Global Settings',
      fields: [
        { name: 'siteTitle', type: 'text', label: 'Site Title' },
        { name: 'siteDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'navLinks', type: 'array', label: 'Navigation', fields: [
          { name: 'label', type: 'text', label: 'Label' },
          { name: 'href', type: 'text', label: 'URL' },
          { name: 'dropdown', type: 'object', label: 'Dropdown', fields: [
            { name: 'type', type: 'select', options: [
              { label: 'List', value: 'list' },
              { label: 'Columns', value: 'columns' },
            ]},
            { name: 'sections', type: 'array', label: 'Sections', fields: [
              { name: 'heading', type: 'text' },
              { name: 'links', type: 'array', fields: [
                { name: 'label', type: 'text' },
                { name: 'href', type: 'text' },
                { name: 'external', type: 'boolean' },
              ]},
            ]},
          ]},
        ]},
        { name: 'footerEmail', type: 'text', label: 'Footer Email' },
      ],
    }),

    defineCollection({
      name: 'pages',
      label: 'Pages',
      urlPrefix: '/',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'metaDescription', type: 'textarea', label: 'Meta Description' },
        { name: 'sections', type: 'blocks', label: 'Sections',
          blocks: ['hero', 'features', 'notice', 'carousel'] },
      ],
    }),

    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      urlPrefix: '/blog',
      sourceLocale: 'en',
      locales: ['en', 'da'],
      fields: [
        { name: 'title', type: 'text', required: true,
          ai: { hint: 'Concise, descriptive title under 70 characters', maxLength: 70 } },
        { name: 'excerpt', type: 'textarea', label: 'Excerpt',
          ai: { hint: 'One-paragraph summary', maxLength: 200 } },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'date', type: 'date', label: 'Publish Date' },
        { name: 'author', type: 'relation', collection: 'team', label: 'Author' },
        { name: 'category', type: 'select', options: [
          { label: 'Engineering', value: 'engineering' },
          { label: 'Design', value: 'design' },
          { label: 'Company', value: 'company' },
        ]},
        { name: 'tags', type: 'tags', label: 'Tags' },
        { name: 'coverImage', type: 'image', label: 'Cover Image' },
        { name: 'relatedPosts', type: 'relation', collection: 'posts', multiple: true,
          label: 'Related Posts' },
      ],
    }),

    defineCollection({
      name: 'team',
      label: 'Team Members',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'role', type: 'text' },
        { name: 'bio', type: 'textarea' },
        { name: 'photo', type: 'image' },
        { name: 'sortOrder', type: 'number' },
      ],
    }),

    defineCollection({
      name: 'work',
      label: 'Case Studies',
      urlPrefix: '/work',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'client', type: 'text', required: true },
        { name: 'category', type: 'select', options: [
          { label: 'Web', value: 'web' },
          { label: 'Mobile', value: 'mobile' },
          { label: 'AI', value: 'ai' },
        ]},
        { name: 'excerpt', type: 'textarea' },
        { name: 'content', type: 'richtext' },
        { name: 'year', type: 'text' },
        { name: 'tech', type: 'tags', label: 'Tech Stack' },
        { name: 'featured', type: 'boolean' },
        { name: 'gallery', type: 'image-gallery', label: 'Project Gallery' },
        { name: 'demoVideo', type: 'video', label: 'Demo Video' },
      ],
    }),
  ],

  storage: {
    adapter: 'filesystem',
    filesystem: { contentDir: 'content' },
  },

  build: {
    outDir: 'dist',
    baseUrl: 'https://example.com',
  },

  api: { port: 3000 },
});
```

## Programmatic Usage

You can use the CMS engine programmatically (e.g. in scripts or API routes):

```typescript
import { createCms, defineConfig, defineCollection } from '@webhouse/cms';

const config = defineConfig({
  collections: [
    defineCollection({ name: 'posts', fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'content', type: 'richtext' },
    ]}),
  ],
  storage: { adapter: 'filesystem', filesystem: { contentDir: 'content' } },
});

const cms = await createCms(config);

// Create a document
const doc = await cms.content.create('posts', {
  status: 'published',
  data: { title: 'Hello', content: '# Hello World' },
}, { actor: 'user' });

// Query documents
const { documents } = await cms.content.findMany('posts', {
  status: 'published',
  orderBy: 'createdAt',
  order: 'desc',
  limit: 10,
});

// Find by slug
const post = await cms.content.findBySlug('posts', 'hello');

// Update
await cms.content.update('posts', doc.id, {
  data: { title: 'Updated Title' },
});

// Clean up
await cms.storage.close();
```

## CMS Admin UI

The visual admin runs at [webhouse.app](https://webhouse.app) or locally via `npx @webhouse/cms-admin-cli`. After building a site, inform users:

> To manage content visually, run `npx @webhouse/cms-admin-cli` and open http://localhost:3010.

## Key Architecture Notes

- **No database required** — filesystem adapter stores everything as JSON files committed to Git
- **Document slugs are filenames** — `content/posts/my-post.json` has slug `my-post`
- **Field values live in `data`** — top-level document fields (`id`, `slug`, `status`, etc.) are system fields; user-defined field values are always inside `data`
- **Blocks use `_block` discriminator** — when iterating over a blocks field, check `item._block` to determine the block type
- **Relations store slugs or IDs** — relation fields store references to other documents, not embedded data
- **`_fieldMeta` tracks AI provenance** — when AI writes a field, metadata records which model, when, and whether the field is locked against future AI overwrites
- **Status workflow** — documents are `draft`, `published`, `expired`, or `archived`. Use `publishAt` for scheduled publishing and `unpublishAt` for scheduled expiry. `expired` is set automatically by the scheduler when `unpublishAt` passes
- **Richtext fields store markdown** — when importing or seeding content, always convert HTML to markdown first. TipTap's editor expects markdown input, not raw HTML. If you feed HTML directly, it will display as escaped text instead of rendered content.

## Common Mistakes (avoid these)

1. **HTML in richtext fields** — Never store raw HTML in richtext fields. Convert to markdown first. TipTap will display `<h2>Title</h2>` as literal text, not as a heading.

2. **Accessing fields wrong** — Document fields live in `doc.data.title`, not `doc.title`. Top-level properties (`id`, `slug`, `status`, `createdAt`) are system fields. Everything from the schema is inside `data`.

3. **Block discriminator** — Blocks use `_block` as the type key, not `_type` or `type`. Always check `item._block === "hero"`, not `item.type`.

4. **Hardcoded ports** — Don't assume `:3000` or `:3010`. Use environment variables or auto-detect with port scanning.

5. **Missing status filter** — `getCollection()` defaults to published only. To include drafts, pass `{ status: 'all' }`. Raw `findMany()` returns all statuses.

6. **Richtext rendering** — ALWAYS use `react-markdown` with `remark-gfm` and custom components. NEVER use regex-based markdown parsers or `dangerouslySetInnerHTML` — they break images with sizing/alignment, tables, and complex markdown. The `img` component MUST parse the `title` prop for TipTap's `float:left|width:300px` format.

7. **Image references** — Image fields store URL strings (e.g. `/uploads/image.jpg`), not file objects. In Next.js, use `<img>` or `next/image` with the URL directly.

8. **Relation values** — Relations store slugs as strings (single) or string arrays (multiple), not full document objects. To get the related document, do a separate `getDocument()` lookup.

## MANDATORY: Content File Requirements

**CRITICAL — READ THIS BEFORE BUILDING ANY SITE.**

The CMS discovers content by scanning `content/<collectionName>/` for `.json` files. If a collection defined in `cms.config.ts` has no JSON files in its content directory, it will appear **empty** in the admin UI — no documents to view, edit, or manage. This makes the site useless as a CMS-managed site.

### Rules (non-negotiable)

1. **Every collection in `cms.config.ts` MUST have at least one JSON file** in `content/<collectionName>/`. No exceptions. If you define a `pages` collection, there MUST be files like `content/pages/home.json`, `content/pages/about.json`, etc.

2. **Every JSON file MUST use the full document format:**
   ```json
   {
     "slug": "home",
     "status": "published",
     "data": {
       "title": "Home",
       "content": "Welcome to our site."
     }
   }
   ```
   The `slug`, `status`, and `data` fields are required. All user-defined field values go inside `data`, matching the field names in `cms.config.ts`.

3. **`build.ts` MUST read content from JSON files, not hardcode it.** The entire point of the CMS is that content is editable through the admin UI. If your build script has content strings baked into the code instead of reading from `content/` JSON files, the site is broken — editing content in the admin will have no effect on the built output.

4. **Static sites MUST have a `pages` collection** with at least `home.json`. This is the minimum for the site to show meaningful content in the admin UI. Other typical pages: `about.json`, `contact.json`.

5. **Collection name = directory name.** If your collection is named `work` in the config, the directory must be `content/work/`. If it's named `blogPosts`, the directory must be `content/blogPosts/`.

### Verification checklist

Before considering a site complete, verify:
- [ ] Every collection in `cms.config.ts` has JSON files in `content/<name>/`
- [ ] Every JSON file has `slug`, `status: "published"`, and `data` with the correct fields
- [ ] `build.ts` reads all content from JSON files (no hardcoded content strings)
- [ ] Running `npx tsx build.ts` produces output that reflects the JSON content
- [ ] Changing a value in a JSON file and rebuilding changes the output

## Site Building Patterns

### Recommended Next.js App Router structure

```
app/
  layout.tsx          # Shared navbar + footer
  page.tsx            # Homepage (read from content/pages/home.json)
  about/page.tsx      # About page
  blog/
    page.tsx          # Blog listing (getCollection('posts'))
    [slug]/page.tsx   # Blog post (getDocument('posts', slug))
  api/
    revalidate/route.ts  # Webhook endpoint for on-demand ISR
lib/
  content.ts          # getCollection(), getDocument() helpers
  markdown.ts         # Markdown-to-HTML renderer
components/
  navbar.tsx
  footer.tsx
content/              # CMS content (JSON files)
public/
  images/             # Static assets
  favicon.svg         # Site favicon
cms.config.ts         # CMS schema definition
```

### SEO metadata pattern

```typescript
// app/blog/[slug]/page.tsx
import { getDocument } from '@/lib/content';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getDocument('posts', params.slug);
  if (!post) return { title: 'Not Found' };
  return {
    title: post.data.title,
    description: post.data.excerpt,
    openGraph: {
      title: post.data.title,
      description: post.data.excerpt,
      type: 'article',
      publishedTime: post.data.date,
    },
  };
}
```

### Static generation with generateStaticParams

```typescript
// app/blog/[slug]/page.tsx
import { getCollection } from '@/lib/content';

export function generateStaticParams() {
  return getCollection('posts').map(post => ({ slug: post.slug }));
}
```

### Rendering richtext content (IMPORTANT)

**ALWAYS use `react-markdown` with custom components.** Never use regex-based markdown renderers or `dangerouslySetInnerHTML` with a custom parser — they break images, tables, and embedded content.

**Required packages:**
```bash
npm install react-markdown remark-gfm
```

**Standard article renderer pattern:**
```typescript
// components/article-body.tsx
"use client";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const mdComponents: Components = {
  // Headings
  h1: ({ children }) => <h1 className="text-3xl font-bold mt-8 mb-4">{children}</h1>,
  h2: ({ children }) => <h2 className="text-2xl font-bold mt-12 mb-4">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-semibold mt-8 mb-3">{children}</h3>,

  // Text
  p: ({ children }) => <p className="text-muted-foreground mb-4 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,

  // Images — MUST handle TipTap's title field for sizing/alignment
  // TipTap stores resize info as: ![alt](url "float:left|width:300px")
  img: ({ src, alt, title }) => {
    if (!src) return null;
    const isLeft = title?.includes("float:left");
    const isRight = title?.includes("float:right");
    const widthMatch = title?.match(/width:([^|]+)/);
    const imgWidth = widthMatch ? widthMatch[1] : undefined;

    const style: React.CSSProperties = {
      maxWidth: "100%",
      borderRadius: "0.5rem",
      display: "block",
      ...(imgWidth && { width: imgWidth }),
      ...(isLeft && { float: "left", marginRight: "1.5rem", marginBottom: "0.75rem" }),
      ...(isRight && { float: "right", marginLeft: "1.5rem", marginBottom: "0.75rem" }),
      ...(!isLeft && !isRight && { margin: "1.5rem 0" }),
    };
    return <img src={src} alt={alt ?? ""} style={style} />;
  },

  // Links
  a: ({ href, children }) => {
    const isExternal = href?.startsWith("http");
    return (
      <a href={href} className="underline hover:opacity-80"
        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  },

  // Lists
  ul: ({ children }) => <ul className="list-disc pl-6 space-y-1 mb-4">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 space-y-1 mb-4">{children}</ol>,
  li: ({ children }) => <li className="text-muted-foreground">{children}</li>,

  // Tables
  table: ({ children }) => (
    <div className="overflow-x-auto my-6">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="text-left px-4 py-2 font-semibold border-b">{children}</th>,
  td: ({ children }) => <td className="px-4 py-2 text-muted-foreground border-b border-border/40">{children}</td>,

  // Code
  code: ({ children }) => (
    <code className="text-sm px-1.5 py-0.5 rounded bg-muted">{children}</code>
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-primary pl-6 py-2 my-6 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
};

interface ArticleBodyProps {
  content: string;
}

export function ArticleBody({ content }: ArticleBodyProps) {
  return (
    <div style={{ clear: "both" }}>
      <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

**Usage in a page:**
```typescript
// app/blog/[slug]/page.tsx
import { ArticleBody } from "@/components/article-body";

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getDocument("posts", slug);
  if (!post) notFound();

  return (
    <article>
      <h1>{post.data.title}</h1>
      <ArticleBody content={post.data.content as string} />
    </article>
  );
}
```

**Key points:**
- The `img` component MUST parse the `title` prop for `float:left|width:300px` — TipTap stores resize/alignment info there
- Always use `remark-gfm` for table support
- `"use client"` is required because react-markdown uses client-side rendering
- The `clear: "both"` on the wrapper ensures floated images don't leak outside the article
- This pattern handles ALL richtext features: images with sizing, tables, code blocks, blockquotes, lists, links

## After Building a Site

Always inform the user about content management options:

> Your site is ready! To manage content visually:
> ```
> npx @webhouse/cms-admin-cli
> ```
> Then open http://localhost:3010 — your collections appear automatically.
>
> You can also use the hosted version at [webhouse.app](https://webhouse.app).

## 3. Content Relationships

Relations connect documents across collections. A relation field stores a **slug string** (single) or **slug array** (multiple) — never embedded data.

### Defining Relations

```typescript
// Single relation — stores one slug string, e.g. "john-doe"
{ name: 'author', type: 'relation', collection: 'team', label: 'Author' }

// Multi relation — stores an array of slugs, e.g. ["typescript-guide", "react-tips"]
{ name: 'relatedPosts', type: 'relation', collection: 'posts', multiple: true, label: 'Related Posts' }
```

### Resolving Relations in Next.js

Relations store slugs, so you resolve them with a `getDocument()` lookup:

```typescript
// lib/content.ts — add a relation resolver
import { getDocument, getCollection } from '@webhouse/cms/adapters';

/** Resolve a single relation field to its full document */
export function resolveRelation<T = Record<string, unknown>>(
  collection: string,
  slug: string | undefined | null,
) {
  if (!slug) return null;
  return getDocument<T>(collection, slug);
}

/** Resolve a multi-relation field to an array of documents */
export function resolveRelations<T = Record<string, unknown>>(
  collection: string,
  slugs: string[] | undefined | null,
) {
  if (!slugs || slugs.length === 0) return [];
  return slugs
    .map(slug => getDocument<T>(collection, slug))
    .filter((doc): doc is NonNullable<typeof doc> => doc !== null);
}
```

### Pattern: Blog Post with Author

```typescript
// app/blog/[slug]/page.tsx
import { getDocument, getCollection } from '@webhouse/cms/adapters';
import { notFound } from 'next/navigation';

interface Post {
  title: string;
  content: string;
  author: string;           // slug of the team member
  relatedPosts: string[];   // array of post slugs
}

interface TeamMember {
  name: string;
  role: string;
  photo: string;
  bio: string;
}

export function generateStaticParams() {
  return getCollection('posts').map(p => ({ slug: p.slug }));
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getDocument<Post>('posts', slug);
  if (!post) notFound();

  // Resolve the author relation
  const author = post.data.author
    ? getDocument<TeamMember>('team', post.data.author)
    : null;

  // Resolve related posts
  const relatedPosts = (post.data.relatedPosts ?? [])
    .map(s => getDocument<Post>('posts', s))
    .filter(Boolean);

  return (
    <article>
      <h1>{post.data.title}</h1>
      {author && (
        <div className="flex items-center gap-3">
          <img src={author.data.photo} alt={author.data.name} className="w-10 h-10 rounded-full" />
          <div>
            <p className="font-medium">{author.data.name}</p>
            <p className="text-sm text-muted-foreground">{author.data.role}</p>
          </div>
        </div>
      )}
      <div dangerouslySetInnerHTML={{ __html: post.data.content }} />

      {relatedPosts.length > 0 && (
        <aside>
          <h2>Related Posts</h2>
          <ul>
            {relatedPosts.map(rp => (
              <li key={rp!.slug}>
                <a href={`/blog/${rp!.slug}`}>{(rp!.data as Post).title}</a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </article>
  );
}
```

### Pattern: Author Page with All Their Posts (Reverse Lookup)

```typescript
// app/team/[slug]/page.tsx
import { getDocument, getCollection } from '@webhouse/cms/adapters';
import { notFound } from 'next/navigation';

interface TeamMember { name: string; role: string; bio: string; photo: string }
interface Post { title: string; excerpt: string; date: string; author: string }

export function generateStaticParams() {
  return getCollection('team').map(t => ({ slug: t.slug }));
}

export default async function TeamMemberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = getDocument<TeamMember>('team', slug);
  if (!member) notFound();

  // Reverse lookup: find all posts where author === this member's slug
  const posts = getCollection<Post>('posts')
    .filter(post => post.data.author === slug);

  return (
    <main>
      <h1>{member.data.name}</h1>
      <p>{member.data.bio}</p>

      <h2>Posts by {member.data.name}</h2>
      {posts.map(post => (
        <article key={post.slug}>
          <a href={`/blog/${post.slug}`}>
            <h3>{post.data.title}</h3>
            <p>{post.data.excerpt}</p>
          </a>
        </article>
      ))}
    </main>
  );
}
```

### When to Use Relations vs. Embedded Data

**Use a relation** when:
- The data is shared across multiple documents (e.g., an author appears on many posts)
- The related data changes independently (e.g., updating a team member's bio)
- You need a canonical source of truth (one place to update)

**Use embedded data** (object/array fields) when:
- The data is unique to this document (e.g., a list of bullet points)
- The data doesn't need to be queried independently
- You want a simpler structure without cross-collection lookups

## 4. SEO Patterns

### generateMetadata() in Next.js App Router

```typescript
// app/blog/[slug]/page.tsx
import { getDocument } from '@webhouse/cms/adapters';
import type { Metadata } from 'next';

interface Post {
  title: string;
  excerpt: string;
  content: string;
  date: string;
  coverImage: string;
  author: string;
  tags: string[];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getDocument<Post>('posts', slug);
  if (!post) return { title: 'Not Found' };

  const { title, excerpt, coverImage, date } = post.data;
  const url = `https://example.com/blog/${slug}`;

  return {
    title,
    description: excerpt,
    // Canonical URL from collection urlPrefix
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description: excerpt,
      url,
      type: 'article',
      publishedTime: date,
      images: coverImage ? [{ url: coverImage, width: 1200, height: 630, alt: title }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: excerpt,
      images: coverImage ? [coverImage] : [],
    },
  };
}
```

### Pattern: Auto-Generate Meta Description from Excerpt or First Paragraph

```typescript
// lib/seo.ts
/** Extract a meta description from available fields, capped at 160 chars */
export function getMetaDescription(data: {
  metaDescription?: string;
  excerpt?: string;
  content?: string;
}): string {
  // Priority: explicit meta description > excerpt > first paragraph of content
  if (data.metaDescription) return data.metaDescription.slice(0, 160);
  if (data.excerpt) return data.excerpt.slice(0, 160);
  if (data.content) {
    // Strip markdown/HTML and grab first paragraph
    const plain = data.content
      .replace(/#{1,6}\s/g, '')        // Remove heading markers
      .replace(/\*\*?(.*?)\*\*?/g, '$1') // Remove bold/italic
      .replace(/<[^>]+>/g, '')         // Remove HTML tags
      .replace(/\n+/g, ' ')           // Collapse newlines
      .trim();
    return plain.slice(0, 160);
  }
  return '';
}
```

### JSON-LD Structured Data

```typescript
// components/json-ld.tsx
interface ArticleJsonLdProps {
  title: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
  image?: string;
}

export function ArticleJsonLd({
  title, description, url, datePublished, dateModified, authorName, image,
}: ArticleJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url,
    datePublished,
    dateModified: dateModified ?? datePublished,
    ...(authorName && {
      author: { '@type': 'Person', name: authorName },
    }),
    ...(image && {
      image: { '@type': 'ImageObject', url: image },
    }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// Usage in a page:
// <ArticleJsonLd title={post.data.title} description={excerpt} url={url} datePublished={post.data.date} />
```

### AI-Powered SEO with `cms ai seo`

The CMS includes an AI SEO agent that auto-generates optimized meta titles, descriptions, and JSON-LD for all documents:

```bash
# Run SEO optimization on all published documents
npx cms ai seo

# Run on drafts too
npx cms ai seo --status draft
```

This writes a `_seo` object into each document's data:
```json
{
  "data": {
    "title": "My Blog Post",
    "_seo": {
      "metaTitle": "My Blog Post — Expert Guide to TypeScript (2026)",
      "metaDescription": "Learn TypeScript generics with practical examples...",
      "jsonLd": { "@context": "https://schema.org", "@type": "Article", "..." }
    }
  }
}
```

Use the `_seo` fields in `generateMetadata()`:

```typescript
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getDocument<Post & { _seo?: { metaTitle: string; metaDescription: string } }>('posts', slug);
  if (!post) return { title: 'Not Found' };

  const seo = post.data._seo;
  return {
    title: seo?.metaTitle ?? post.data.title,
    description: seo?.metaDescription ?? post.data.excerpt,
  };
}
```

### Sitemap Generation (app/sitemap.ts)

```typescript
// app/sitemap.ts
import { getCollection } from '@webhouse/cms/adapters';
import type { MetadataRoute } from 'next';

const BASE_URL = 'https://example.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
  ];

  // Blog posts
  for (const post of getCollection('posts')) {
    entries.push({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly',
      priority: 0.8,
    });
  }

  // Pages
  for (const page of getCollection('pages')) {
    entries.push({
      url: `${BASE_URL}/${page.slug}`,
      lastModified: new Date(page.updatedAt),
      changeFrequency: 'monthly',
      priority: 0.9,
    });
  }

  // Case studies
  for (const work of getCollection('work')) {
    entries.push({
      url: `${BASE_URL}/work/${work.slug}`,
      lastModified: new Date(work.updatedAt),
      changeFrequency: 'yearly',
      priority: 0.6,
    });
  }

  return entries;
}
```

### robots.txt

```typescript
// app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://example.com/sitemap.xml',
  };
}
```

### Pattern: Canonical URLs from Collection urlPrefix

Each collection has a `urlPrefix` that determines the URL structure. Use it consistently:

```typescript
// lib/urls.ts
import type { Document } from '@webhouse/cms/adapters';

const URL_PREFIXES: Record<string, string> = {
  posts: '/blog',
  pages: '',
  work: '/work',
  team: '/team',
};

export function getDocumentUrl(doc: Document): string {
  const prefix = URL_PREFIXES[doc.collection] ?? `/${doc.collection}`;
  return `${prefix}/${doc.slug}`;
}

export function getAbsoluteUrl(doc: Document, baseUrl = 'https://example.com'): string {
  return `${baseUrl}${getDocumentUrl(doc)}`;
}
```

## 5. Image Handling

### How Image Fields Work

Image fields store a URL string. The value is typically `/uploads/filename.jpg` for locally uploaded files, or an external URL for remote images.

```json
{
  "data": {
    "heroImage": "/uploads/1710547200-a1b2c3.jpg",
    "gallery": [
      "/uploads/1710547201-d4e5f6.jpg",
      "/uploads/1710547202-g7h8i9.jpg"
    ]
  }
}
```

### Uploading Images

Images are uploaded via the admin UI media library or the `/api/upload` endpoint:

```typescript
// Programmatic upload
const formData = new FormData();
formData.append('file', file);  // Key MUST be "file" (singular)
formData.append('folder', 'blog');  // Optional subfolder

const response = await fetch('/api/upload', { method: 'POST', body: formData });
const { url } = await response.json();
// url = "/uploads/blog/1710547200-a1b2c3.jpg"
```

### Using next/image with CMS Images

Configure `remotePatterns` in `next.config.ts` to allow CMS image domains:

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Local uploads served from same origin
        protocol: 'https',
        hostname: 'example.com',
        pathname: '/uploads/**',
      },
      {
        // If using external image CDN
        protocol: 'https',
        hostname: '*.cloudinary.com',
      },
    ],
  },
};

export default nextConfig;
```

### Responsive Images Pattern

```typescript
// components/cms-image.tsx
import Image from 'next/image';

interface CmsImageProps {
  src: string | undefined | null;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
  sizes?: string;
}

export function CmsImage({
  src,
  alt,
  width = 1200,
  height = 630,
  priority = false,
  className,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
}: CmsImageProps) {
  if (!src) return null;

  // Local uploads: use next/image for optimization
  if (src.startsWith('/uploads/')) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className={className}
        sizes={sizes}
      />
    );
  }

  // External URLs: use next/image if domain is in remotePatterns, otherwise <img>
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
      sizes={sizes}
    />
  );
}
```

### Image Optimization Best Practices

1. **Always provide `sizes`** — Without it, next/image generates srcsets for all viewport widths, wasting bandwidth.
2. **Use `priority` for above-the-fold images** — Hero images, cover photos, and any image visible on initial load.
3. **Set width/height to the intrinsic dimensions** — This prevents layout shift (CLS). If unknown, use the aspect ratio you want.
4. **Prefer WebP/AVIF** — next/image auto-converts if using the default loader. For external CDNs, configure format negotiation.
5. **Lazy load below-the-fold images** — next/image lazy-loads by default (except `priority` images).

## 6. Internationalization (i18n)

### Configure Locales in cms.config.ts

```typescript
export default defineConfig({
  defaultLocale: 'en',
  locales: ['en', 'da'],

  collections: [
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      sourceLocale: 'en',        // Primary authoring locale
      locales: ['en', 'da'],     // This collection supports English and Danish
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'content', type: 'richtext' },
      ],
    }),
  ],
});
```

### How Translations Work

Each translation is a **separate document** linked to its source via `translationOf`:

```json
// content/posts/hello-world.json (source, English)
{
  "slug": "hello-world",
  "locale": "en",
  "data": { "title": "Hello, World!" }
}

// content/posts/hello-world-da.json (translation, Danish)
{
  "slug": "hello-world-da",
  "locale": "da",
  "translationOf": "hello-world",
  "data": { "title": "Hej, Verden!" }
}
```

### How Translations Work in the Admin UI

In the admin UI, translated documents appear grouped together. When viewing a document, you see:
- The current locale in a language badge
- A language switcher to jump to other translations
- A "Translate" button to create a new translation (triggers AI translation if configured)

### AI Translation Agent

The CMS AI package includes a translation agent that can translate documents automatically:

```typescript
// Programmatic usage
import { createAi } from '@webhouse/cms-ai';

const ai = await createAi();
const result = await ai.content.translate(
  sourceDoc.data,         // Current document data
  'da',                   // Target locale
  { collection: col },    // Collection config for field awareness
);
// result.fields contains the translated data
```

From the CLI, use the rewrite command with a translation instruction:

```bash
npx cms ai rewrite posts/hello-world "Translate all text content to Danish (da). Keep field names in English."
```

### Next.js i18n Routing Pattern

Use a `[locale]` route segment with Next.js middleware for locale detection. The middleware checks for a locale prefix in the URL, detects the preferred locale from the `Accept-Language` header, and redirects. See Next.js i18n docs for the standard pattern.

For pages, use `generateStaticParams()` to generate paths for each locale, and try the locale-specific document first (e.g., `hello-world-da`) then fall back to the source document.
```

### Hreflang Tags Generation

```typescript
// app/[locale]/blog/[slug]/page.tsx
import type { Metadata } from 'next';
import { getDocument, getCollection } from '@webhouse/cms/adapters';

const BASE_URL = 'https://example.com';
const LOCALES = ['en', 'da'];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = getDocument('posts', slug);
  if (!post) return { title: 'Not Found' };

  // Find all translations of this document
  const allPosts = getCollection('posts', { status: 'all' });
  const sourceSlug = post.translationOf ?? post.slug;
  const translations = allPosts.filter(
    p => p.slug === sourceSlug || p.translationOf === sourceSlug,
  );

  // Build hreflang alternates
  const languages: Record<string, string> = {};
  for (const t of translations) {
    const tLocale = t.locale ?? 'en';
    languages[tLocale] = `${BASE_URL}/${tLocale}/blog/${t.slug}`;
  }

  return {
    title: post.data.title as string,
    alternates: {
      canonical: `${BASE_URL}/${locale}/blog/${slug}`,
      languages,
    },
  };
}
```

### Pattern: Language Switcher Component

A client component that reads the current pathname via `usePathname()`, replaces or inserts the locale segment, and renders `<Link>` elements for each locale. Map locale codes to display labels (e.g., `{ en: 'English', da: 'Dansk' }`).

### Pattern: Fallback to Default Locale for Missing Translations

```typescript
// lib/i18n.ts
import { getDocument, getCollection } from '@webhouse/cms/adapters';

const DEFAULT_LOCALE = 'en';

/**
 * Get a document with locale fallback.
 * Tries the requested locale first, then falls back to the source document.
 */
export function getLocalizedDocument<T = Record<string, unknown>>(
  collection: string,
  slug: string,
  locale: string,
) {
  // 1. Try exact locale match (e.g. "hello-world-da")
  const localized = getDocument<T>(collection, `${slug}-${locale}`);
  if (localized) return localized;

  // 2. Try finding by translationOf + locale
  const allDocs = getCollection<T>(collection, { status: 'all' });
  const byTranslation = allDocs.find(
    d => d.translationOf === slug && d.locale === locale,
  );
  if (byTranslation) return byTranslation;

  // 3. Fall back to the source document (default locale)
  return getDocument<T>(collection, slug);
}
```

## 7. Deployment Checklist

Before deploying a CMS-managed site, verify every item:

### Content Readiness

- [ ] All documents intended to be live have `status: "published"`
- [ ] No published pages reference draft-only documents (e.g., a published post linking to a draft author)
- [ ] All relation fields point to existing, published documents
- [ ] OG images (cover images) exist for key pages — social sharing looks broken without them

### Configuration

- [ ] `cms.config.ts` — all collections and fields are defined and match the content directory
- [ ] Preview URL in Site Settings (admin UI) points to the production URL
- [ ] Environment variables are set for the deployment environment:
  - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (if using AI features)
  - `GITHUB_TOKEN` (if using GitHub storage adapter)
  - `UPLOAD_BASE` (if uploads are served from a CDN or different origin)

### Storage

- [ ] **Filesystem adapter**: content/ directory is committed to Git. The deployment platform (Vercel, Netlify) must have access to these files at build time.
- [ ] **GitHub adapter**: OAuth token is long-lived (use a fine-grained personal access token or service account, not a short-lived OAuth token that expires)
- [ ] **SQLite adapter**: database file path is writable in the deployment environment

### Next.js Configuration

- [ ] `next.config.ts` has `images.remotePatterns` for all image domains
- [ ] `app/sitemap.ts` generates entries for all collections
- [ ] `app/robots.ts` exists and points to the sitemap
- [ ] `generateStaticParams()` is defined for all `[slug]` routes
- [ ] `generateMetadata()` returns proper title, description, and OG tags

### Build Verification

```bash
# Always test the production build locally before deploying
next build

# Check for:
# - No missing content errors (broken relation references)
# - No image optimization errors (missing remotePatterns)
# - Static pages generated for all expected slugs
```

### Platform-Specific Notes

**Vercel:**
```typescript
// next.config.ts — ensure image domains are configured
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'your-domain.com', pathname: '/uploads/**' },
  ],
}
```

**Fly.io:**
```toml
# fly.toml — use arn region
primary_region = "arn"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
```

**Self-hosted / Docker:**
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/content ./content
COPY --from=builder /app/package.json ./
RUN npm ci --omit=dev
CMD ["npm", "start"]
```

### Post-Deployment Verification

- [ ] Visit the sitemap URL (`/sitemap.xml`) and confirm all pages are listed
- [ ] Check a blog post page source for OpenGraph and JSON-LD tags
- [ ] Test social sharing preview with [opengraph.xyz](https://opengraph.xyz)
- [ ] Confirm images load correctly (no broken image icons)
- [ ] If using on-demand revalidation, test the webhook endpoint

## 8. Troubleshooting

Common issues and their fixes.

### GitHub Adapter Throws "Bad Token"

**Cause:** The OAuth token has expired or been revoked.

**Fix:**
1. In the admin UI: go to Sites, select your site, open Settings, and reconnect GitHub.
2. For long-term stability: use a fine-grained personal access token (PAT) with `contents: read/write` permission on the specific repository, rather than a short-lived OAuth token.
3. For automation: use a GitHub App installation token or a machine user account.

### "Collection Not Found" Error

**Cause:** The collection name in `cms.config.ts` doesn't match the content directory structure.

**Fix:** Ensure collection names in your config match the directory names in `content/`:
```
cms.config.ts: defineCollection({ name: 'posts', ... })
                                        ^^^^^
Directory:     content/posts/
                       ^^^^^
```

These must be identical. If your collection is named `blogPosts` in config, the directory must be `content/blogPosts/`.

### Content Not Showing After Save

**Cause:** Next.js static cache. Pages generated with `generateStaticParams()` are built at deploy time and not regenerated until the next build.

**Fix options:**

1. **On-demand revalidation via webhouse.app content push (recommended):**

webhouse.app sends a signed webhook with the **full document JSON** after every content save/publish/delete. The site writes the document directly to disk and calls `revalidatePath()`. No git pull, no API latency, instant updates.

**This only applies to GitHub-backed sites.** Filesystem sites (CMS + site on same disk) update content files directly — no webhook needed.

**Site side — three files needed:**

**`app/api/revalidate/route.ts`** — receives content push, writes to disk:
```typescript
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { notifyContentChange } from '@/lib/content-stream';

const SECRET = process.env.REVALIDATE_SECRET;

async function writeContent(
  collection: string,
  slug: string,
  action: string,
  document: Record<string, unknown> | null,
): Promise<'written' | 'deleted' | 'skipped'> {
  const contentDir = path.join(process.cwd(), 'content', collection);
  const filePath = path.join(contentDir, `${slug}.json`);

  if (action === 'deleted' || action === 'unpublished') {
    try { await fs.unlink(filePath); return 'deleted'; }
    catch { return 'skipped'; }
  }

  if (!document) return 'skipped';

  await fs.mkdir(contentDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(document, null, 2));
  return 'written';
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-cms-signature');
  const body = await request.text();

  if (SECRET) {
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
    const expected = 'sha256=' + crypto
      .createHmac('sha256', SECRET)
      .update(body)
      .digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  const payload = JSON.parse(body);
  const paths: string[] = payload.paths ?? ['/'];

  // Content push: write document to disk (or delete it)
  let contentResult: 'written' | 'deleted' | 'skipped' = 'skipped';
  if (payload.collection && payload.slug && payload.collection !== '_test') {
    contentResult = await writeContent(
      payload.collection, payload.slug, payload.action, payload.document ?? null,
    );
  }

  for (const p of paths) { revalidatePath(p); }

  // Notify connected browsers (LiveRefresh)
  notifyContentChange(paths);

  return NextResponse.json({ revalidated: true, paths, contentResult, timestamp: new Date().toISOString() });
}
```

**`lib/content-stream.ts`** — in-memory SSE broadcast:
```typescript
type Listener = (paths: string[]) => void;
const listeners = new Set<Listener>();

export function addListener(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyContentChange(paths: string[]) {
  for (const fn of listeners) fn(paths);
}
```

**`app/api/content-stream/route.ts`** — SSE endpoint for LiveRefresh:
```typescript
import { addListener } from '@/lib/content-stream';

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));
      const remove = addListener((paths) => {
        const data = JSON.stringify({ paths, timestamp: Date.now() });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); }
        catch { clearInterval(keepalive); }
      }, 30_000);
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
```

**`components/live-refresh.tsx`** — client component, add to root layout:
```typescript
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource('/api/content-stream');
    es.onmessage = (event) => {
      try { JSON.parse(event.data); router.refresh(); } catch {}
    };
    return () => es.close();
  }, [router]);
  return null;
}
```

Add `<LiveRefresh />` to your root layout inside the body.

Add to `.env` (or `.env.local`):
```env
# Generate with: openssl rand -hex 32
REVALIDATE_SECRET=your-64-char-hex-secret
```

**CMS admin side — configure in Site Settings → Revalidation:**
- **Revalidation URL**: `https://your-site.com/api/revalidate` (click "Auto" to generate from Preview URL)
- **Webhook Secret**: same value as `REVALIDATE_SECRET` in your site's `.env` (click "Generate" to create one, then copy to both places)
- Use **Send test ping** to verify the connection

The F42 Next.js GitHub boilerplate includes all of this pre-configured.

**Webhook payload format (content push):**
```json
{
  "event": "content.revalidate",
  "timestamp": "2026-03-16T10:00:00Z",
  "site": "my-site",
  "paths": ["/blog/hello-world", "/blog"],
  "collection": "posts",
  "slug": "hello-world",
  "action": "published",
  "document": { "id": "...", "slug": "hello-world", "status": "published", "data": { "title": "Hello World", "content": "..." }, "createdAt": "...", "updatedAt": "..." }
}
```

Header `X-CMS-Signature: sha256=<hmac>` is computed as HMAC-SHA256 of the JSON body using the shared secret.

2. **Time-based revalidation (simpler, less precise):**
```typescript
// In any page or layout
export const revalidate = 60; // Revalidate every 60 seconds
```

3. **Rebuild on content change:** Configure a Git webhook to trigger a new deployment when content files change.

### Supabase Adapter: "Could Not Find Table in Schema Cache"

**Cause:** PostgREST hasn't refreshed its schema cache after a new table was created.

**Fix:** The Supabase adapter now automatically sends `NOTIFY pgrst, 'reload schema'` after table creation. If it still fails:
1. Restart the PostgREST container (or Supabase project)
2. Verify the table exists: `SELECT * FROM information_schema.tables WHERE table_name = 'documents';`
3. Check that the `anon` or `service_role` key has `SELECT` permission on the table

### Port Already in Use

**Cause:** Another process is occupying the port.

**Fix:**
```bash
# Find what's using the port
lsof -ti:3000

# Kill it (if safe)
kill $(lsof -ti:3000)

# Or use a different port
npx cms dev --port 3001
```

### Images Not Loading in Production

**Cause:** Missing `remotePatterns` in next.config.ts, or upload path mismatch.

**Fix:**
1. Add the image domain to `next.config.ts`:
```typescript
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'your-domain.com', pathname: '/uploads/**' },
  ],
}
```
2. If images are served from a different origin than the site, set the `UPLOAD_BASE` environment variable so uploaded image URLs include the full origin.
3. For local development, ensure the `public/uploads/` directory exists or the admin dev server is running to serve uploads.

## Data-Driven Interactives

When building interactive content (charts, animations, calculators, demos), **ALL natural text and data MUST be stored in CMS collections — never hardcoded in the Interactive component.** The Interactive reads data from CMS via props passed from a server component.

### The Separation Principle

| What | Where | Editable by |
|------|-------|-------------|
| Text labels, headings | CMS text fields | Editor in admin |
| Data points, numbers | CMS array/object fields | Editor in admin |
| Thresholds, config values | CMS number/select fields | Editor in admin |
| Visualization, animation | Interactive component | Visual/AI/Code editor |
| Styling, colors | Interactive CSS | Visual/AI editor |

**Rule:** Be wildly creative with visualization — Chart.js, D3, GSAP, CSS animations, Canvas, WebGL — but data is always CMS-managed.

### Pattern: CMS Collection → Page → Interactive Component

**Step 1: Define a data collection in `cms.config.ts`**

```typescript
defineCollection({
  name: "chart-data",
  label: "Chart Data",
  fields: [
    { name: "title", type: "text", required: true },
    { name: "chartType", type: "select", options: [
      { label: "Line", value: "line" },
      { label: "Bar", value: "bar" },
      { label: "Pie", value: "pie" },
    ]},
    { name: "yAxisLabel", type: "text" },
    { name: "xAxisLabel", type: "text" },
    { name: "dataPoints", type: "array", label: "Data Points" },
    { name: "thresholds", type: "object", label: "Thresholds" },
  ],
})
```

**Step 2: Create the Interactive component (client component)**

```tsx
"use client";
import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

interface WaterChartProps {
  title: string;
  readings: Array<{ hour: string; value: number; anomaly?: string }>;
  yAxisLabel: string;
  thresholds: { criticalLow: number; warningHigh: number };
}

export function WaterConsumptionChart({ title, readings, yAxisLabel, thresholds }: WaterChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: readings.map(r => r.hour),
        datasets: [{
          label: yAxisLabel,
          data: readings.map(r => r.value),
          borderColor: "#22c55e",
          pointBackgroundColor: readings.map(r =>
            r.anomaly === "critical" ? "#ef4444" :
            r.anomaly === "warning" ? "#eab308" : "#22c55e"
          ),
        }]
      },
    });
    return () => chart.destroy();
  }, [readings, yAxisLabel]);

  return (
    <div>
      <h3>{title}</h3>
      <canvas ref={canvasRef} />
    </div>
  );
}
```

**Step 3: Use in a page (server component reads CMS, passes props)**

```tsx
import { getDocument } from "@/lib/content";
import { WaterConsumptionChart } from "@/components/interactives/water-chart";

export default function InfographicPage() {
  const chartData = getDocument("chart-data", "sow-7b-water-24h");
  if (!chartData) return null;

  return (
    <article>
      <WaterConsumptionChart
        title={chartData.data.title}
        readings={chartData.data.dataPoints}
        yAxisLabel={chartData.data.yAxisLabel}
        thresholds={chartData.data.thresholds}
      />
    </article>
  );
}
```

### Standalone HTML Interactives

For simpler cases, the CMS also supports standalone HTML interactives managed via the Interactives Manager in admin. These are complete HTML files with inline CSS/JS that render in iframes. Use these when:

- The interactive is self-contained and doesn't need CMS data
- You want quick prototyping with AI generation ("Create with AI" in admin)
- The interactive is a one-off visualization

For data-driven interactives that need CMS-managed content, always prefer the React component pattern above.

### Scaled Interactive Rendering (Blocks)

The built-in `interactive` block supports viewport scaling — render a full-size interactive as a miniature without scrollbars:

```tsx
case "interactive": {
  const intId = block.interactiveId as string;
  if (!intId) return null;
  const vw = (block.viewportWidth as number) || 1000;  // Internal viewport width
  const vh = (block.viewportHeight as number) || 800;   // Internal viewport height
  const sc = ((block.scale as number) || 100) / 100;    // Scale factor (50 = half size)
  const isScaled = sc < 1;
  return (
    <div key={index} className="my-8">
      {isScaled ? (
        <div style={{ width: vw * sc, height: vh * sc, overflow: "hidden", borderRadius: "0.75rem" }}>
          <iframe
            src={`/interactives/${intId}.html`}
            title={block.caption as string || "Interactive"}
            style={{ width: vw, height: vh, border: "none", transform: `scale(${sc})`, transformOrigin: "top left" }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      ) : (
        <iframe
          src={`/interactives/${intId}.html`}
          title={block.caption as string || "Interactive"}
          style={{ width: "100%", minHeight: `${vh}px`, border: "none", borderRadius: "0.75rem" }}
          sandbox="allow-scripts allow-same-origin"
        />
      )}
      {block.caption && (
        <p className="text-sm text-gray-500 mt-2 text-center">{block.caption as string}</p>
      )}
    </div>
  );
}
```

**Example:** `viewportWidth: 1000`, `viewportHeight: 800`, `scale: 50` → renders a 500x400px miniature of the full 1000x800 interactive. All sliders, buttons, and charts remain functional.
