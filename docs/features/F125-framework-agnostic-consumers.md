# F125 — Framework-Agnostic Content Platform

**Status:** Planned
**Size:** Large
**Tier:** 1 (v1.0 — Launch)
**Created:** 2026-04-08
**Related:** F126 (Framework-Agnostic Build Pipeline)

> Reposition @webhouse/cms from "TypeScript CMS" to "universal JSON content platform." Ship schema export, 6 first-party reader libraries (PHP, Python, Ruby, Go, Java, C#), 6 runnable example apps, 7+ bilingual docs pages, an updated homepage, and a migration guide. Make it genuinely safe for a Laravel, Django, or Spring Boot team to adopt @webhouse/cms without writing a single line of TypeScript.

---

## Why this matters

### The positioning problem

Today's messaging says "AI-native content engine for TypeScript projects." That phrase excludes ~90% of the web. PHP runs 75% of sites (WordPress dominance). Python, Ruby, Go, and .NET together run the majority of the remaining business web. Every one of those developers sees "TypeScript" and closes the tab.

But the content layer of @webhouse/cms has **nothing TypeScript-specific**:

- Content = flat JSON in `content/<collection>/<slug>.json`
- Media = image files in `public/uploads/`
- Schema = introspectable from `cms.config.ts` (or an exported JSON Schema)
- SEO = standards-based `sitemap.xml`, `robots.txt`, `llms.txt`
- MCP = language-agnostic protocol

The TypeScript surface area is:
- Admin UI (Next.js)
- `cms.config.ts` definition file
- Optional `@webhouse/cms/next` render helpers
- AI agents (`@webhouse/cms-ai`)

Admins configure + create content in TypeScript tooling. **Readers consume it in any language.** That's the actual architecture — but nobody knows because we've never said it.

### The competitive window

Every other file-based/headless CMS is locked to an ecosystem:

| CMS | Lock-in |
|-----|---------|
| Contentful | REST API, their SDK, vendor lock-in |
| Sanity | GROQ queries, their SDK, schema-in-JS |
| Strapi | Node.js runtime required |
| Directus | Node.js + PostgreSQL runtime |
| Payload | Node.js runtime, MongoDB/Postgres |
| Keystatic | JS/TS only, no runtime readers for other langs |
| Prismic | REST API, their SDK |
| Decap (Netlify) | Git + markdown, but admin is JS only |

**No one occupies the "JSON-in-git + universal readers" slot.** That's our moat. A Laravel agency should be able to drop @webhouse/cms into an existing Laravel monolith and immediately have:

1. A visual admin UI (our Next.js app on a side port)
2. AI content generation / translation / SEO agents
3. Their existing Laravel codebase reading the same JSON files

…without ever installing `npm` in the Laravel project itself.

### The migration story

Contentful customers are the biggest migration target. A Contentful Pro plan is $489/month. A self-hosted @webhouse/cms is free. If we ship a Contentful → @webhouse/cms migrator plus Laravel/Django/Rails reader libraries, we have a complete "switch to us" path.

---

## What ships (deliverables)

### 1. Schema Export CLI — `npx cms export-schema`

A new CLI command that reads `cms.config.ts` and outputs a JSON Schema document describing every collection and field. This is the single source of truth that non-TypeScript runtimes read to understand the content model.

**Output format:** JSON Schema draft 2020-12 with `$defs` for reusable field types.

**Command flags:**
- `--out <path>` — write to file (default: stdout)
- `--format json|yaml` — output format (default: json)
- `--pretty` — pretty-print
- `--include-blocks` — include block definitions (default: true)
- `--base-url <url>` — set `$id` for the schema

**Example output:**
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/webhouse-schema.json",
  "title": "Example Site Schema",
  "x-webhouse-version": "0.3.0",
  "x-generated-at": "2026-04-08T12:00:00Z",
  "$defs": {
    "Document": {
      "type": "object",
      "required": ["slug", "status", "data"],
      "properties": {
        "slug": { "type": "string", "pattern": "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$" },
        "status": { "enum": ["draft", "published", "archived", "expired", "trashed"] },
        "locale": { "type": "string", "description": "BCP 47 locale tag" },
        "translationGroup": { "type": "string", "format": "uuid" },
        "id": { "type": "string" },
        "createdAt": { "type": "string", "format": "date-time" },
        "updatedAt": { "type": "string", "format": "date-time" }
      }
    }
  },
  "collections": {
    "posts": {
      "allOf": [{ "$ref": "#/$defs/Document" }],
      "x-webhouse-collection": {
        "label": "Blog Posts",
        "urlPrefix": "/blog",
        "translatable": true,
        "kind": "page"
      },
      "properties": {
        "data": {
          "type": "object",
          "required": ["title"],
          "properties": {
            "title":   { "type": "string", "x-webhouse-field-type": "text" },
            "content": { "type": "string", "x-webhouse-field-type": "richtext", "contentMediaType": "text/markdown" },
            "date":    { "type": "string", "format": "date", "x-webhouse-field-type": "date" },
            "tags":    { "type": "array", "items": { "type": "string" }, "x-webhouse-field-type": "tags" }
          }
        }
      }
    }
  }
}
```

**Why `x-webhouse-*` extensions:** JSON Schema has no first-class concept of "richtext" or "tags" — we use `x-webhouse-field-type` so reader libs can use the hint without breaking JSON Schema compatibility.

### 2. Reader Libraries (6 languages)

Each language gets a **thin** first-party reader library published to its native package registry. "Thin" means:

- Zero dependencies outside the standard library (exception: Jackson for Java since the JDK has no built-in JSON)
- Under 500 lines of code total per library
- One file per feature (reader, locale helper, schema loader)
- Documented in the native language's idiomatic docs format

**Package names:**

| Language | Registry | Package name |
|----------|----------|--------------|
| PHP | Packagist | `webhouse/cms-reader` |
| Python | PyPI | `webhouse-cms-reader` |
| Ruby | RubyGems | `webhouse_cms` |
| Go | pkg.go.dev | `github.com/webhousecode/cms-reader-go` |
| Java | Maven Central | `app.webhouse:cms-reader` |
| C# / .NET | NuGet | `Webhouse.Cms.Reader` |

**Core API (consistent across languages):**

All libraries expose the same 4 functions (adapted to each language's idioms):

```
collection(name, locale=None, status='published')  → list of documents
document(collection, slug)                          → single document or null
find_translation(doc, collection)                   → sibling translation via translationGroup
load_schema(path='webhouse-schema.json')            → parsed JSON Schema (optional)
```

Plus caching wrappers:
```
collection_cached(name, ttl=60, ...)                → with in-memory cache
```

**PHP signature example:**
```php
namespace Webhouse\Cms;

