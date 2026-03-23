<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Content Relationships

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
