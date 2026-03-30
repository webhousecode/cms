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

---

## Instant Content Deployment (ICD)

ICD lets the CMS push content changes directly to a deployed Next.js site via a signed webhook, bypassing full Docker rebuilds. Content updates arrive in ~2 seconds.

This only works for **Next.js SSR sites with a persistent filesystem** (Fly.io with volumes, self-hosted Docker). Static export sites (Vercel, Netlify, GitHub Pages) require a full rebuild.

### Setup

**1. Create `app/api/revalidate/route.ts`:**

```typescript
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const SECRET = process.env.REVALIDATE_SECRET;
const CONTENT_DIR = process.env.CONTENT_DIR ?? join(process.cwd(), "content");

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-cms-signature");
  const body = await request.text();

  if (SECRET) {
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    const expected =
      "sha256=" +
      crypto.createHmac("sha256", SECRET).update(body).digest("hex");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const payload = JSON.parse(body) as {
    paths?: string[];
    collection?: string;
    slug?: string;
    action?: string;
    document?: Record<string, unknown> | null;
  };

  if (payload.collection && payload.slug) {
    const filePath = join(CONTENT_DIR, payload.collection, `${payload.slug}.json`);
    if (payload.action === "deleted") {
      if (existsSync(filePath)) unlinkSync(filePath);
    } else if (payload.document) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(payload.document, null, 2), "utf-8");
    }
  }

  const paths: string[] = payload.paths ?? ["/"];
  for (const p of paths) {
    revalidatePath(p);
  }

  return NextResponse.json({
    revalidated: true,
    paths,
    collection: payload.collection,
    slug: payload.slug,
    timestamp: new Date().toISOString(),
  });
}
```

**2. Set the environment variable on the deployed site:**

```bash
openssl rand -hex 32
# Set the output as REVALIDATE_SECRET in your deployment environment
```

**3. Configure CMS admin site registry:**

In CMS admin Site Settings, add `revalidateUrl` and `revalidateSecret` to the site entry:

```json
{
  "revalidateUrl": "https://your-site.fly.dev/api/revalidate",
  "revalidateSecret": "<same-secret-as-REVALIDATE_SECRET>"
}
```

The CMS will send content changes as signed POST requests. If the webhook fails, deployment falls back to a full Docker build.
