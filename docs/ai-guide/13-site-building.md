<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Site Building

## Content Architecture (IMPORTANT)

**Use `blocks` for content-rich pages.** Don't default to flat `text`/`textarea` fields for everything. A blog post with just `{ name: 'content', type: 'richtext' }` is limiting — editors can't insert images with captions, code snippets with syntax highlighting, pull quotes, or videos between paragraphs.

Instead, use a `blocks` field with content blocks (text-block, image-block, quote-block, code-block, video-block, gallery-block). This gives editors a visual block editor where they compose content from reusable sections.

**Fetch `04-blocks.md` for the full block system guide with examples.**

| Pattern | When to use |
|---------|-------------|
| `type: 'blocks'` with content blocks | Blog posts, articles, case studies, documentation |
| `type: 'blocks'` with page sections | Landing pages, marketing pages, portfolios |
| `type: 'richtext'` | Simple text-only content, comments, bios |
| Flat `text`/`textarea` fields | Data entry: name, email, phone, price |

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

4. **`build.ts` MUST use `BASE_PATH` for all internal links.** The CMS deploys static sites to GitHub Pages project repos where the site lives under a subpath (e.g. `username.github.io/repo-name/`). All internal `href` attributes must be prefixed with `BASE`:
   ```typescript
   // Add near the top of build.ts, after __dirname
   const BASE = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');

   // Then use BASE in all internal links:
   `<a href="${BASE}/">Home</a>`
   `<a href="${BASE}/blog/${post.slug}/">Read more</a>`
   `<a href="${BASE}/about/">About</a>`
   ```
   When `BASE_PATH` is not set (local preview), links work as `/blog/...`. When deployed to GitHub Pages, the CMS passes `BASE_PATH=/repo-name` automatically. **Never hardcode absolute paths like `href="/blog/"` — always use `${BASE}/blog/`.**

5. **`build.ts` MUST use `BUILD_OUT_DIR` for the output directory.** The CMS uses `dist/` for preview and `deploy/` for deployment (which may have different `BASE_PATH`). The output directory must be configurable:
   ```typescript
   const DIST = join(__dirname, process.env.BUILD_OUT_DIR ?? 'dist');
   ```
   Default is `dist/` (preview-ready, root paths). The CMS deploy service passes `BUILD_OUT_DIR=deploy` when building for GitHub Pages. **Never hardcode `'dist'` as the output directory.**

6. **Static sites MUST have a `pages` collection** with at least `home.json`. This is the minimum for the site to show meaningful content in the admin UI. Other typical pages: `about.json`, `contact.json`.

5. **Collection name = directory name.** If your collection is named `work` in the config, the directory must be `content/work/`. If it's named `blogPosts`, the directory must be `content/blogPosts/`.

### Verification checklist

Before considering a site complete, verify:
- [ ] Every collection in `cms.config.ts` has JSON files in `content/<name>/`
- [ ] Every JSON file has `slug`, `status: "published"`, and `data` with the correct fields
- [ ] `build.ts` reads all content from JSON files (no hardcoded content strings)
- [ ] `build.ts` uses `BASE` variable for all internal links (never hardcoded `/path`)
- [ ] `build.ts` uses `BUILD_OUT_DIR` env var for output directory (never hardcoded `'dist'`)
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
