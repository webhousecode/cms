<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Next.js Patterns

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
