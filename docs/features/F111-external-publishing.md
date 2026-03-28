# F111 — External Publishing

> Publish CMS articles to Dev.to, Hashnode, Medium (draft), and LinkedIn with one click from admin UI. Platform adapter pattern with format conversion, image re-upload, canonical URL management, and analytics sync back to CMS.

## Problem

Articles written in `@webhouse/cms` live only on the CMS-powered site. To reach developer communities (Dev.to, Hashnode) or professional networks (LinkedIn, Medium), content must be manually copy-pasted, reformatted per platform, images re-uploaded, and tags adjusted. This is tedious enough that it usually doesn't happen — killing reach and discoverability.

Each platform has different requirements: Dev.to and Hashnode use markdown, Medium uses HTML, LinkedIn has a restricted HTML subset. Dev.to limits to 4 tags, Medium to 5. Medium's API only supports draft creation (user must click publish manually). Image URLs from the CMS CDN work on some platforms but not others.

There is no feedback loop — analytics (views, reactions, comments) stay siloed on each platform with no aggregated view in the CMS.

## Solution

An admin-side plugin that adds a "Distribute to platforms" panel in the article editor sidebar. Select target platforms, click publish, done. The orchestrator handles format conversion, image handling, and stores results in a local SQLite table. Analytics sync runs periodically via `cronjobs.webhouse.net`.

Key design decisions:

- **CMS is master** — platforms are distribution channels, not content sources
- **Canonical URL points to CMS site** — SEO value stays with the origin
- **Platform adapter pattern** — uniform interface, easy to add new platforms
- **No browser automation** — only official APIs (Medium = draft only, accepted limitation)
- **No MCP server** — publishing is triggered from admin UI, not from Claude Desktop
- **Complements F69** — F69 generates SoMe post drafts (FB/IG/LinkedIn/GBP) from content. F111 cross-posts entire articles to developer/writing platforms. Different audience, different format, no overlap.

## Technical Design

### 1. Platform Adapter Interface

```typescript
// src/external-publishing/types.ts

export interface PlatformAdapter {
  name: PlatformName;
  displayName: string;
  icon: string;                    // lucide-react icon name
  canPublishDirectly: boolean;     // false for Medium (draft only)

  validateCredentials(credentials: PlatformCredentials): Promise<boolean>;
  formatContent(article: CmsArticle): Promise<FormattedContent>;
  uploadImage?(buffer: Buffer, filename: string, mimeType: string): Promise<string>;
  publish(article: CmsArticle, options: PublishOptions): Promise<PublishResult>;
  update?(externalId: string, article: CmsArticle): Promise<PublishResult>;
  getAnalytics?(externalId: string): Promise<PlatformAnalytics>;
}

export type PlatformName = "devto" | "hashnode" | "medium" | "linkedin";

export interface CmsArticle {
  id: string;
  title: string;
  slug: string;
  content: string;              // Raw markdown from CMS editor
  excerpt?: string;
  tags: string[];
  coverImage?: { url: string; alt?: string; width?: number; height?: number };
  author: { name: string; email?: string };
  publishedAt?: Date;
  canonicalUrl?: string;
  language: string;
}

export interface PublishOptions {
  draft?: boolean;
  canonicalUrl?: string;
  series?: string;
}

export interface PublishResult {
  success: boolean;
  platform: PlatformName;
  externalId?: string;
  externalUrl?: string;
  status: "published" | "draft" | "failed";
  error?: string;
  publishedAt?: Date;
}

export interface FormattedContent {
  body: string;
  format: "markdown" | "html";
  images: { originalUrl: string; placeholder: string }[];
}

export interface PlatformAnalytics {
  views?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
  fetchedAt: Date;
}
```

### 2. Dev.to Adapter

