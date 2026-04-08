# Consumer Examples

Reference implementations showing how to consume @webhouse/cms JSON content from non-TypeScript frameworks. Part of **F125 — Framework-Agnostic Content Platform**.

## What's here

| Example | Stack | Status |
|---------|-------|--------|
| [`java-spring-blog/`](./java-spring-blog/) | Spring Boot 3.4 + Thymeleaf + Java 21 | ✅ Phase 1 |
| [`dotnet-blog/`](./dotnet-blog/) | ASP.NET Core 9 Razor Pages + .NET 9 | ✅ Phase 1 |
| `laravel-blog/` | Laravel 11 + Blade + PHP 8.3 | 🚧 Phase 3 |
| `django-blog/` | Django 5 + templates + Python 3.12 | 🚧 Phase 3 |
| `rails-blog/` | Rails 7 + ERB + Ruby 3.3 | 🚧 Phase 3 |
| `go-gin/` | Gin + html/template + Go 1.22 | 🚧 Phase 3 |

Each example is a **complete, runnable application**:
- Reads JSON files from `content/posts/*.json`
- Renders a bilingual (EN+DA) blog with home + post detail pages
- Uses translationGroup UUIDs to link translations
- Serves uploaded media from `public/uploads/`
- Includes `cms.config.ts` so CMS admin can edit the content
- Has a Dockerfile + docker-compose for one-command bring-up
- Has a README with setup, run, and deploy instructions

## The pattern

Every example follows the same shape:

```
{language}-blog/
├── README.md
├── cms.config.ts          ← used by CMS admin only
├── content/               ← JSON documents
│   └── posts/
│       ├── hello-world.json
│       ├── hello-world-da.json
│       ├── why-{stack}.json
│       └── why-{stack}-da.json
├── public/uploads/        ← media served at /uploads/*
├── Dockerfile
├── docker-compose.yml
└── {framework-source-files}
    └── WebhouseReader     ← ~100-150 lines reading JSON from content/
```

The reader is always:
1. **List** documents in a collection, optionally filter by locale
2. **Get** a single document by collection + slug
3. **Find translation** via translationGroup UUID

Three functions. ~150 lines per language. No SDK, no API, no vendor.

## Why these two first

- **Java (Spring Boot)** — enterprise web's dominant stack. Java has the largest non-JS web developer audience. Spring Boot is the de-facto framework.
- **.NET (Razor Pages)** — Microsoft's modern web stack. ASP.NET Core 9 is the LTS release. Razor Pages is the simplest entry point and ships with the framework.

Both ship with strong typing, both have first-class JSON support in the standard library, and both demonstrate that @webhouse/cms is **not a TypeScript CMS** — it's a universal JSON content platform with a TypeScript admin.

## Connecting CMS admin

For any example:

1. Run CMS admin (Docker, npx, or local dev)
2. In CMS admin → Sites → Add new site
3. **Config path:** absolute path to the example's `cms.config.ts`
4. **Content directory:** absolute path to the example's `content/`
5. Click "Validate site" — should show ✓ All good
6. Edit content visually in the admin
7. Reload the example app — changes are live

## Schema export

To generate a JSON Schema document any language can introspect:

```bash
cd examples/consumers/java-spring-blog
npx cms export-schema --out webhouse-schema.json
```

The output is a [JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12) document with `x-webhouse-*` extension keywords for type hints (richtext, tags, blocks, etc.) that have no native JSON Schema equivalent.

## Related features

- **F125** — Framework-Agnostic Content Platform (this directory is part of it)
- **F126** — Framework-Agnostic Build Pipeline (let CMS admin run `mvn package` / `dotnet publish` / etc.)