class Reader {
    public function __construct(string $contentDir) { }
    public function collection(string $name, ?string $locale = null, string $status = 'published'): array { }
    public function document(string $collection, string $slug): ?array { }
    public function findTranslation(array $doc, string $collection): ?array { }
}
```

**Python signature example:**
```python
from webhouse_cms import Reader

reader = Reader(content_dir='content')
posts = reader.collection('posts', locale='en')
post = reader.document('posts', 'hello-world')
translation = reader.find_translation(post, 'posts')
```

### 3. Example Applications (6 runnable apps)

Each example is a **minimal but complete** working application that reads @webhouse/cms content and renders a blog. Not stub code — actually runnable.

**Structure:** `examples/consumers/{language}-blog/`

Every example includes:
- `README.md` — setup, run, screenshots, deploy notes
- Package manifest (`composer.json`, `requirements.txt`, `Gemfile`, `go.mod`, `.csproj`)
- Source code using the reader library
- Template files for home + post detail + tag pages
- A small `content/` directory with 3 example posts (EN + DA variants)
- Docker-compose file for one-command bring-up
- A smoke test that verifies all pages load

**The 6 examples:**

1. **`laravel-blog/`** — Laravel 11 monolith. Routes + Blade templates. Uses `webhouse/cms-reader` from Packagist.
2. **`django-blog/`** — Django 5 app. Views + template tags + `django-markdownify`. Uses `webhouse-cms-reader` from PyPI.
3. **`rails-blog/`** — Rails 7 app. Controllers + ERB views + `redcarpet`. Uses `webhouse_cms` from RubyGems.
4. **`go-gin/`** — Gin web framework. HTML templates + markdown rendering. Uses `cms-reader-go` from pkg.go.dev.
5. **`java-spring-blog/`** — Spring Boot 3.4 + Thymeleaf + Java 21. `commonmark-java` for markdown. Reader will publish as `app.webhouse:cms-reader` on Maven Central. **✅ Phase 1 — already shipped as reference implementation.**
6. **`dotnet-blog/`** — ASP.NET Core 9 Razor Pages. `Markdig` for markdown. Uses `Webhouse.Cms.Reader` from NuGet. **✅ Phase 1 — already shipped as reference implementation.**

**Shared test matrix:**
- Home page lists 3 published posts sorted by date
- Clicking a post navigates to `/blog/{slug}` and renders markdown
- Draft posts are not visible
- DA locale filter works (`/da/blog/`)
- Tag page lists posts for a tag
- Image in `public/uploads/` loads correctly
- Language switcher finds the translation via `translationGroup`

### 4. Docs (7 bilingual pages + more)

**Already shipped in cms-docs:**

1. `framework-agnostic` (EN+DA) — architecture overview
2. `consume-laravel` (EN+DA)
3. `consume-django` (EN+DA)
4. `consume-rails` (EN+DA)
5. `consume-go` (EN+DA)
6. `consume-java` (EN+DA) — Spring Boot guide
7. `consume-dotnet` (EN+DA)

**New docs to add in Phase 2-4:**

7. `consume-overview` (EN+DA) — Decision matrix: which reader to pick
8. `migration-from-contentful` (EN+DA) — Step-by-step migration
9. `migration-from-sanity` (EN+DA) — Step-by-step migration
10. `migration-from-wordpress` (EN+DA) — WordPress → @webhouse/cms
11. `schema-export` (EN+DA) — CLI reference + JSON Schema format
12. `reader-api-reference` (EN+DA) — Unified API docs across all 5 languages
13. `cms-config-json` (EN+DA) — For zero-TypeScript projects

### 5. Homepage + Marketing Copy

**Already shipped:**
- docs.webhouse.app homepage tagline updated

**Still to do:**
- webhouse.app marketing site homepage
- npm package README (`@webhouse/cms`)
- GitHub repo description
- README.md in the monorepo root
- `packages/cms/CLAUDE.md` header

**Tagline canon:**
> "The AI-native content engine. Framework-agnostic file-based JSON content, visual admin UI, AI agents, workflows, and a static build pipeline. Your content as flat JSON — render it with Next.js, Laravel, Django, Spring Boot, .NET, Rails, or anything that reads files."

**Shorter variants:**
- **15 words:** "JSON content platform with a TypeScript admin. Render from any language, any framework."
- **8 words:** "Universal JSON content. Render from anywhere."
- **5 words:** "One CMS. Every framework."

---

## Technical Design

### Schema Export CLI

**File:** `packages/cms-cli/src/commands/export-schema.ts`
**Converter:** `packages/cms/src/schema/to-json-schema.ts`

**Converter logic:**
```typescript
import type { CmsConfig, FieldConfig, CollectionConfig } from './types.js';

