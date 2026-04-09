# hugo-blog — @webhouse/cms consumer example

Hugo reading @webhouse/cms JSON content via a small Go sync script that converts the structured JSON to Hugo's markdown + TOML front matter format.

**Stack:** Hugo (extended) · Go sync script · No runtime dependencies

## Why a sync script?

Hugo is opinionated about its content format — markdown files with YAML/TOML front matter, organized by section. @webhouse/cms uses a richer JSON model with separate `data` fields for title, excerpt, content, tags, author. The 100-line `scripts/sync-content.go` bridges the two without losing fidelity.

CMS admin writes the JSON in `_webhouse-content/posts/`. The sync script regenerates `content/posts/*.md` (English) and `content-da/posts/*.md` (Danish). Hugo then builds as normal.

## Quick start

```bash
cd examples/consumers/hugo-blog
go run scripts/sync-content.go    # Sync JSON → markdown
hugo serve                         # Start Hugo dev server
```

Open http://localhost:1313 (EN) or http://localhost:1313/da/ (DA).

### Watch mode

```bash
# Terminal 1 — re-sync on JSON changes
fswatch -o _webhouse-content | xargs -n1 -I{} go run scripts/sync-content.go

# Terminal 2 — Hugo dev server with live reload
hugo serve
```

## How it works

```
_webhouse-content/posts/      ← @webhouse/cms JSON (source of truth)
  hello-world.json
  hello-world-da.json
content/posts/                ← Hugo markdown (generated from JSON)
content-da/posts/             ← Hugo Danish markdown (generated)
scripts/sync-content.go       ← The bridge (~100 LOC)
hugo.toml                     ← Hugo config with EN + DA languages
layouts/
  _default/baseof.html        ← Shared layout with brand from hugo.toml
  _default/single.html        ← Single post template
  index.html                  ← Home page
```

## Production

```bash
go run scripts/sync-content.go
hugo --minify
```

Static output in `public/` — deploy anywhere (Cloudflare Pages, Netlify, S3).

## Connecting CMS admin

1. Register this folder as a site in CMS admin → Frameworks
2. **Config path:** absolute path to this folder's `cms.config.ts`
3. **Content directory:** absolute path to `_webhouse-content/` (NOT `content/`)
4. Edit content in CMS admin → run sync script → reload Hugo

## Related

- **F125** — Framework-Agnostic Content Platform
