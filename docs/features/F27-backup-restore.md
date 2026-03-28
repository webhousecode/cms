# F27 — Backup & Restore

> Automated content backup with scheduled snapshots, point-in-time restore, and config preservation.

## Status: In Progress

**Done:**
- Backup creation (zip with all content + `_data/`)
- Backup scheduling (daily/weekly via tools-scheduler, iterates all sites)
- Backup manifest with snapshot metadata
- Backup pruning (retention-based)
- Filesystem restore (unzip → overwrite content + _data)
- Webhook notifications on backup completion/failure (F13)
- Backup download API
- Settings UI (schedule, retention, webhooks)
- `cms.config.ts` included in backup (filesystem sites: raw file, GitHub sites: JSON schema snapshot)
- Feature markers on snapshots (`i18n`, `webhooks`, `deploy`) for restore compatibility

**Remaining:**
- GitHub-backed site restore (content lives in repo, not local filesystem)
- Restore UI improvements (collection selector, dry-run preview)
- Pre-destructive auto-backup (before trash purge, bulk delete)

## What Gets Backed Up

Each snapshot is a zip containing:
```
{sitename}_{date}_{id}.zip
  cms.config.ts              # Site schema (filesystem sites)
  cms.config.json            # Site schema as JSON (GitHub sites)
  content/
    {collection}/
      {slug}.json            # Full document incl. locale, translationOf, translationGroup
      ...
  _data/
    site-config.json         # Settings incl. defaultLocale, locales, webhooks, deploy config
    media-meta.json          # Media metadata
    interactives.json        # Interactives (incl. locale fields)
    agents/                  # Agent configs
    brand-voice.json         # Brand voice
    ...
```

Excluded: `backups/` (self), `user-state/` (ephemeral)

## i18n Compatibility (F48)

Backups taken after F48 include:
- Documents with `locale`, `translationOf`, `translationGroup` fields
- `site-config.json` with `defaultLocale`, `locales`, `localeStrategy`
- `cms.config.ts` with collection-level `sourceLocale` settings
- Interactives with locale/translationOf

**Restoring a pre-i18n backup:** Documents will lack locale fields. CMS defaults to `defaultLocale: "en"`. Translation relationships won't exist. The `features` array on the snapshot will NOT contain `"i18n"`, which the restore UI can use to warn the user.

**Restoring an i18n backup:** Full locale state is preserved including all translation links and config.

## Technical Design

### BackupSnapshot Interface

```typescript
interface BackupSnapshot {
  id: string;
  timestamp: string;
  trigger: "manual" | "scheduled";
  sizeBytes: number;
  documentCount: number;
  collections: Record<string, number>;
  fileName: string;
  status: "creating" | "complete" | "failed";
  error?: string;
  features?: string[];  // e.g. ["i18n", "webhooks", "deploy"]
}
```

### API Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `POST` | `/api/admin/backups` | Create backup | Done |
| `GET` | `/api/admin/backups` | List snapshots | Done |
| `POST` | `/api/admin/backups/[id]/restore` | Restore from snapshot | Done (filesystem only) |
| `GET` | `/api/admin/backups/[id]/download` | Download zip | Done |
| `DELETE` | `/api/admin/backups/[id]` | Delete snapshot | Done |

### GitHub Restore (TODO)

For GitHub-backed sites, restore needs to:
1. Unzip backup to temp directory
2. For each document in `content/`, use GitHub API to create/update the file in the repo
3. Restore `_data/` to local cache directory
4. Optionally restore `cms.config.ts` via GitHub API (with user confirmation — schema changes are dangerous)

## Impact Analysis

### Files affected
- `packages/cms-admin/src/lib/backup-service.ts` — backup creation + restore
- `packages/cms-admin/src/app/api/admin/backups/route.ts` — API routes
- `packages/cms-admin/src/lib/tools-scheduler.ts` — scheduled backups + webhook dispatch

### Breaking changes
- None. New `features` field on BackupSnapshot is optional.

## Test Plan
- [ ] Backup includes cms.config.ts for filesystem sites
- [ ] Backup includes cms.config.json for GitHub sites
- [ ] Backup snapshot has features array with correct flags
- [ ] Restore preserves locale/translationOf fields on documents
- [ ] Restore preserves site-config.json locale settings
- [ ] Restore of pre-i18n backup works (documents lack locale fields, CMS defaults apply)
- [ ] TypeScript compiles: `npx tsc --noEmit`

## Dependencies
- F48 (i18n) — backup must capture locale state
- F13 (Notification Channels) — webhook dispatch on backup completion (done)

## Effort Estimate
**Remaining:** Small — 1 day for GitHub restore, 0.5 day for pre-destructive auto-backup.

---

> **Testing (F99):** This feature MUST include tests using the [F99 Test Infrastructure](F99-e2e-testing-suite.md).