```typescript
// src/external-publishing/adapters/devto.ts

export class DevtoAdapter implements PlatformAdapter {
  name = "devto" as const;
  displayName = "Dev.to";
  icon = "Code2";
  canPublishDirectly = true;

  private apiKey: string;
  private baseUrl = "https://dev.to/api";

  async validateCredentials(): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/users/me`, {
      headers: { "api-key": this.apiKey },
    });
    return res.ok;
  }

  async formatContent(article: CmsArticle): Promise<FormattedContent> {
    // Dev.to uses markdown natively — pass through
    const images = extractImageReferences(article.content);
    return { body: article.content, format: "markdown", images };
  }

  async publish(article: CmsArticle, options: PublishOptions): Promise<PublishResult> {
    const formatted = await this.formatContent(article);
    const res = await fetch(`${this.baseUrl}/articles`, {
      method: "POST",
      headers: { "api-key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        article: {
          title: article.title,
          body_markdown: formatted.body,
          published: !options.draft,
          tags: article.tags.slice(0, 4),  // Dev.to max 4 tags
          canonical_url: options.canonicalUrl || article.canonicalUrl,
          ...(article.coverImage && { main_image: article.coverImage.url }),
          ...(options.series && { series: options.series }),
        },
      }),
    });
    if (!res.ok) {
      return { success: false, platform: "devto", status: "failed", error: await res.text() };
    }
    const data = await res.json();
    return {
      success: true, platform: "devto",
      externalId: String(data.id), externalUrl: data.url,
      status: options.draft ? "draft" : "published",
      publishedAt: new Date(data.published_at),
    };
  }

  async update(externalId: string, article: CmsArticle): Promise<PublishResult> {
    const formatted = await this.formatContent(article);
    const res = await fetch(`${this.baseUrl}/articles/${externalId}`, {
      method: "PUT",
      headers: { "api-key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        article: { title: article.title, body_markdown: formatted.body, tags: article.tags.slice(0, 4) },
      }),
    });
    if (!res.ok) return { success: false, platform: "devto", status: "failed", error: await res.text() };
    const data = await res.json();
    return { success: true, platform: "devto", externalId: String(data.id), externalUrl: data.url, status: "published" };
  }

  async getAnalytics(externalId: string): Promise<PlatformAnalytics> {
    const res = await fetch(`${this.baseUrl}/articles/${externalId}`, { headers: { "api-key": this.apiKey } });
    const data = await res.json();
    return { views: data.page_views_count, reactions: data.positive_reactions_count, comments: data.comments_count, fetchedAt: new Date() };
  }
}
```

### 3. Hashnode Adapter

```typescript
// src/external-publishing/adapters/hashnode.ts

export class HashnodeAdapter implements PlatformAdapter {
  name = "hashnode" as const;
  displayName = "Hashnode";
  icon = "Hash";
  canPublishDirectly = true;

  private apiKey: string;
  private publicationId: string;
  private baseUrl = "https://gql.hashnode.com";

  async publish(article: CmsArticle, options: PublishOptions): Promise<PublishResult> {
    const mutation = `
      mutation PublishPost($input: PublishPostInput!) {
        publishPost(input: $input) { post { id url title publishedAt } }
      }
    `;
    const input = {
      title: article.title,
      slug: article.slug,
      contentMarkdown: article.content,
      publicationId: this.publicationId,
      tags: article.tags.map((t) => ({ slug: t.toLowerCase(), name: t })),
      ...(article.coverImage && { coverImageOptions: { coverImageURL: article.coverImage.url } }),
      ...(options.canonicalUrl && { originalArticleURL: options.canonicalUrl }),
      ...(article.excerpt && { subtitle: article.excerpt }),
    };
    const res = await this.graphql(mutation, { input });
    if (res.errors) {
      return { success: false, platform: "hashnode", status: "failed", error: res.errors[0]?.message };
    }
    const post = res.data.publishPost.post;
    return { success: true, platform: "hashnode", externalId: post.id, externalUrl: post.url, status: "published", publishedAt: new Date(post.publishedAt) };
  }

  async getAnalytics(externalId: string): Promise<PlatformAnalytics> {
    const query = `query Post($id: ObjectId!) { post(id: $id) { views reactionCount responseCount } }`;
    const res = await this.graphql(query, { id: externalId });
    const post = res.data.post;
    return { views: post.views, reactions: post.reactionCount, comments: post.responseCount, fetchedAt: new Date() };
  }

  private async graphql(query: string, variables?: Record<string, unknown>) {
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: { Authorization: this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    return res.json();
  }
}
```

### 4. Medium Adapter (Draft Only)

```typescript
// src/external-publishing/adapters/medium.ts

export class MediumAdapter implements PlatformAdapter {
  name = "medium" as const;
  displayName = "Medium";
  icon = "BookOpen";
  canPublishDirectly = false;  // ALWAYS draft — Medium API limitation

  private token: string;
  private baseUrl = "https://api.medium.com/v1";

  // NOTE: Medium stopped issuing new API tokens in 2023.
  // Existing tokens still work. New users cannot integrate.
  // The adapter always publishes as draft — user clicks publish in Medium UI.

