# F03 — WordPress Migration

> Automated WordPress-to-CMS migration via WP REST API or XML export.

## Problem

WordPress is the most common CMS to migrate from. Users need a guided, automated way to bring over posts, pages, media, categories, tags, and users — with content transformation from Gutenberg blocks to CMS format — while preserving URL structure for SEO.

## Solution

A WordPress migration wizard that connects to a WP site via its REST API (or parses a WXR XML export), fetches all content, transforms it into CMS documents, downloads media, and generates URL redirect mappings.

## Technical Design

### Data Models

```typescript
// packages/cms-admin/src/lib/wp-migration.ts

export interface WpMigrationConfig {
  source: { type: 'api'; url: string; username?: string; appPassword?: string }
        | { type: 'xml'; filePath: string };
  importPosts: boolean;
  importPages: boolean;
  importMedia: boolean;
  importCategories: boolean;
  importTags: boolean;
  importUsers: boolean;
  postCollection: string;   // target CMS collection for posts
  pageCollection: string;   // target CMS collection for pages
  mediaDir: string;          // e.g. "public/uploads"
}

export interface WpMigrationProgress {
  id: string;
  status: 'fetching' | 'transforming' | 'importing' | 'done' | 'failed';
  postsTotal: number;
  postsImported: number;
  pagesTotal: number;
  pagesImported: number;
  mediaTotal: number;
  mediaDownloaded: number;
  redirects: Array<{ from: string; to: string }>;
  errors: Array<{ type: string; id: number; message: string }>;
}
```

### Content Transformation

Gutenberg blocks (`<!-- wp:paragraph -->`) are converted:
- `wp:paragraph` -> Markdown paragraph
- `wp:heading` -> `# / ## / ###`
- `wp:image` -> `![alt](local-path)` (after media download)
- `wp:list` -> Markdown list
- `wp:code` -> fenced code block
- `wp:quote` -> blockquote
- Complex blocks -> raw HTML fallback

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/wp-migrate/connect` | Test WP API connection |
| `POST` | `/api/admin/wp-migrate/analyze` | Fetch content counts |
| `POST` | `/api/admin/wp-migrate/start` | Begin migration |
| `GET` | `/api/admin/wp-migrate/status/[id]` | Poll progress |

### Key Components

- `packages/cms-admin/src/lib/wp-migration.ts` — Core migration logic
- `packages/cms-admin/src/lib/wp-block-transform.ts` — Gutenberg to Markdown converter
- `packages/cms-admin/src/app/admin/settings/wp-migrate/page.tsx` — Migration wizard UI
- Step 1: Enter WP URL or upload WXR file
- Step 2: Select what to import, map to collections
- Step 3: Review content counts and start migration
- Step 4: Progress display with redirect map download

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/wp-migration.ts` — new WordPress migration logic
- `packages/cms-admin/src/lib/wp-block-transform.ts` — new Gutenberg block parser
- `packages/cms-admin/src/app/api/admin/wp-migrate/` — new API routes (connect, analyze, start, status)
- `packages/cms-admin/src/app/admin/settings/wp-migrate/page.tsx` — new migration wizard UI
- `packages/cms-admin/package.json` — add `fast-xml-parser` dependency

### Blast radius
- Batch document creation — same concern as F02
- Media download could fill disk on large WordPress sites

### Breaking changes
- None

### Test plan
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] WP REST API connection test succeeds against a test WP site
- [ ] Gutenberg block transformation produces valid Markdown
- [ ] Media files downloaded and URLs rewritten in content
- [ ] Redirect map generated correctly

## Implementation Steps

1. Create `packages/cms-admin/src/lib/wp-block-transform.ts` with Gutenberg block parser
2. Create `packages/cms-admin/src/lib/wp-migration.ts` with `connectWp()`, `analyzeWp()`, `migrateWp()`
3. Implement WP REST API client (paginated fetch of `/wp-json/wp/v2/posts`, `/pages`, `/media`, `/categories`, `/tags`, `/users`)
4. Implement WXR XML parser as fallback (use `fast-xml-parser`)
5. Build media downloader that fetches images and rewrites URLs in content
6. Create API routes at `packages/cms-admin/src/app/api/admin/wp-migrate/`
7. Build 4-step migration wizard UI
8. Generate `redirects.json` mapping old WP URLs to new CMS URLs (for Next.js `next.config.js` redirects)

## Dependencies

- F02 (Import Engine) — shares the batch document creation pattern, but can be built independently

## Effort Estimate

**Large** — 5-7 days
