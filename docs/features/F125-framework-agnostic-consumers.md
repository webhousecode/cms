# F125 — Framework-Agnostic Consumer Guides

**Status:** Planned
**Size:** Medium
**Tier:** 1 (v1.0 — Launch)
**Created:** 2026-04-08

> Position @webhouse/cms as a framework-agnostic JSON content platform. Ship docs, schema export, and consumer patterns for PHP (Laravel), Python (Django/FastAPI), Ruby (Rails), Go (Hugo/Gin), C# (.NET), and Elixir (Phoenix) — not just TypeScript.

## Problem

Our marketing copy currently says "The AI-native content engine for TypeScript projects." That's a **self-imposed limitation**. The core value proposition of @webhouse/cms — flat JSON content in git, visual admin, AI agents — has nothing TypeScript-specific about it.

The content lives as `content/<collection>/<slug>.json`. Any language that can read a file can consume it. But:

1. **No consumer guides** for non-TS frameworks — developers from PHP/Python/Ruby/Go/C# communities don't know they can use this
2. **No schema export** — the content model is locked in `cms.config.ts`, so non-TS runtimes can't introspect it
3. **No examples** — no Laravel controller, no Django view, no Rails helper showing "here's how to read webhouse content"
4. **Missed positioning** — we're a universal content platform with a TS admin, not a TS CMS

## Solution

Reposition @webhouse/cms as a **framework-agnostic JSON content platform**. Add:

1. **Schema export command** — `npx cms export-schema > schema.json` — outputs JSON Schema of the content model
2. **Consumer libraries** (thin reader helpers) for 5 languages:
   - PHP (Composer package)
   - Python (pip package)
   - Ruby (gem)
   - Go (go module)
   - C# / .NET (NuGet)
3. **Docs pages** on docs.webhouse.app:
   - Framework-Agnostic Architecture (overview)
   - Consume from Laravel
   - Consume from Django
   - Consume from Rails
   - Consume from Go
   - Consume from C# / .NET
4. **Updated homepage tagline** — remove "for TypeScript projects"
5. **Example projects** — one minimal example per language in `examples/consumers/`

## Technical Design

### 1. Schema Export CLI

**New command:** `npx cms export-schema`

Generates a JSON Schema representation of the cms.config.ts collections:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://webhouse.app/schema/my-site.json",
  "title": "My Site Content Schema",
  "collections": {
    "posts": {
      "type": "object",
      "properties": {
        "slug": { "type": "string" },
        "status": { "enum": ["draft", "published", "archived"] },
        "locale": { "type": "string" },
        "translationGroup": { "type": "string", "format": "uuid" },
        "data": {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "content": { "type": "string", "format": "markdown" },
            "date": { "type": "string", "format": "date" },
            "tags": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["title"]
        }
      }
    }
  }
}
```

Any language with a JSON Schema library can validate, generate types, or introspect the content model.

### 2. Consumer Reader Pattern

The pattern for every language is essentially the same — read JSON files from `content/<collection>/`:

**PHP (Laravel):**
```php
use Illuminate\Support\Facades\File;

class Webhouse {
    public static function collection(string $name, ?string $locale = null): array {
        $dir = base_path("content/{$name}");
        $files = File::files($dir);
        $docs = collect($files)
            ->map(fn($f) => json_decode(File::get($f->getPathname()), true))
            ->filter(fn($d) => $d['status'] === 'published')
            ->when($locale, fn($c) => $c->filter(fn($d) => $d['locale'] === $locale))
            ->values()
            ->all();
        return $docs;
    }

    public static function document(string $collection, string $slug): ?array {
        $path = base_path("content/{$collection}/{$slug}.json");
        return file_exists($path) ? json_decode(file_get_contents($path), true) : null;
    }
}
```

**Python (Django/FastAPI):**
```python
from pathlib import Path
import json

class Webhouse:
    def __init__(self, content_dir: str = "content"):
        self.content_dir = Path(content_dir)

    def collection(self, name: str, locale: str | None = None) -> list[dict]:
        docs = []
        for f in (self.content_dir / name).glob("*.json"):
            doc = json.loads(f.read_text())
            if doc.get("status") != "published":
                continue
            if locale and doc.get("locale") != locale:
                continue
            docs.append(doc)
        return docs

    def document(self, collection: str, slug: str) -> dict | None:
        path = self.content_dir / collection / f"{slug}.json"
        return json.loads(path.read_text()) if path.exists() else None
```

**Ruby (Rails):**
```ruby
module Webhouse
  CONTENT_DIR = Rails.root.join("content")

  def self.collection(name, locale: nil)
    Dir.glob(CONTENT_DIR.join(name, "*.json")).map do |f|
      JSON.parse(File.read(f))
    end.select { |d| d["status"] == "published" }
      .then { |docs| locale ? docs.select { |d| d["locale"] == locale } : docs }
  end

  def self.document(collection, slug)
    path = CONTENT_DIR.join(collection, "#{slug}.json")
    File.exist?(path) ? JSON.parse(File.read(path)) : nil
  end
