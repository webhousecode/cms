<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Deployment Checklist

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

---

## Instant Content Deployment (ICD)

ICD pushes content changes to deployed Next.js sites via a signed webhook instead of triggering a full Docker rebuild. Typical latency: **~2 seconds** vs ~73 seconds for a full deploy.

ICD only applies to **Next.js / SSR sites** with a persistent filesystem (e.g., Fly.io with volumes, self-hosted Docker). It does not apply to static builds (Vercel, Netlify, GitHub Pages) where content is baked at build time.

### How it works

1. User saves content in CMS admin
2. CMS sends the document JSON as an HMAC-SHA256 signed POST to the site's `/api/revalidate` endpoint
3. The endpoint writes the document to disk and calls `revalidatePath()`
4. Next.js serves fresh content on the next request
5. Full Docker deploy is skipped when the revalidation webhook succeeds

### 1. Add the `/api/revalidate` endpoint to your site

Create `app/api/revalidate/route.ts`:

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

### 2. Set the environment variable on the deployed site

Generate a secret and set it as an environment variable:

```bash
# Generate secret
openssl rand -hex 32

# Set on Fly.io
fly secrets set REVALIDATE_SECRET=<generated-secret>

# Or in .env for Docker
REVALIDATE_SECRET=<generated-secret>
```

### 3. Configure CMS admin (site registry)

In the CMS admin Site Settings, set these fields on the site registry entry:

```json
{
  "revalidateUrl": "https://your-site.fly.dev/api/revalidate",
  "revalidateSecret": "<same-secret-as-REVALIDATE_SECRET>"
}
```

### When ICD is used vs full deploy

| Scenario | What happens |
|---|---|
| Content save (create/update/delete) | ICD webhook fires, ~2s |
| Config change, code change, dependency update | Full Docker deploy required |
| Webhook fails (site down, auth error) | CMS falls back to full deploy |
