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