export interface JsonSchemaOutput {
  $schema: string;
  $id?: string;
  title?: string;
  'x-webhouse-version': string;
  'x-generated-at': string;
  $defs: Record<string, unknown>;
  collections: Record<string, unknown>;
  blocks?: Record<string, unknown>;
}

export function toJsonSchema(config: CmsConfig, opts?: {
  baseUrl?: string;
  includeBlocks?: boolean;
}): JsonSchemaOutput {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: opts?.baseUrl ? `${opts.baseUrl}/webhouse-schema.json` : undefined,
    title: 'Webhouse Content Schema',
    'x-webhouse-version': VERSION,
    'x-generated-at': new Date().toISOString(),
    $defs: {
      Document: buildDocumentDef(),
    },
    collections: Object.fromEntries(
      config.collections.map(c => [c.name, collectionToSchema(c)])
    ),
    blocks: opts?.includeBlocks ? Object.fromEntries(
      (config.blocks ?? []).map(b => [b.name, blockToSchema(b)])
    ) : undefined,
  };
}

function fieldToSchema(field: FieldConfig): object {
  const base: Record<string, unknown> = {
    'x-webhouse-field-type': field.type,
    description: field.label || field.name,
  };

  switch (field.type) {
    case 'text':      return { ...base, type: 'string' };
    case 'textarea':  return { ...base, type: 'string' };
    case 'richtext':  return { ...base, type: 'string', contentMediaType: 'text/markdown' };
    case 'number':    return { ...base, type: 'number' };
    case 'boolean':   return { ...base, type: 'boolean' };
    case 'date':      return { ...base, type: 'string', format: 'date' };
    case 'image':     return { ...base, type: 'string', description: 'URL path to image in public/uploads/' };
    case 'tags':      return { ...base, type: 'array', items: { type: 'string' } };
    case 'select':    return { ...base, enum: (field as any).options?.map((o: any) => o.value) };
    case 'array':     return { ...base, type: 'array', items: { type: 'object' } };
    case 'object':    return { ...base, type: 'object' };
    case 'blocks':    return { ...base, type: 'array', items: { type: 'object', properties: { _block: { type: 'string' } } } };
    case 'relation':  return { ...base, type: 'string', 'x-webhouse-relation': { collection: (field as any).collection } };
    default:          return base;
  }
}
```

### Reader Library API Contracts

Each library implements the same conceptual API. Here are the contracts per language:

#### PHP (`webhouse/cms-reader`)

```php
namespace Webhouse\Cms;

