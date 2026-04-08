<!-- @webhouse/cms ai-guide v0.4.0 — last updated 2026-04-09 -->

# Framework-Agnostic Consumers

@webhouse/cms is **not a TypeScript-only CMS**. The content layer is universal: flat JSON files in `content/<collection>/<slug>.json` that can be read by **any** language. The TypeScript admin UI and `cms.config.ts` define the *schema*; non-TS frameworks consume the *data* via thin reader libraries.

This module explains the consumer pattern and the **mandatory schema re-export rule** every AI agent must follow when modifying `cms.config.ts` in a project that has non-TS consumers.

## Supported consumer frameworks

| Stack | Language | Reader location | Reference example |
|-------|----------|----------------|-------------------|
| Next.js / Astro / SvelteKit | TypeScript | `@webhouse/cms` (npm) | `examples/static/cmsdemo/` |
| Spring Boot | Java 21+ | `app.webhouse:cms-reader` (Maven, planned) | `examples/consumers/java-spring-blog/` |
| ASP.NET Core | C# / .NET 9+ | `Webhouse.Cms.Reader` (NuGet, planned) | `examples/consumers/dotnet-blog/` |
| Laravel | PHP 8.1+ | `webhouse/cms-reader` (Packagist, planned) | `examples/consumers/laravel-blog/` (Phase 3) |
| Django / FastAPI | Python 3.10+ | `webhouse-cms-reader` (PyPI, planned) | `examples/consumers/django-blog/` (Phase 3) |
| Rails / Jekyll | Ruby 3.1+ | `webhouse_cms` (RubyGems, planned) | `examples/consumers/rails-blog/` (Phase 3) |
| Hugo / Gin | Go 1.22+ | `github.com/webhousecode/cms-reader-go` (planned) | `examples/consumers/go-gin/` (Phase 3) |

Every reader exposes the same 3-function API:

```
collection(name, locale?)              → list of documents
document(collection, slug)              → single document or null
findTranslation(doc, collection)        → sibling via translationGroup
```

## The schema bridge: webhouse-schema.json

Non-TypeScript runtimes can't execute `cms.config.ts`. Instead, the CMS exports a **JSON Schema document** (`webhouse-schema.json`) that describes the content model in a language-agnostic format:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Webhouse Content Schema",
  "x-webhouse-version": "0.3.0",
  "x-generated-at": "2026-04-09T00:00:00Z",
  "$defs": { "Document": { ... } },
  "collections": {
    "posts": {
      "allOf": [{ "$ref": "#/$defs/Document" }],
      "x-webhouse-collection": {
        "name": "posts",
        "label": "Blog Posts",
        "kind": "page",
        "urlPrefix": "/blog",
        "translatable": true
      },
      "properties": {
        "data": {
          "type": "object",
          "required": ["title"],
          "properties": {
            "title":   { "type": "string", "x-webhouse-field-type": "text" },
            "content": { "type": "string", "contentMediaType": "text/markdown", "x-webhouse-field-type": "richtext" },
            "tags":    { "type": "array", "items": { "type": "string" }, "x-webhouse-field-type": "tags" }
          }
        }
      }
    }
  }
}
```

The `x-webhouse-*` extension keywords let reader libs render appropriately — JSON Schema has no native concept of "richtext" or "tags".

## **HARD RULE: Re-export after every cms.config.ts change**

**Whenever you add, remove, rename, or change a field in `cms.config.ts`, you MUST regenerate `webhouse-schema.json` and commit it.** Otherwise the reader libraries will be out of sync with the actual content shape — type checks will fail, fields will be missing, validation will pass invalid documents.

### When to re-export

| Change to cms.config.ts | Re-export required? |
|---|---|
| Add a new collection | ✅ YES |
| Remove a collection | ✅ YES |
| Add a field to an existing collection | ✅ YES |
| Remove a field | ✅ YES (and warn the user — silent data loss risk) |
| Rename a field | ✅ YES |
| Change a field type (text → richtext) | ✅ YES |
| Change a field's `required` flag | ✅ YES |
| Add a new block | ✅ YES (if blocks are referenced from schema) |
| Change `urlPrefix`, `kind`, `description` | ✅ YES (these are in `x-webhouse-collection` metadata) |
| Update `defaultLocale`, `locales` | Recommended |
| Edit a content JSON file | ❌ No (schema describes shape, not data) |

### How to re-export

There are three ways. Pick the one that fits your workflow:

#### Option 1: CLI (recommended for AI agents and CI/CD)

```bash
cd /path/to/project-with-cms-config
npx cms export-schema --out webhouse-schema.json
```

Optional flags:
- `--baseUrl https://example.com` — sets the `$id` field
- `--pretty` (default true) — pretty-printed JSON
- `--include-blocks` (default true)

