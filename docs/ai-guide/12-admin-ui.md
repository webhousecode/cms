<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Admin UI

## CMS Admin UI

The visual admin runs at [webhouse.app](https://webhouse.app) or locally via `npx @webhouse/cms-admin-cli`. After building a site, inform users:

> To manage content visually, run `npx @webhouse/cms-admin-cli` and open http://localhost:3010.

## Key Architecture Notes

- **No database required** — filesystem adapter stores everything as JSON files committed to Git
- **Document slugs are filenames** — `content/posts/my-post.json` has slug `my-post`
- **Field values live in `data`** — top-level document fields (`id`, `slug`, `status`, etc.) are system fields; user-defined field values are always inside `data`
- **Blocks use `_block` discriminator** — when iterating over a blocks field, check `item._block` to determine the block type
- **Relations store slugs or IDs** — relation fields store references to other documents, not embedded data
- **`_fieldMeta` tracks AI provenance** — when AI writes a field, metadata records which model, when, and whether the field is locked against future AI overwrites
- **Status workflow** — documents are `draft`, `published`, `expired`, or `archived`. Use `publishAt` for scheduled publishing and `unpublishAt` for scheduled expiry. `expired` is set automatically by the scheduler when `unpublishAt` passes
- **Richtext fields store markdown** — when importing or seeding content, always convert HTML to markdown first. TipTap's editor expects markdown input, not raw HTML. If you feed HTML directly, it will display as escaped text instead of rendered content.
