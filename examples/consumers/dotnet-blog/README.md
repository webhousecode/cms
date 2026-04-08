# dotnet-blog — @webhouse/cms consumer example

A complete ASP.NET Core 9 Razor Pages application that reads @webhouse/cms JSON content and renders a bilingual blog.

**Stack:**
- .NET 9 (LTS)
- ASP.NET Core Razor Pages
- System.Text.Json (built-in JSON parsing)
- Markdig (markdown rendering)

**No database. No API. No CMS runtime.** Just `Directory.EnumerateFiles()` reading flat JSON files in `content/`.

## What this proves

@webhouse/cms is **not a TypeScript CMS**. It's a universal JSON content platform with a TypeScript admin. This .NET app reads the exact same `content/posts/*.json` files that CMS admin writes — no translation layer, no API, no SDK.

When a content editor saves a post in CMS admin, this ASP.NET Core app sees the change on its next request. Zero glue code beyond `WebhouseReader.cs` (~100 lines).

## Quick start

### Option 1: Run with .NET CLI (requires .NET 9 SDK)

```bash
cd examples/consumers/dotnet-blog
dotnet run
```

Then open http://localhost:5000 (or whichever port .NET picks) — you should see two posts in English. Add `/da` for Danish.

### Option 2: Run with Docker

```bash
cd examples/consumers/dotnet-blog
docker-compose up --build
```

Then open http://localhost:8081.

## How it works

```
content/                    ← @webhouse/cms JSON files
  posts/
    hello-world.json        ← English post
    hello-world-da.json     ← Danish translation (same translationGroup)
    why-razor-pages.json
    why-razor-pages-da.json

Services/
  WebhouseReader.cs         ← reads JSON files from content/
  WebhouseDocument.cs       ← typed wrapper around the JSON shape

Pages/
  Index.cshtml              ← English post list (route: /)
  Da.cshtml                 ← Danish post list (route: /da)
  Blog/Post.cshtml          ← single post detail (route: /blog/{slug})
  Shared/_Layout.cshtml     ← shared layout

Program.cs                  ← ASP.NET Core entry point + DI registration
```

The reader's API:

```csharp
var cms = new WebhouseReader("content");

// All published English posts
IReadOnlyList<WebhouseDocument> posts = cms.Collection("posts", locale: "en");

// One specific post
WebhouseDocument? post = cms.Document("posts", "hello-world");

// Find the Danish translation via translationGroup
WebhouseDocument? translation = cms.FindTranslation(post, "posts");
```

## Connecting CMS admin

To edit content visually:

1. Run CMS admin (e.g. via Docker on port 3010)
2. In CMS admin → Sites → Add new site
3. **Config path:** absolute path to this folder's `cms.config.ts`
4. **Content directory:** absolute path to this folder's `content/`
5. Click "Validate site" — should show ✓ All good
6. Open the Posts collection → edit a post → Save
7. Reload http://localhost:5000 — changes are live

## i18n via translationGroup

Every post has a `translationGroup` UUID that links it to its translation:

```json
// hello-world.json
{ "slug": "hello-world", "locale": "en", "translationGroup": "f1e2d3c4-..." }

// hello-world-da.json
{ "slug": "hello-world-da", "locale": "da", "translationGroup": "f1e2d3c4-..." }
```

The .NET app uses `cms.FindTranslation(post, "posts")` to render a "Read in DA" link at the bottom of each post.

## Security

`WebhouseReader` validates collection names and slugs against `^[a-z0-9][a-z0-9-]*$` before resolving paths, preventing directory traversal attacks. Also uses `Path.GetFullPath()` + `StartsWith` check to ensure resolved paths stay under `_contentDir`.

## Production deployment

- **Fly.io:** Use the included Dockerfile, deploy with `fly launch`
- **Azure App Service:** Native .NET 9 support, just push
- **AWS Lambda:** Use `Lambda.AspNetCoreServer.Hosting` for serverless
- **IIS:** Standard ASP.NET Core IIS deployment

## Caching

For production, add `IMemoryCache`:

```csharp
builder.Services.AddMemoryCache();

public class CachedWebhouse {
    private readonly WebhouseReader _reader;
    private readonly IMemoryCache _cache;

    public IReadOnlyList<WebhouseDocument> Posts(string? locale) {
        return _cache.GetOrCreate($"posts:{locale}", entry => {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1);
            return _reader.Collection("posts", locale);
        }) ?? Array.Empty<WebhouseDocument>();
    }
}
```

Invalidate the cache when content changes via CMS admin webhook.

## Related

- **F125** — Framework-Agnostic Content Platform (this example is part of it)
- **F126** — Framework-Agnostic Build Pipeline (let CMS admin's Build button run `dotnet publish`)
- [docs.webhouse.app/docs/consume-dotnet](https://docs.webhouse.app/docs/consume-dotnet) — full documentation
