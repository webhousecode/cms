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

### Rendering richtext embedded media in Next.js

Richtext field values contain HTML that may include tags like `<audio>`, `<video>`, `<a download>`, and `<div class="callout callout-info">`. To render these correctly in Next.js, use `dangerouslySetInnerHTML` or a sanitizer that preserves these tags:

```typescript
// Simple approach: dangerouslySetInnerHTML (content is trusted, authored in your CMS)
function RichtextContent({ html }: { html: string }) {
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

// Usage in a page
export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getDocument<{ title: string; content: string }>('posts', slug);
  if (!post) notFound();

  return (
    <article>
      <h1>{post.data.title}</h1>
      <RichtextContent html={post.data.content} />
    </article>
  );
}
```

Style the embedded elements with CSS to match your site design:

```css
/* Audio players */
.prose audio {
  width: 100%;
  margin: 1.5rem 0;
}

/* File attachment cards */
.prose a[download] {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  text-decoration: none;
}

/* Callout boxes */
.prose .callout {
  padding: 1rem 1.25rem;
  border-radius: 0.5rem;
  margin: 1.5rem 0;
}
.prose .callout-info {
  background: #eff6ff;
  border-left: 4px solid #3b82f6;
}
.prose .callout-warning {
  background: #fffbeb;
  border-left: 4px solid #f59e0b;
}
.prose .callout-tip {
  background: #f0fdf4;
  border-left: 4px solid #22c55e;
}
```

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
  status: 'draft' | 'published' | 'archived';
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

## CMS Admin UI