final class Reader {
    public function __construct(
        public readonly string $contentDir
    ) {}

    /** @return array<int, array> */
    public function collection(
        string $name,
        ?string $locale = null,
        string $status = 'published'
    ): array;

    public function document(string $collection, string $slug): ?array;

    public function findTranslation(array $doc, string $collection): ?array;
}

final class CachedReader {
    public function __construct(Reader $inner, int $ttlSeconds = 60) {}
    // same API as Reader, with in-memory caching
}
```

**Minimum PHP:** 8.1 (readonly properties). Zero dependencies.

#### Python (`webhouse-cms-reader`)

```python
from pathlib import Path
from typing import Optional, Literal

Status = Literal['draft', 'published', 'archived', 'expired', 'trashed']

class Reader:
    def __init__(self, content_dir: str | Path) -> None: ...

    def collection(
        self,
        name: str,
        locale: Optional[str] = None,
        status: Status = 'published',
    ) -> list[dict]: ...

    def document(self, collection: str, slug: str) -> Optional[dict]: ...

    def find_translation(self, doc: dict, collection: str) -> Optional[dict]: ...
```

**Minimum Python:** 3.10. Ships with optional extras:
- `pip install webhouse-cms-reader[django]` — Django helpers
- `pip install webhouse-cms-reader[fastapi]` — FastAPI helpers

#### Ruby (`webhouse_cms`)

```ruby
module WebhouseCms
  class Reader
    def initialize(content_dir:)
    end

    def collection(name, locale: nil, status: 'published')
    end

    def document(collection, slug)
    end

    def find_translation(doc, collection)
    end
  end
end
```

**Minimum Ruby:** 3.1. Ships with optional Rails engine at `webhouse_cms/rails`.

#### Go (`github.com/webhousecode/cms-reader-go`)

```go
package webhouse

type Document struct {
    ID               string                 `json:"id"`
    Slug             string                 `json:"slug"`
    Status           string                 `json:"status"`
    Locale           string                 `json:"locale,omitempty"`
    TranslationGroup string                 `json:"translationGroup,omitempty"`
    Data             map[string]interface{} `json:"data"`
    CreatedAt        string                 `json:"createdAt,omitempty"`
    UpdatedAt        string                 `json:"updatedAt,omitempty"`
}

type Reader struct {
    ContentDir string
}

func New(contentDir string) *Reader

type CollectionOption func(*collectionOpts)
func WithLocale(locale string) CollectionOption
func WithStatus(status string) CollectionOption

func (r *Reader) Collection(name string, opts ...CollectionOption) ([]Document, error)
func (r *Reader) Document(collection, slug string) (*Document, error)
func (r *Reader) FindTranslation(doc *Document, collection string) (*Document, error)
```

**Minimum Go:** 1.22. Uses functional options pattern. Only stdlib.

#### Java (`app.webhouse:cms-reader`)

```java
package app.webhouse.cmsreader;

public final class WebhouseReader {
    public WebhouseReader(String contentDir) { }

    public List<WebhouseDocument> collection(String collection, String locale);
    public Optional<WebhouseDocument> document(String collection, String slug);
    public Optional<WebhouseDocument> findTranslation(WebhouseDocument doc, String collection);
}
```

**Minimum Java:** 21 (LTS). Single dependency: Jackson (the JDK has no built-in JSON parser). Spring Boot integration via the `app.webhouse:cms-reader-spring` extension package which adds `@EnableWebhouseCms` autoconfiguration.

#### C# / .NET (`Webhouse.Cms.Reader`)

```csharp
namespace Webhouse.Cms;

public sealed class Reader
{
    public Reader(string contentDir) { }

    public IReadOnlyList<Document> Collection(
        string name,
        string? locale = null,
        string status = "published"
    );

    public Document? Document(string collection, string slug);

    public Document? FindTranslation(Document doc, string collection);
}

