# F102 — Schema Drift Detection

**Status:** Planned
**Size:** Small-Medium
**Tier:** 1 (v1.0 — Launch)
**Created:** 2026-03-25

## Problem

When `cms.config.ts` is edited (by a developer or AI), fields can be accidentally removed from a collection. The content data in JSON files still contains those fields, but the admin UI only renders fields defined in the schema — making the content invisible and uneditable. This is silent data loss.

**Real incident:** On 2026-03-19, a Claude session renaming the `global` collection to `globals` accidentally stripped all Posts fields in webhouse-site down to just `title`. The damage went unnoticed for 6 days.

## Solution

Detect schema drift at site load time by comparing the schema definition against actual content data.

### Phase 1 — Admin UI Warning Banner (Small)

When a site loads in CMS admin:

1. For each collection, sample the first 5 documents from storage
2. Collect all unique `data.*` keys across those documents (excluding system keys like `_lastEditedBy`, `_trashedAt`)
3. Compare against the field names in `cms.config.ts`
4. If any content keys exist that are NOT in the schema → show a warning banner:

```
⚠ Schema drift detected in "Posts": 8 fields found in content but missing from schema
  (excerpt, content, date, author, category, readTime, tags, attribution)
  These fields exist in your content but are not visible in the editor.
  → Edit Schema  → Dismiss
```

**Banner behavior:**
- Yellow warning banner at the top of the collection list view
- "Edit Schema" opens the schema editor (F-existing) or shows the cms.config.ts path
- "Dismiss" hides for this session (localStorage) — but reappears on next load
- Does NOT block editing — purely informational

### Phase 2 — CLI Validation (Small)

Add to the existing `cms validate` command (or create one):

```bash
npx cms validate
# ✓ posts: 10 fields in schema, 10 fields in content — OK
# ⚠ posts: 8 fields in content missing from schema: excerpt, content, date, ...
# ✓ pages: 28 fields in schema, 28 fields in content — OK
```

### Phase 3 — Pre-commit Hook (Optional)

A CC hook or git pre-commit that runs `cms validate` and blocks commits that reduce field count in cms.config.ts without an explicit `--allow-schema-reduction` flag.

## Implementation Notes

- Sampling 5 docs is enough — field drift affects all docs equally
- Skip keys starting with `_` (system metadata)
- The check should be fast (<100ms) since it's just comparing key sets
- Don't warn about extra schema fields (fields in schema but not yet in content) — that's normal for newly added fields
- Store drift state in memory (site-pool level) so it's checked once per site load, not per request

## Files to Modify

- `packages/cms-admin/src/app/api/cms/[collection]/route.ts` — add drift check to GET
- `packages/cms-admin/src/components/collection/` — warning banner component
- `packages/cms/src/content/service.ts` — `detectDrift(collection)` utility method
- `packages/cms-cli/` — `cms validate` command (Phase 2)

## Priority

High — this is a data integrity guardrail. Should ship before v1.0.
