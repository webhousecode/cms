<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-24 -->

# Storage Adapters

## Storage Adapters

> **CRITICAL: You MUST always specify `storage` in `cms.config.ts`.** If omitted, the CMS defaults to **SQLite** — NOT filesystem. This means content created in the admin UI is stored in a SQLite database (`.cms/content.db`), while `build.ts` reads from `content/` JSON files. The two systems become completely disconnected: edits in the admin UI won't appear on the site, and seed content files won't appear in the admin UI.

### Filesystem (recommended for static sites)
Stores documents as JSON files in `content/<collection>/<slug>.json`. **Required for static sites with `build.ts`.** Best for Git-based workflows.

```typescript
// ALWAYS include this in cms.config.ts for static sites
storage: {
  adapter: 'filesystem',
  filesystem: { contentDir: 'content' },
}
```

### GitHub
Reads and writes JSON files directly via the GitHub API. Each create/update/delete is a commit.

```typescript
storage: {
  adapter: 'github',
  github: {
    owner: 'your-org',
    repo: 'your-repo',
    branch: 'main',              // Default: 'main'
    contentDir: 'content',       // Default: 'content'
    token: process.env.GITHUB_TOKEN!,
  },
}
```

### SQLite
Stores documents in a local SQLite database. Useful for API-heavy use cases.

```typescript
storage: {
  adapter: 'sqlite',
  sqlite: { path: './data/cms.db' },  // Optional, has a default path
}
```