public sealed record Document(
    string Id,
    string Slug,
    string Status,
    string? Locale,
    string? TranslationGroup,
    Dictionary<string, JsonElement> Data,
    DateTime? CreatedAt,
    DateTime? UpdatedAt
);
```

**Minimum .NET:** 8.0. Uses `System.Text.Json` — no external deps.

### Registration with CMS admin

A Laravel (or any non-TS) project can be registered with CMS admin so the admin can edit its content. This already works today via the site-pool (F87 org/site settings), but we need to document it for non-TS users:

1. Clone CMS admin once on the developer machine (or run via Docker)
2. In CMS admin → Sites → Add new site
3. Point **Config path** to the non-TS project's `cms.config.ts` (or `cms.config.json` — see Phase 5)
4. Point **Content directory** to the non-TS project's `content/` folder
5. Admin reads/writes JSON files directly

**Scenario 1 — Laravel with TypeScript config:**
```
my-laravel-project/
  cms.config.ts         ← used by CMS admin only
  content/
    posts/
  app/
  composer.json
```

The `cms.config.ts` is only used by CMS admin — the Laravel runtime never executes it. But it requires the developer to have Node.js installed locally (for CMS admin).

**Scenario 2 — Laravel with pure JSON config (Phase 5):**
```
my-laravel-project/
  cms.config.json       ← used by CMS admin
  content/
    posts/
  app/
  composer.json
