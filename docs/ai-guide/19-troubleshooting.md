<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Troubleshooting

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