The visual admin interface is available at [webhouse.app](https://webhouse.app) (hosted) or runs locally on port 3010 during development. It provides:

- Visual document editor for all collections
- Block editor with drag-and-drop for `blocks` fields
- Rich text editor for `richtext` fields
- Image upload and gallery management
- Relation picker for cross-collection references
- Field-level AI lock indicators
- Draft/published/archived status management
- AI content generation and rewriting from the UI

Connect your project by pointing the admin UI at your CMS API endpoint.

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

The visual admin interface for managing content. Four ways to run it:

| Method | Command | Best for |
|--------|---------|----------|
| **Hosted** | Open [webhouse.app](https://webhouse.app) | Quick access, no install |
| **npx** | `npx @webhouse/cms-admin-cli` | Local dev, auto-detects cms.config.ts |
| **Docker** | `docker run -p 3010:3010 -v $(pwd):/site ghcr.io/webhousecode/cms-admin` | Isolated, reproducible |
| **Git clone** | `git clone https://github.com/webhousecode/cms && pnpm install && pnpm dev` | Full source access |

### npx usage

```bash
npx @webhouse/cms-admin-cli                        # auto-detect cms.config.ts in cwd
npx @webhouse/cms-admin-cli --config ./cms.config.ts  # explicit config path
npx @webhouse/cms-admin-cli -p 4000                 # custom port (default: 3010)
```

First run clones and builds the admin (~2 min). Subsequent starts are instant (cached at `~/.webhouse/cms-admin/`).

### Docker usage

```bash
# Run admin pointing at current directory
docker run -p 3010:3010 -v $(pwd):/site ghcr.io/webhousecode/cms-admin

# With custom config path inside container
docker run -p 3010:3010 -v $(pwd):/site -e CMS_CONFIG_PATH=/site/cms.config.ts ghcr.io/webhousecode/cms-admin
```

### What the admin provides

- Visual document editor for all collections
- Block editor with drag-and-drop for `blocks` fields
- Structured array and object editors with JSON/UI toggle
- Rich text editor for `richtext` fields
- Image upload and gallery management
- Relation picker for cross-collection references
- Field-level AI lock indicators
- Draft/published status management with scheduled publishing
- AI content generation and rewriting
- Multi-site management (multiple sites from one admin)
- GitHub OAuth integration for GitHub-backed sites

### Suggesting admin to users

When building a site, always inform the user about admin options. Example:

> Your site is ready! To manage content visually, run:
> ```
> npx @webhouse/cms-admin-cli
> ```
> Then open http://localhost:3010 — your site's collections will appear automatically.
> You can also use the hosted version at webhouse.app.

## Key Architecture Notes

- **No database required** — filesystem adapter stores everything as JSON files committed to Git
- **Document slugs are filenames** — `content/posts/my-post.json` has slug `my-post`
- **Field values live in `data`** — top-level document fields (`id`, `slug`, `status`, etc.) are system fields; user-defined field values are always inside `data`
- **Blocks use `_block` discriminator** — when iterating over a blocks field, check `item._block` to determine the block type
- **Relations store slugs or IDs** — relation fields store references to other documents, not embedded data
- **`_fieldMeta` tracks AI provenance** — when AI writes a field, metadata records which model, when, and whether the field is locked against future AI overwrites
- **Status workflow** — documents are `draft`, `published`, or `archived`. Use `publishAt` for scheduled publishing
- **Richtext fields store markdown** — when importing or seeding content, always convert HTML to markdown first. TipTap's editor expects markdown input, not raw HTML. If you feed HTML directly, it will display as escaped text instead of rendered content.

## Common Mistakes (avoid these)

1. **HTML in richtext fields** — Never store raw HTML in richtext fields. Convert to markdown first. TipTap will display `<h2>Title</h2>` as literal text, not as a heading.

2. **Accessing fields wrong** — Document fields live in `doc.data.title`, not `doc.title`. Top-level properties (`id`, `slug`, `status`, `createdAt`) are system fields. Everything from the schema is inside `data`.

3. **Block discriminator** — Blocks use `_block` as the type key, not `_type` or `type`. Always check `item._block === "hero"`, not `item.type`.

4. **Hardcoded ports** — Don't assume `:3000` or `:3010`. Use environment variables or auto-detect with port scanning.

5. **Missing status filter** — `getCollection()` defaults to published only. To include drafts, pass `{ status: 'all' }`. Raw `findMany()` returns all statuses.

6. **Richtext HTML output** — Richtext content rendered on the site may contain embedded media tags: `<audio controls>`, `<a download>`, `<div class="callout callout-info">`. Render with `dangerouslySetInnerHTML` and add CSS for these elements.

7. **Image references** — Image fields store URL strings (e.g. `/uploads/image.jpg`), not file objects. In Next.js, use `<img>` or `next/image` with the URL directly.

8. **Relation values** — Relations store slugs as strings (single) or string arrays (multiple), not full document objects. To get the related document, do a separate `getDocument()` lookup.

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

### Rendering markdown content safely

```typescript
// lib/markdown.ts — minimal markdown renderer
export function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/^\- (.*$)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/gm, '<p>$1</p>')
    .replace(/<p><h/g, '<h').replace(/<\/h(\d)><\/p>/g, '</h$1>')
    .replace(/<p><ul>/g, '<ul>').replace(/<\/ul><\/p>/g, '</ul>')
    .replace(/<p><\/p>/g, '');
}

// Or use a proper library:
// import { marked } from 'marked';
// const html = marked(content);
```

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

### Image Gallery Field

The `image-gallery` field stores an array of URL strings:

```typescript
// components/gallery.tsx
import { CmsImage } from './cms-image';

interface GalleryProps {
  images: string[];
  alt?: string;
}

export function Gallery({ images, alt = '' }: GalleryProps) {
  if (!images || images.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {images.map((src, i) => (
        <figure key={i} className="overflow-hidden rounded-lg">
          <CmsImage
            src={src}
            alt={`${alt} ${i + 1}`}
            width={600}
            height={400}
            sizes="(max-width: 768px) 50vw, 33vw"
            className="object-cover w-full h-full"
          />
        </figure>
      ))}
    </div>
  );
}
```

### SVG Handling (Logos, Icons)

SVGs uploaded via the media library are stored as regular URL strings. Since next/image rasterizes SVGs by default, render them differently:

```typescript
// components/svg-or-image.tsx
interface LogoProps {
  src: string;
  alt: string;
  className?: string;
}

export function Logo({ src, alt, className }: LogoProps) {
  if (src.endsWith('.svg')) {
    // Render SVG as an img tag to preserve vector quality
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} />;
  }
  return <CmsImage src={src} alt={alt} width={200} height={60} className={className} />;
}
```

### Pattern: Hero Image with Fallback

```typescript
// components/hero.tsx
import { CmsImage } from './cms-image';

interface HeroProps {
  title: string;
  description?: string;
  image?: string;
}

const FALLBACK_IMAGE = '/images/default-hero.jpg';

export function Hero({ title, description, image }: HeroProps) {
  return (
    <section className="relative h-[60vh] flex items-center justify-center">
      <CmsImage
        src={image ?? FALLBACK_IMAGE}
        alt={title}
        width={1920}
        height={1080}
        priority
        className="absolute inset-0 w-full h-full object-cover"
        sizes="100vw"
      />
      <div className="relative z-10 text-center text-white">
        <h1 className="text-5xl font-bold">{title}</h1>
        {description && <p className="mt-4 text-xl">{description}</p>}
      </div>
    </section>
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

Use a `[locale]` route segment with middleware to handle locale detection:

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const LOCALES = ['en', 'da'];
const DEFAULT_LOCALE = 'en';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if path already has a locale prefix
  const hasLocale = LOCALES.some(
    locale => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );
  if (hasLocale) return NextResponse.next();

  // Detect locale from Accept-Language header
  const acceptLang = request.headers.get('accept-language') ?? '';
  const preferred = LOCALES.find(l => acceptLang.includes(l)) ?? DEFAULT_LOCALE;

  // Redirect to locale-prefixed path
  return NextResponse.redirect(new URL(`/${preferred}${pathname}`, request.url));
}

export const config = {
  matcher: ['/((?!api|_next|uploads|images|favicon).*)'],
};
```

```typescript
// app/[locale]/blog/[slug]/page.tsx
import { getCollection, getDocument } from '@webhouse/cms/adapters';
import { notFound } from 'next/navigation';

interface Post { title: string; content: string }

const LOCALES = ['en', 'da'];

export function generateStaticParams() {
  const params: { locale: string; slug: string }[] = [];
  for (const locale of LOCALES) {
    const posts = getCollection<Post>('posts')
      .filter(p => p.locale === locale || (!p.locale && locale === 'en'));
    for (const post of posts) {
      params.push({ locale, slug: post.slug });
    }
  }
  return params;
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;

  // Try locale-specific document first, then fall back to source
  const post =
    getDocument<Post>('posts', `${slug}-${locale}`) ??
    getDocument<Post>('posts', slug);

  if (!post) notFound();

  return (
    <article>
      <h1>{post.data.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.data.content }} />
    </article>
  );
}
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

```typescript
// components/language-switcher.tsx
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  da: 'Dansk',
};

export function LanguageSwitcher({ locales = ['en', 'da'] }: { locales?: string[] }) {
  const pathname = usePathname();

  // Replace the locale segment in the current path
  function getLocalePath(targetLocale: string) {
    const segments = pathname.split('/');
    if (locales.includes(segments[1])) {
      segments[1] = targetLocale;
    } else {
      segments.splice(1, 0, targetLocale);
    }
    return segments.join('/');
  }

  return (
    <div className="flex gap-2">
      {locales.map(locale => (
        <Link
          key={locale}
          href={getLocalePath(locale)}
          className="text-sm underline-offset-4 hover:underline"
        >
          {LOCALE_LABELS[locale] ?? locale}
        </Link>
      ))}
    </div>
  );
}
```

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

### TipTap Shows Raw HTML Tags Instead of Formatted Text

**Cause:** HTML was stored in the richtext field instead of markdown. TipTap expects markdown input.

**Symptoms:** The editor displays `<h2>Title</h2>` as literal text instead of a heading.

**Fix:** Convert HTML to markdown before saving. Common conversions:
```
<h1>Title</h1>      → # Title
<h2>Title</h2>      → ## Title
<strong>bold</strong> → **bold**
<em>italic</em>      → *italic*
<a href="url">text</a> → [text](url)
<ul><li>item</li></ul> → - item
<p>text</p>          → text\n\n
```

If you have existing HTML content, use a library like `turndown` to batch-convert:
```typescript
import TurndownService from 'turndown';
const turndown = new TurndownService();
const markdown = turndown.turndown(htmlContent);
```

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

1. **On-demand revalidation via webhook:**
```typescript
// app/api/revalidate/route.ts
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-revalidation-secret');
  if (secret !== process.env.REVALIDATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { path } = await request.json();
  revalidatePath(path ?? '/');
  return NextResponse.json({ revalidated: true });
}
```

2. **Time-based revalidation:**
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

### Blocks Field Shows "No Sections Added"

**Cause:** The `blocks` field references block names that aren't defined in `config.blocks`, or no block types are defined at all.

**Fix:** Ensure your config defines blocks at the top level AND references them in the field:
```typescript
export default defineConfig({
  blocks: [
    defineBlock({ name: 'hero', fields: [ /* ... */ ] }),    // 1. Define blocks
    defineBlock({ name: 'features', fields: [ /* ... */ ] }),
  ],
  collections: [
    defineCollection({
      name: 'pages',
      fields: [
        { name: 'sections', type: 'blocks', blocks: ['hero', 'features'] },  // 2. Reference by name
      ],
    }),
  ],
});
```

### Upload Fails with "No File"

**Cause:** The FormData key must be `"file"` (singular).

**Fix:**
```typescript
// Correct
const formData = new FormData();
formData.append('file', file);   // "file" — singular

// Wrong
formData.append('files', file);  // Will return 400 "No file"
formData.append('upload', file); // Will return 400 "No file"
```

### AI Agents Return Empty Content

**Cause:** No AI provider API key is configured.

**Fix:**
1. Create a `.env` file in your project root:
```env
ANTHROPIC_API_KEY=sk-ant-...
# or
OPENAI_API_KEY=sk-...
```
2. Or configure via the admin UI: Admin, Settings, AI.
3. Verify the key works: `npx cms ai generate posts "Write a test post"`

### Relation Picker Shows Empty List

**Cause:** The referenced collection has no published documents.

**Fix:**
1. Check that the collection referenced in the relation field exists: `{ collection: 'team' }` requires a `team` collection.
2. Ensure at least one document in that collection has `status: "published"`.
3. Verify the collection name matches exactly (case-sensitive).

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