```

Zero TypeScript, zero Node.js in the Laravel project. CMS admin runs in Docker on a side port.

### Optional: `cms.config.json` format (Phase 5)

Allow an alternative `cms.config.json` for projects that want zero TypeScript:

```json
{
  "collections": [
    {
      "name": "posts",
      "label": "Blog Posts",
      "urlPrefix": "/blog",
      "translatable": true,
      "fields": [
        { "name": "title", "type": "text", "required": true },
        { "name": "content", "type": "richtext" },
        { "name": "date", "type": "date" },
        { "name": "tags", "type": "tags" }
      ]
    }
  ],
  "defaultLocale": "en",
  "locales": ["en", "da"]
}
```

The site-pool loader detects `.json` vs `.ts` and handles both.

---

## Implementation Phases

### Phase 1 — Foundation (2-3 days)

**Goal:** Schema export works, homepage says the right thing, docs are up.

- [x] Docs pages (6 bilingual) — **DONE**
- [x] docs.webhouse.app homepage tagline — **DONE**
- [ ] `packages/cms/src/schema/to-json-schema.ts` — converter
- [ ] `packages/cms-cli/src/commands/export-schema.ts` — CLI
- [ ] Unit tests for converter (cover all 22 field types)
- [ ] CLI integration test (run against `examples/static/blog/cms.config.ts`)
- [ ] `packages/cms/CLAUDE.md` — add framework-agnostic section
- [ ] Root `README.md` — update positioning
- [ ] `packages/cms/README.md` (npm package) — update positioning

**Acceptance:** `npx cms export-schema --out schema.json` produces a valid JSON Schema for any existing example site.

### Phase 2 — Reader Libraries (5-7 days)

**Goal:** 5 native packages published, all following consistent API.

- [ ] PHP library in new repo `webhousecode/cms-reader-php` + publish to Packagist
- [ ] Python library in `webhousecode/cms-reader-python` + publish to PyPI
- [ ] Ruby gem in `webhousecode/cms-reader-ruby` + publish to RubyGems
- [ ] Go module in `webhousecode/cms-reader-go` + tag v0.1.0
- [ ] .NET library in `webhousecode/cms-reader-dotnet` + publish to NuGet
- [ ] CI/CD for each (GitHub Actions, test matrix across supported language versions)
- [ ] Each lib ships with >90% test coverage
- [ ] README per library with install + 3 usage examples

**Acceptance:** `composer require webhouse/cms-reader` in a fresh Laravel project works. Same for every other language.

### Phase 3 — Example Applications (4-5 days)

**Goal:** 5 runnable example apps in `examples/consumers/`.

- [ ] `examples/consumers/laravel-blog/` — Laravel 11 + Blade
- [ ] `examples/consumers/django-blog/` — Django 5 + templates
- [ ] `examples/consumers/rails-blog/` — Rails 7 + ERB
- [ ] `examples/consumers/go-gin/` — Gin + html/template
- [ ] `examples/consumers/dotnet-blog/` — ASP.NET Core Razor Pages
- [ ] Each with README, docker-compose, smoke tests
- [ ] Each reads from a shared minimal `content/` directory (3 posts × 2 locales)
- [ ] CI builds all 5 examples on every PR
- [ ] Screenshots in READMEs showing rendered output

**Acceptance:** A developer can clone the monorepo, `cd examples/consumers/laravel-blog`, run one command, and see a running blog with @webhouse/cms content.

### Phase 4 — Migration Guides (2-3 days)

**Goal:** Customers switching from Contentful, Sanity, or WordPress have a clear path.

- [ ] `docs/migration-from-contentful` (EN+DA) — Export script: Contentful → @webhouse/cms JSON
- [ ] `docs/migration-from-sanity` (EN+DA) — Export script for Sanity
- [ ] `docs/migration-from-wordpress` (EN+DA) — WP REST API → @webhouse/cms (builds on Maurseth lessons)
- [ ] Migration helper script in `packages/cms-cli/src/commands/import-contentful.ts`
- [ ] Before/after cost comparison (Contentful Pro $489/mo → @webhouse/cms $0)

**Acceptance:** A Contentful customer can export their content and have it running in @webhouse/cms in under an hour.

### Phase 5 — JSON Config Support (2 days)

**Goal:** Zero-TypeScript projects can use @webhouse/cms.

- [ ] `packages/cms/src/schema/load-config.ts` — detect `.ts` vs `.json`, handle both
- [ ] `packages/cms-admin/src/lib/site-pool.ts` — accept JSON config paths
- [ ] Update `Validate site` to support both formats
- [ ] Docs page: `cms-config-json` (EN+DA) — when to use which format
- [ ] Migration helper: `npx cms config-to-json` (converts `.ts` → `.json`)

**Acceptance:** A Laravel project with only `cms.config.json` (no TypeScript anywhere) can be fully managed from CMS admin.

### Phase 6 — Marketing Launch (1-2 days)

**Goal:** Tell the world.

- [ ] Blog post on docs.webhouse.app announcing framework-agnostic support
- [ ] Social posts (LinkedIn, Bluesky, Mastodon)
- [ ] Hacker News / r/PHP / r/django / r/rails submissions
- [ ] "Switch from Contentful" landing page on webhouse.app
- [ ] Video walkthrough: "Laravel + @webhouse/cms in 10 minutes"
- [ ] Update all package.json descriptions, GitHub repo description, npm README

**Acceptance:** The message "universal JSON content platform" is visible in every touchpoint.

---

## Files to Modify / Create

### In cms monorepo

**New:**
- `packages/cms/src/schema/to-json-schema.ts`
- `packages/cms/src/schema/__tests__/to-json-schema.test.ts`
- `packages/cms-cli/src/commands/export-schema.ts`
- `packages/cms-cli/src/__tests__/export-schema.test.ts`
- `packages/cms/src/schema/load-config.ts` (Phase 5 — support .json)
- `packages/cms-cli/src/commands/config-to-json.ts` (Phase 5)
- `packages/cms-cli/src/commands/import-contentful.ts` (Phase 4)
- `examples/consumers/README.md`
- `examples/consumers/laravel-blog/` (full project, ~30 files)
- `examples/consumers/django-blog/` (full project, ~25 files)
- `examples/consumers/rails-blog/` (full project, ~30 files)
- `examples/consumers/go-gin/` (full project, ~15 files)
- `examples/consumers/dotnet-blog/` (full project, ~20 files)

**Modified:**
- `README.md` (root) — positioning, framework list, link to consumer guides
- `packages/cms/README.md` — npm package description
- `packages/cms/CLAUDE.md` — add framework-agnostic section
- `packages/cms-admin/src/lib/site-pool.ts` — accept JSON config (Phase 5)
- `packages/cms/src/schema/site-validator.ts` — validate JSON configs (Phase 5)
- `docs/FEATURES.md` — add F125 entry

### In cms-docs repo

**Already shipped:**
- 6 bilingual docs pages (framework-agnostic + 5 consume-* guides)
- Homepage tagline

**Still to add (Phase 1-5):**
- 7 more bilingual docs pages (migration guides, schema export, reader API, JSON config)

### New external repos

- `webhousecode/cms-reader-php` — Packagist package
- `webhousecode/cms-reader-python` — PyPI package
- `webhousecode/cms-reader-ruby` — RubyGems gem
- `webhousecode/cms-reader-go` — Go module
- `webhousecode/cms-reader-dotnet` — NuGet package

---

## Testing Strategy

### Schema export (Phase 1)

- Unit tests for every field type → JSON Schema type mapping
- Round-trip test: load `examples/static/blog/cms.config.ts`, export, re-parse, verify structure
- Snapshot test against a known-good JSON Schema output
- Validation test: the output JSON Schema must itself be valid JSON Schema draft 2020-12

### Reader libraries (Phase 2)

Each library ships with:
- Unit tests for `collection()`, `document()`, `find_translation()`
- Integration tests reading actual JSON files from `fixtures/`
- Performance test: parse 1000 documents in under 100ms (cache hit)
- Edge case tests:
  - Malformed JSON → skip, don't crash
  - Missing fields → return null/None
  - Invalid status → not returned
  - Empty collection dir → return empty array
  - Unicode in slugs and content → correct
  - Path traversal attempts → rejected

### Example applications (Phase 3)

Each example includes a smoke test (Playwright, pytest, or equivalent):
- Home page loads, contains 3 post titles
- Click first post → detail page loads
- Markdown is rendered (look for `<h2>` in output)
- Image in `public/uploads/` returns 200
- Tag page lists filtered posts
- Language switcher navigates to translation
- Draft post is NOT visible

CI runs all 5 examples on every PR against the reader libraries.

### End-to-end (Phase 3 integration)

A single E2E test in `packages/cms-admin/e2e/suites/25-framework-agnostic.spec.ts`:
1. Start CMS admin
2. Register `examples/consumers/laravel-blog` as a new site
3. Create a new post via CMS admin UI
4. Verify the JSON file appears in `examples/consumers/laravel-blog/content/posts/`
5. Build the Laravel example (via docker-compose)
6. HTTP GET the Laravel blog index → new post is visible

This proves the full round-trip: admin edits content → Laravel renders it.

**Note:** Step 5 (building the Laravel example from CMS admin) requires **F126**. Without F126, the test manually runs `docker-compose up` as a shell step. With F126 shipped, CMS admin's Build button runs the Laravel build command directly.

---

## Performance & Scale

### Reader library performance targets

- Read a single document: <1ms (cached), <10ms (cold)
- Read a collection of 100 documents: <20ms (cached), <100ms (cold)
- Read a collection of 1,000 documents: <200ms (cached), <1s (cold)
- Cache memory footprint: O(n) where n is total published documents

### When to use what

| Site size | Recommended reader pattern |
|-----------|---------------------------|
| <100 docs | Direct file reads, no cache |
| 100-1,000 | In-memory cache with 60s TTL |
| 1,000-10,000 | Build-time pre-render, cache invalidation via webhook |
| >10,000 | Consider Supabase adapter instead — file-based isn't the right tool |

---

## Security Considerations

### Path traversal protection

Reader libraries MUST NOT allow arbitrary paths:

```php
// BAD: allows ../../etc/passwd
public function document(string $collection, string $slug): ?array {
    return json_decode(file_get_contents("content/{$collection}/{$slug}.json"), true);
}