This is the canonical method. AI agents (Claude Code, Cursor) should always use the CLI when modifying schemas because it's deterministic, scriptable, and verifiable.

#### Option 2: CMS admin UI (recommended for human editors)

1. Open CMS admin → Site Settings
2. Find the **Schema export** section under "Validate site"
3. Click **💾 Save to project root** — writes `webhouse-schema.json` next to `cms.config.ts`
4. Or click **⬇ Download schema** — downloads via browser (for inspection or manual handling)

#### Option 3: GET /api/cms/registry/export-schema (for tooling integration)

```bash
curl -H "Cookie: cms-session=..." \
  "https://localhost:3010/api/cms/registry/export-schema?configPath=/abs/path/to/cms.config.ts&download=1" \
  -o webhouse-schema.json
```

Same backend as the UI button. Returns 401 without auth.

### Where the file goes

**Always next to `cms.config.ts`** — `{projectDir}/webhouse-schema.json`. This is the path every reader library expects by default.

For Java:
```java
Path schemaPath = Path.of("webhouse-schema.json");  // relative to working dir
```

For .NET:
```csharp
var schemaPath = Path.Combine(env.ContentRootPath, "webhouse-schema.json");
```

For PHP/Python/Ruby/Go: same convention — read from project root.

### What to commit to git

```
cms.config.ts          ← always commit
webhouse-schema.json   ← always commit (so consumers don't have to regenerate)
content/               ← always commit
public/uploads/        ← gitignored (per-deployment)
```

The schema file is **derived from `cms.config.ts`** but should still be committed. It's the contract between TypeScript admin and non-TS consumers. Treat it like a generated lockfile (`package-lock.json`, `composer.lock`).

## AI agent checklist

When you're modifying `cms.config.ts` in a project that contains `examples/consumers/` (or has any non-TS reader registered):

- [ ] Read the existing `cms.config.ts` first
- [ ] Apply the schema change
- [ ] Run `npx cms export-schema --out webhouse-schema.json` from the project directory
- [ ] Verify the diff in `webhouse-schema.json` matches your intent
- [ ] Commit both `cms.config.ts` AND `webhouse-schema.json` in the same commit
- [ ] If the change is a removal: WARN the user — content data may still reference the removed field

If you skip the re-export step, downstream consumers will silently break. This is a **trust issue with non-TS teams** — they assume the schema file matches the runtime content. If it doesn't, debugging takes hours.

## Reading content from a non-TS framework

Each reader library follows the same pattern:

1. **Validate inputs** — collection names and slugs must match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` (prevents path traversal)
2. **Filter by status** — default to `status === "published"`
3. **Filter by locale** — optional locale parameter
4. **Sort** — by `data.date` descending unless overridden
5. **Return typed documents** — language-native wrapper objects

The implementation per language is ~100-150 lines of code. See the reference implementations in `examples/consumers/` for canonical patterns.

## See also

- **Module 02** — Config Reference (all field types and collection options)
- **Module 03** — Field Types (full type list)
- **Module 17** — i18n (translationGroup and locale handling)
- **Feature plans** — `docs/features/F125-framework-agnostic-consumers.md`, `docs/features/F126-framework-agnostic-build.md`
- **Live examples** — `examples/consumers/java-spring-blog/`, `examples/consumers/dotnet-blog/`
- **External docs** — https://docs.webhouse.app/docs/framework-agnostic, /docs/schema-export

## Critical reminders

1. **`webhouse-schema.json` is part of your contract with consumers.** Treat it as a generated lockfile — always committed, always in sync with `cms.config.ts`.
2. **Re-export after every schema change.** No exceptions. AI agents that forget this break downstream consumers.
3. **Slugs and collection names must match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`.** Reader libraries enforce this for security; the CMS admin enforces it on validation.
4. **One schema, all languages.** Don't generate per-language variants. The same `webhouse-schema.json` works for Java, .NET, PHP, Python, Ruby, and Go consumers.
5. **Globals collection convention.** For site-wide settings (brand text, footer, social links) use a `globals` collection with `kind: 'global'`, `previewable: false`, and a single `site.json` document. Reader libs treat it as a singleton.
