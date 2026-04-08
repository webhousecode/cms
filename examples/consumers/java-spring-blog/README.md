# java-spring-blog — @webhouse/cms consumer example

A complete Spring Boot 3.4 application that reads @webhouse/cms JSON content and renders a bilingual blog.

**Stack:**
- Java 21
- Spring Boot 3.4
- Thymeleaf templates
- Jackson (JSON parsing)
- commonmark-java (markdown rendering)

**No database. No API. No CMS runtime.** Just `Files.list()` reading flat JSON files in `content/`.

## What this proves

@webhouse/cms is **not a TypeScript CMS**. It's a universal JSON content platform with a TypeScript admin. This Java app reads the exact same `content/posts/*.json` files that CMS admin writes — no translation layer, no API, no SDK.

When a content editor saves a post in CMS admin, this Spring Boot app sees the change on its next request. Zero glue code beyond `WebhouseReader.java` (~150 lines).

## Quick start

### Option 1: Run with Maven (requires Java 21)

```bash
cd examples/consumers/java-spring-blog
mvn spring-boot:run
```

Then open http://localhost:8080 — you should see two posts in English. Add `/da/` for Danish.

### Option 2: Run with Docker

```bash
cd examples/consumers/java-spring-blog
docker-compose up --build
```

Same result on http://localhost:8080.

## How it works

```
content/                    ← @webhouse/cms JSON files
  posts/
    hello-world.json        ← English post
    hello-world-da.json     ← Danish translation (same translationGroup)
    why-java.json
    why-java-da.json

src/main/java/app/webhouse/cmsreader/
  WebhouseReader.java       ← reads JSON files from content/
  WebhouseDocument.java     ← typed wrapper around the JSON shape
  MarkdownService.java      ← renders richtext (markdown) to HTML
  BlogController.java       ← Spring routes
  Application.java          ← Spring Boot entry point

src/main/resources/templates/
  home.html                 ← post list (Thymeleaf)
  post.html                 ← single post detail
```

The reader's API:

```java
WebhouseReader cms = new WebhouseReader("content");

// All published English posts
List<WebhouseDocument> posts = cms.collection("posts", "en");

// One specific post
Optional<WebhouseDocument> post = cms.document("posts", "hello-world");

// Find the Danish translation via translationGroup
Optional<WebhouseDocument> translation = cms.findTranslation(post.get(), "posts");
```

## Connecting CMS admin

To edit content visually:

1. Run CMS admin (e.g. via Docker on port 3010)
2. In CMS admin → Sites → Add new site
3. **Config path:** absolute path to this folder's `cms.config.ts`
4. **Content directory:** absolute path to this folder's `content/`
5. Click "Validate site" — should show ✓ All good
6. Open the Posts collection → edit a post → Save
7. Reload http://localhost:8080 — changes are live

## i18n via translationGroup

Every post has a `translationGroup` UUID that links it to its translation:

```json
// hello-world.json
{ "slug": "hello-world", "locale": "en", "translationGroup": "9b5f5e6c-..." }

// hello-world-da.json
{ "slug": "hello-world-da", "locale": "da", "translationGroup": "9b5f5e6c-..." }
```

The Spring Boot app uses `cms.findTranslation(post, "posts")` to render a "Read in DA" link at the bottom of each post.

## Security

`WebhouseReader` validates collection names and slugs against `^[a-z0-9][a-z0-9-]*$` before resolving paths, preventing directory traversal attacks. Slugs containing `..` or `/` are rejected.

## Production deployment

- **Fly.io:** Use the included Dockerfile, deploy with `fly launch`
- **Heroku/Render:** Spring Boot apps work out of the box
- **Bare-metal:** `mvn package` produces a `target/*.jar` runnable JAR
- **Traditional Tomcat:** Change packaging to `war` in pom.xml

## Caching

For production, wrap the reader in a Spring `@Cacheable`:

```java
@Service
public class CachedWebhouse {
    private final WebhouseReader reader;

    @Cacheable("posts")
    public List<WebhouseDocument> posts(String locale) {
        return reader.collection("posts", locale);
    }
}
```

Invalidate the cache when content changes via CMS admin webhook.

## Related

- **F125** — Framework-Agnostic Content Platform (this example is part of it)
- **F126** — Framework-Agnostic Build Pipeline (let CMS admin's Build button run `mvn package`)
- [docs.webhouse.app/docs/consume-java](https://docs.webhouse.app/docs/consume-java) — full documentation
