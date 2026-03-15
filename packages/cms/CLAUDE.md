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