// GOOD: validates slug format
public function document(string $collection, string $slug): ?array {
    if (!preg_match('/^[a-z0-9][a-z0-9-]*$/', $slug)) return null;
    if (!preg_match('/^[a-z0-9][a-z0-9-]*$/', $collection)) return null;
    // ...
}
```

Every reader library enforces:
- Collection names: lowercase alphanumeric + hyphens
- Slugs: lowercase alphanumeric + hyphens
- No `..` segments
- No absolute paths
- File must be under `content_dir`

### Status filtering is mandatory

Readers default to `status='published'`. To show drafts, consumers must explicitly opt in. This prevents accidentally leaking draft content to production.

### Schema validation (optional)

Reader libraries can optionally validate documents against the exported JSON Schema:

```python
reader = Reader('content', schema_path='webhouse-schema.json', validate=True)
# Invalid documents are skipped with a warning
```

Default: validation off (performance). Recommended for production: validation on.

---

## How F125 + F126 fit together

F125 alone gives you **read access**: Laravel/Django/Rails can load @webhouse/cms JSON and render it. You can already edit content in CMS admin, save, and have the framework read the updated files on next request.

What F125 alone **doesn't** give you: one-click build + deploy. A Laravel developer saving content in CMS admin today has to manually run `php artisan build` and deploy separately.

**F126 completes the picture:** CMS admin's Build button runs the framework's native build command (configured in `cms.config.ts` as `build.command`). When a content editor saves in CMS admin:

1. **F125 layer:** JSON file is written to `content/posts/my-post.json`
2. **F126 layer:** CMS admin spawns `php artisan build` (or `hugo`, `bundle exec jekyll build`, etc.)
3. **Existing F12 deploy layer:** Resulting `public/` (or `_site/`, `dist/`, whatever) is pushed to Netlify/Vercel/Fly

Together, the loop looks like:

```
┌──────────────────────────────────────────────────────────────┐
│                   CMS admin (Next.js)                         │
│  ┌────────────┐  ┌─────────┐  ┌─────────┐  ┌────────────┐     │
│  │  Editor    │→ │   AI    │→ │Validate │→ │  Build     │     │
│  │  UI        │  │ Agents  │  │  Site   │  │  Button    │     │
│  └────┬───────┘  └─────────┘  └─────────┘  └─────┬──────┘     │
└───────┼────────────────────────────────────────────┼──────────┘
        │ writes JSON                                │ F126
        ▼                                            ▼ spawns