  async publish(article: CmsArticle): Promise<PublishResult> {
    const meRes = await fetch(`${this.baseUrl}/me`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const me = await meRes.json();
    const userId = me.data.id;

    const html = markdownToHtml(article.content);
    const res = await fetch(`${this.baseUrl}/users/${userId}/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: article.title,
        contentFormat: "html",
        content: html,
        tags: article.tags.slice(0, 5),  // Medium max 5 tags
        canonicalUrl: article.canonicalUrl,
        publishStatus: "draft",  // ALWAYS draft
      }),
    });
    if (!res.ok) return { success: false, platform: "medium", status: "failed", error: await res.text() };
    const data = await res.json();
    return { success: true, platform: "medium", externalId: data.data.id, externalUrl: data.data.url, status: "draft", publishedAt: new Date() };
  }

  // Medium API has no analytics endpoint
  async getAnalytics(): Promise<PlatformAnalytics> {
    return { fetchedAt: new Date() };
  }
}
```

### 5. LinkedIn Adapter (Phase 2)

```typescript
// src/external-publishing/adapters/linkedin.ts

export class LinkedinAdapter implements PlatformAdapter {
  name = "linkedin" as const;
  displayName = "LinkedIn";
  icon = "Linkedin";
  canPublishDirectly = true;

  private accessToken: string;
  private authorUrn: string;  // "urn:li:person:xxx" or "urn:li:organization:xxx"

  // Uses UGC Posts API for article sharing
  // Requires r_liteprofile + w_member_social scopes
  // LinkedIn Articles API has restricted HTML subset:
  // p, h1-h3, ul, ol, li, strong, em, a, img, blockquote, pre, code

  async publish(article: CmsArticle, options: PublishOptions): Promise<PublishResult> {
    const body = {
      author: this.authorUrn,
      lifecycleState: options.draft ? "DRAFT" : "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: article.excerpt || article.title },
          shareMediaCategory: "ARTICLE",
          media: [{
            status: "READY",
            originalUrl: article.canonicalUrl,
            title: { text: article.title },
            description: { text: article.excerpt || "" },
          }],
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { success: false, platform: "linkedin", status: "failed", error: await res.text() };
    const postId = res.headers.get("x-restli-id") || "";
    return { success: true, platform: "linkedin", externalId: postId, externalUrl: `https://www.linkedin.com/feed/update/${postId}`, status: options.draft ? "draft" : "published", publishedAt: new Date() };
  }
}
```

### 6. Image Re-upload Service

```typescript
// src/external-publishing/services/image-reuploader.ts

/**
 * CMS CDN URLs are permanent (no expiry like Notion).
 * Dev.to and Hashnode accept external image URLs directly.
 * Only platforms requiring upload (LinkedIn) get re-upload treatment.
 */
export class ImageReuploader {
  async processImages(content: string, adapter: PlatformAdapter): Promise<string> {
    const imageUrls = this.extractImageUrls(content);
    let processed = content;

    for (const url of imageUrls) {
      if (adapter.uploadImage) {
        const { buffer, filename, mimeType } = await this.downloadImage(url);
        const platformUrl = await adapter.uploadImage(buffer, filename, mimeType);
        processed = processed.replaceAll(url, platformUrl);
      }
      // Otherwise keep CMS CDN URL (permanent)
    }
    return processed;
  }

  private extractImageUrls(content: string): string[] {
    const md = [...content.matchAll(/!\[.*?\]\((.*?)\)/g)].map((m) => m[1]);
    const html = [...content.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    return [...new Set([...md, ...html])];
  }

  private async downloadImage(url: string) {
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, filename: url.split("/").pop() || "image.jpg", mimeType: res.headers.get("content-type") || "image/jpeg" };
  }
}
```

### 7. Content Format Helpers

```typescript
// src/external-publishing/services/format.ts

import { marked } from "marked";

/** Markdown → HTML for Medium and LinkedIn */
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { gfm: true });
}

/** LinkedIn restricted HTML — strip unsupported tags */
export function markdownToLinkedInHtml(markdown: string): string {
  let html = markdownToHtml(markdown);
  html = html.replace(/<table[\s\S]*?<\/table>/g, "");
  html = html.replace(/<iframe[\s\S]*?<\/iframe>/g, "");
  return html;
}

export function extractImageReferences(content: string) {
  const refs: { originalUrl: string; placeholder: string }[] = [];
  const patterns = [/!\[([^\]]*)\]\(([^)]+)\)/g, /<img[^>]+src="([^"]+)"[^>]*>/g];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const url = match[2] || match[1];
      refs.push({ originalUrl: url, placeholder: `__IMG_${refs.length}__` });
    }
  }
  return refs;
}
```

### 8. Database Schema (Drizzle)

```typescript
// src/external-publishing/schema.ts

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const externalPublications = sqliteTable("external_publications", {
  id: text("id").primaryKey(),
  articleId: text("article_id").notNull(),
  platform: text("platform").notNull(),       // "devto" | "hashnode" | "medium" | "linkedin"
  externalId: text("external_id"),
  externalUrl: text("external_url"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  // Analytics (synced periodically)
  views: integer("views").default(0),
  reactions: integer("reactions").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  analyticsUpdatedAt: integer("analytics_updated_at", { mode: "timestamp" }),
});
```

### 9. Publish Orchestrator

```typescript
// src/external-publishing/orchestrator.ts

export async function publishToExternalPlatforms(
  articleId: string,
  platformNames: PlatformName[],
): Promise<PublishReport> {
  const article = await getArticle(articleId);
  const settings = await getPluginSettings("external-publishing");
  const imageReuploader = new ImageReuploader();
  const results: PublishResult[] = [];

  for (const platformName of platformNames) {
    const adapter = createAdapter(platformName, settings);
    if (!adapter) continue;

    try {
      const processedContent = await imageReuploader.processImages(article.content, adapter);
      const processedArticle = { ...article, content: processedContent };
      const canonicalUrl = settings.defaults.canonical_url_strategy === "cms"
        ? `${settings.siteUrl}/blog/${article.slug}`
        : article.canonicalUrl;

      const result = await adapter.publish(processedArticle, {
        draft: !adapter.canPublishDirectly,
        canonicalUrl,
      });

      await db.insert(externalPublications).values({
        id: crypto.randomUUID(),
        articleId,
        platform: platformName,
        externalId: result.externalId,
        externalUrl: result.externalUrl,
        status: result.status,
        error: result.error,
        publishedAt: result.publishedAt,
        updatedAt: new Date(),
      });

      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        platform: platformName,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { articleId, results, allSucceeded: results.every((r) => r.success), timestamp: new Date() };
}
```

### 10. Admin UI — Publishing Panel

Sidebar panel in article editor, visible when article status is "published":

- Platform checkboxes with enable/disable state from settings
- "draft only" badge on Medium
- Status badges + external links for already-published platforms
- Per-platform analytics (views, reactions, comments) below each entry
- Aggregated stats card at top

### 11. Analytics Sync via cronjobs.webhouse.net

```typescript
// API endpoint triggered by cronjobs.webhouse.net every N hours
// GET /api/cron/sync-external-analytics?secret=xxx

export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const articlesWithExternals = await db
    .selectDistinct({ articleId: externalPublications.articleId })
    .from(externalPublications)
    .where(and(ne(externalPublications.status, "failed"), isNotNull(externalPublications.externalId)));

  let synced = 0;
  for (const { articleId } of articlesWithExternals) {
    await syncExternalAnalytics(articleId);
    synced++;
  }

  return Response.json({ synced, timestamp: new Date().toISOString() });
}
```

### 12. Settings Schema

```typescript
// Plugin settings in admin Settings page
{
  platforms: {
    devto: { enabled: boolean, apiKey: secret, organizationId?: string },
    hashnode: { enabled: boolean, apiKey: secret, publicationId: string },
    medium: { enabled: boolean, token: secret },  // Legacy — info note about token freeze
    linkedin: { enabled: boolean, accessToken: secret, authorId: string },
  },
  defaults: {
    canonicalUrlStrategy: "cms" | "first_platform" | "custom",
    autoSyncAnalytics: boolean,
    analyticsSyncIntervalHours: number,
  },
}
```

## Impact Analysis

### Files affected

**New files:**
- `src/external-publishing/` — entire module directory (~15 files)
- `src/external-publishing/types.ts` — core interfaces
- `src/external-publishing/adapters/devto.ts` — Dev.to adapter
- `src/external-publishing/adapters/hashnode.ts` — Hashnode adapter
- `src/external-publishing/adapters/medium.ts` — Medium adapter (Phase 2)
- `src/external-publishing/adapters/linkedin.ts` — LinkedIn adapter (Phase 2)
- `src/external-publishing/services/image-reuploader.ts` — image handling
- `src/external-publishing/services/format.ts` — markdown/HTML conversion
- `src/external-publishing/schema.ts` — Drizzle table
- `src/external-publishing/orchestrator.ts` — publish coordinator
- `src/external-publishing/components/ExternalPublishingPanel.tsx` — sidebar UI
- `src/external-publishing/components/ExternalAnalytics.tsx` — stats display
- `packages/cms-admin/src/app/api/cron/sync-external-analytics/route.ts` — cron endpoint

**Modified files:**
- Article editor layout — add `<ExternalPublishingPanel />` in sidebar
- Settings page — add External Publishing configuration section
- Database migrations — add `external_publications` table

### Downstream dependents

Article editor sidebar is additive — no existing components affected. Settings page uses existing settings infrastructure. Drizzle migration is additive.

### Blast radius

- **Low** — entirely new module, no modifications to existing content pipeline
- Platform API failures are isolated per-platform (parallel publish with error isolation)
- Medium adapter requires legacy token — info note in settings UI
- LinkedIn OAuth token refresh needs periodic attention

### Breaking changes

None.

### Test plan

- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Dev.to: publish article → verify on dev.to → analytics sync back
- [ ] Hashnode: publish article → verify on hashnode → analytics sync back
- [ ] Medium: publish → verify draft created (not published) → info message shown
- [ ] Cover images from CMS CDN display correctly on all platforms
- [ ] Canonical URL points to CMS site
- [ ] Failure in one platform does not block others
- [ ] Settings validation: invalid API key → clear error message
- [ ] Re-publish (update) works for Dev.to and Hashnode
- [ ] Cron analytics sync endpoint works with valid secret
- [ ] Regression: article editor renders correctly with panel

## Implementation Steps

### Phase 1 — Foundation (3-4 days)
1. Define core interfaces (PlatformAdapter, PublishResult, etc.)
2. Implement Dev.to adapter (publish + update + analytics)
3. Implement Hashnode adapter (publish + analytics via GraphQL)
4. Build publish orchestrator with error isolation
5. Create Drizzle schema + migration for `external_publications`
6. Build admin UI: ExternalPublishingPanel sidebar component
7. Settings page: platform credentials configuration
8. Canonical URL strategy implementation

### Phase 2 — Expand (2-3 days)
9. Medium adapter (draft only, legacy token info note)
10. LinkedIn adapter (UGC Posts API, article sharing)
11. Image re-upload service for platforms requiring it
12. Analytics dashboard (aggregated per article)
13. Cron endpoint for analytics sync via cronjobs.webhouse.net

### Phase 3 — Intelligence (2-3 days)
14. AI pre-publish check via `@webhouse/cms-ai` (title, tags, excerpt quality)
15. Auto-tag suggestions per platform (Dev.to max 4, Medium max 5)
16. Update/re-publish flow for already-distributed articles
17. Content scheduling (publish at specific time via F47 integration)

### Phase 4 — Advanced (future)
18. WordPress adapter (REST API)
19. Ghost adapter
20. Cross-post analytics dashboard in CMS admin
21. Bulk publish (multiple articles to multiple platforms)
22. Voice integration: "Publicér min seneste artikel til Dev.to og Hashnode" (F105)


> **NOTE — F107 Chat Integration:** When this feature introduces new API routes, tools, or admin actions, ensure they are also exposed as tool-use functions in F107 (Chat with Your Site). The chat interface must be able to perform any action the traditional admin UI can. See `docs/features/F107-chat-with-your-site.md`.

## Dependencies

- **F46 — Plugin System** — for `registerPlugin()` lifecycle (can start without — inline in cms-admin initially)
- **F47 — Content Scheduling** — for scheduled external publishing (Phase 3)
- **F69 — Social Media Plugin** — complementary, not dependent. F69 = SoMe post drafts, F111 = full article cross-posting
- `cronjobs.webhouse.net` — for periodic analytics sync
- `marked` — markdown to HTML conversion (already in project dependencies)

## Open Questions

1. **Medium token availability** — do we (WebHouse) have an existing legacy token? If not, Medium adapter is unusable for new setups.
2. **LinkedIn OAuth flow** — token expires in 60 days. Build refresh flow in Phase 2 or manual re-auth?
3. **Substack** — no public API currently. Monitor for future adapter.
4. **Rate limits** — Dev.to: 30 req/30s. Hashnode: standard GraphQL. Add retry with exponential backoff?
5. **File location** — implement inside `packages/cms-admin/` initially, or create standalone `packages/cms-plugin-publishing/`?

## Effort Estimate

**Medium** — 7-10 days

- Phase 1 (Foundation + Dev.to + Hashnode): 3-4 days
- Phase 2 (Medium + LinkedIn + analytics): 2-3 days
- Phase 3 (AI checks + scheduling): 2-3 days