end
```

**Go:**
```go
package webhouse

import (
    "encoding/json"
    "os"
    "path/filepath"
)

type Document struct {
    Slug             string                 `json:"slug"`
    Status           string                 `json:"status"`
    Locale           string                 `json:"locale,omitempty"`
    TranslationGroup string                 `json:"translationGroup,omitempty"`
    Data             map[string]interface{} `json:"data"`
}

func Collection(contentDir, name string) ([]Document, error) {
    dir := filepath.Join(contentDir, name)
    files, err := os.ReadDir(dir)
    if err != nil {
        return nil, err
    }
    var docs []Document
    for _, f := range files {
        if filepath.Ext(f.Name()) != ".json" {
            continue
        }
        raw, _ := os.ReadFile(filepath.Join(dir, f.Name()))
        var d Document
        if err := json.Unmarshal(raw, &d); err != nil {
            continue
        }
        if d.Status == "published" {
            docs = append(docs, d)
        }
    }
    return docs, nil
}
```

**C# / .NET:**
```csharp
using System.Text.Json;

public static class Webhouse
{
    public static IEnumerable<JsonElement> Collection(string contentDir, string name, string? locale = null)
    {
        var dir = Path.Combine(contentDir, name);
        foreach (var file in Directory.GetFiles(dir, "*.json"))
        {
            var doc = JsonDocument.Parse(File.ReadAllText(file)).RootElement;
            if (doc.GetProperty("status").GetString() != "published") continue;
            if (locale != null && doc.GetProperty("locale").GetString() != locale) continue;
            yield return doc;
        }
    }
}
```

### 3. Example Projects

Create `examples/consumers/` directory with minimal working examples:

```
examples/consumers/
  laravel-blog/      # Laravel 11 app reading cms content
  django-blog/       # Django 5 app reading cms content
  rails-blog/        # Rails 7 app reading cms content
  go-hugo-theme/     # Hugo template consuming webhouse content
  dotnet-blog/       # ASP.NET Core Razor Pages
```

Each example:
- Reuses the same `content/` directory from `examples/static/blog/`
- Renders the same 5 blog posts as HTML
- Has a README with setup + run instructions
- Shows the preview URL working with CMS admin

### 4. Docs Pages to Create (EN + DA)

1. `framework-agnostic.json` — "Framework-Agnostic Architecture"
2. `consume-laravel.json` — Consume from Laravel (PHP)
3. `consume-django.json` — Consume from Django (Python)
4. `consume-rails.json` — Consume from Rails (Ruby)
5. `consume-go.json` — Consume from Go
6. `consume-dotnet.json` — Consume from C# / .NET

Plus Danish twins (`-da.json` files with shared translationGroup).

### 5. Homepage Copy Change

**Before:** "The AI-native content engine for TypeScript projects."

**After:** "The AI-native content engine. Framework-agnostic file-based JSON content, visual admin UI, AI agents, workflows, and a static build pipeline. Your content as flat JSON — render it with Next.js, Laravel, Django, C#, Rails, or anything that reads files."

## Implementation Notes

- **Zero dependencies** — reader libs should be thin, no heavy ORM/framework coupling
- **Status filter is mandatory** — always filter `status === "published"` by default
- **Locale handling** — readers should accept optional locale, default to reading all
- **translationGroup** — expose it so consumers can build language switchers
- **Media paths** — documents reference `/uploads/*` which consumer apps must serve via their own static file handler

## Files to Modify / Create

- New: `packages/cms-cli/src/commands/export-schema.ts` — CLI command
- New: `packages/cms/src/schema/to-json-schema.ts` — converter
- New: `examples/consumers/laravel-blog/` — Laravel example
- New: `examples/consumers/django-blog/` — Django example
- New: `examples/consumers/rails-blog/` — Rails example
- New: `examples/consumers/go-hugo-theme/` — Go example
- New: `examples/consumers/dotnet-blog/` — .NET example
- New: 6 docs pages × 2 locales = 12 JSON files in `cms-docs/content/docs/`
- Edit: `cms-docs/src/app/page.tsx` — homepage tagline
- Edit: `packages/cms/CLAUDE.md` — add framework-agnostic section

## Priority

**Tier 1 — critical for positioning.** This isn't a technical feature so much as a strategic one: @webhouse/cms is uniquely positioned as the ONLY file-based CMS with an AI-native admin that works with any backend. Every other CMS in this space (Contentful, Sanity, Strapi, Directus) is locked to a specific ecosystem. This feature makes that story shippable.

---

> **Testing (F99):** This feature is primarily docs + examples, but schema export needs unit tests.
> - Unit tests → `packages/cms/src/schema/__tests__/to-json-schema.test.ts`
> - CLI tests → `packages/cms-cli/src/__tests__/export-schema.test.ts`
> - E2E: build each consumer example and verify it renders published content correctly

## Related

- **F126** — Framework-Agnostic Build Pipeline (complements this feature — this one is about READ, F126 is about BUILD)