┌──────────────────┐                      ┌──────────────────────┐
│  content/        │ ← reads via F125 lib │  php artisan build   │
│    posts/*.json  │──────────────────────│  (or hugo, rails…)   │
└──────────────────┘                      └─────────┬────────────┘
                                                    │ outputs to
                                                    ▼
                                          ┌──────────────────────┐
                                          │  public/  _site/     │
                                          └─────────┬────────────┘
                                                    │ F12 deploy
                                                    ▼
                                          ┌──────────────────────┐
                                          │  Netlify / Fly / …   │
                                          └──────────────────────┘
```

**F125 ships first** because it unlocks value without any risky admin-side changes. **F126 ships next** because it completes the one-click story. Together they create a new category: "universal CMS" — content editing, AI agents, build, and deploy all working with any backend framework.

---

## Success Metrics

### Phase 1 acceptance
- `npx cms export-schema` produces valid JSON Schema for all existing examples
- Homepage and README say "framework-agnostic" prominently
- Docs pages are live and indexed

### Phase 2 acceptance
- 5 packages published to their respective registries
- Each package has >90% test coverage
- Each package's README has 3 copy-paste usage examples
- Download counts: aim for 50/month per package in first quarter post-launch

### Phase 3 acceptance
- 5 examples build and run in CI on every PR
- Each example's README has working "get started in 5 minutes" instructions
- Smoke tests pass for all 5

### Phase 4-6 acceptance
- At least one public customer migrates from Contentful to @webhouse/cms with Laravel/Django/Rails as renderer
- Hacker News / language-specific subreddit post in first month gets engagement
- GitHub repo stars double in 3 months post-launch (as a leading indicator)

---

## Open Questions

1. **Should reader libraries auto-watch for file changes?** (Development convenience vs. production simplicity.) Recommended: no by default, opt-in with `--watch` flag.

2. **How do we handle `blocks` field in non-JS languages?** The reader returns the raw block array; rendering is up to the consumer. We document the recommended pattern: match on `_block` key, render per type.

3. **Should we ship a JSON Schema validator in each reader?** For Phase 2, no (zero deps is more important). For Phase 3+, consider shipping an optional `validate` extra.

4. **Should the `cms.config.json` alternative completely replace `cms.config.ts`?** No — `.ts` stays the primary format because it gives type safety. `.json` is for teams that want zero Node.js dependency in their project.

5. **Schema export naming: `webhouse-schema.json` or `cms-schema.json` or `content-schema.json`?** Recommendation: `webhouse-schema.json` (branded, unambiguous). Configurable via CLI flag.

6. **Do we publish the 5 reader libraries as separate GitHub repos or in the monorepo?** Recommendation: separate repos, one per language. Cleaner CI, native conventions per ecosystem, independent versioning.

7. **Contentful import — reuse F02 (Import Engine) or build standalone?** Recommendation: fold into F02 when it ships, standalone script now.

---

## Related Features

- **F126** — Framework-Agnostic Build Pipeline (content READ is this feature; content BUILD is F126)
- **F02** — Import Engine (migration tooling)
- **F31** — Documentation Site (where the framework-agnostic docs live)
- **F79** — Site Config Validator (must handle JSON configs in Phase 5)
- **F121** — Next.js CMS Helpers (the TypeScript equivalent of what we're shipping for other languages)
- **F127** — Collection Purpose Metadata (`kind` field helps reader libraries know what a collection is for)

---

## Priority Justification

**Why this is Tier 1, not Tier 2:**

1. **Positioning is blocking adoption.** Every time a non-TS developer visits webhouse.app and sees "TypeScript projects," we lose a user. This is a leaky bucket that gets worse every day.

2. **The work is mostly docs + thin libraries.** No deep engine changes. No breaking changes. Low risk.

3. **It unlocks F02 (Import Engine) value.** A migration from Contentful to @webhouse/cms is only valuable if the destination works with the customer's existing stack. Currently we force them to rewrite in Next.js. With F125, they keep their Laravel/Django/Rails.

4. **It's differentiating.** No other file-based CMS does this. We can own "universal JSON content platform" before anyone else notices the gap.

5. **It's self-reinforcing with F126.** F125 makes content readable from any framework. F126 makes builds triggerable from any framework. Together they complete the picture.

---

> **Testing (F99):** Core converter has unit tests in the monorepo. Each reader library has its own test suite in its own repo. Example apps have smoke tests. The E2E integration test in F99's framework runs one full round-trip test via CMS admin + one example app (the Laravel one is the canonical proof).
