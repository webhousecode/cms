<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# SEO Patterns

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
