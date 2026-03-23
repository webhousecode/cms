<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Storage Adapters

## Storage Adapters

### Filesystem (default)
Stores documents as JSON files in `content/<collection>/<slug>.json`. Best for Git-based workflows.

```typescript
storage: {
  adapter: 'filesystem',
  filesystem: { contentDir: 'content' },  // Default: 'content'
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
