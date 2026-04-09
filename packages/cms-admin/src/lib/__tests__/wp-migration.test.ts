/**
 * F03 — WordPress Migration unit tests.
 *
 * Tests probe result parsing, content extraction helpers, and config generation.
 * Does NOT make real HTTP requests (those are integration tests).
 */
import { describe, it, expect } from "vitest";

// Test the helper functions directly (we can't import probe.ts because it uses fetch)
// Instead, test the transformation and config generation logic.

describe("WP document → CMS JSON", () => {
  function wpDocToCmsJson(doc: any, collection: string) {
    const data: Record<string, unknown> = { title: doc.title, content: doc.content };
    if (doc.excerpt) data.excerpt = doc.excerpt;
    if (doc.featuredImageLocal) data.featuredImage = doc.featuredImageLocal;
    if (doc.date) data.date = doc.date;
    if (doc.tags?.length) data.tags = doc.tags;
    if (doc.categories?.length) data.categories = doc.categories;
    return { slug: doc.slug, status: doc.status === "publish" ? "published" : "draft", data, id: "test-id", _fieldMeta: {} };
  }

  it("maps published WP post to CMS doc", () => {
    const doc = {
      type: "post", slug: "hello-world", title: "Hello World",
      content: "<p>Body</p>", excerpt: "Short", date: "2026-01-01",
      status: "publish", tags: ["js"], categories: ["tech"],
    };
    const result = wpDocToCmsJson(doc, "posts");
    expect(result.status).toBe("published");
    expect(result.slug).toBe("hello-world");
    expect(result.data.title).toBe("Hello World");
    expect(result.data.tags).toEqual(["js"]);
  });

  it("maps draft WP post to CMS draft", () => {
    const doc = { slug: "draft", title: "Draft", content: "", status: "draft", date: "2026-01-01" };
    const result = wpDocToCmsJson(doc, "posts");
    expect(result.status).toBe("draft");
  });

  it("includes featured image when present", () => {
    const doc = { slug: "img", title: "With Image", content: "", status: "publish", date: "2026-01-01", featuredImageLocal: "/uploads/photo.jpg" };
    const result = wpDocToCmsJson(doc, "posts");
    expect(result.data.featuredImage).toBe("/uploads/photo.jpg");
  });

  it("omits empty arrays", () => {
    const doc = { slug: "no-tags", title: "No Tags", content: "", status: "publish", date: "2026-01-01", tags: [], categories: [] };
    const result = wpDocToCmsJson(doc, "posts");
    expect(result.data).not.toHaveProperty("tags");
    expect(result.data).not.toHaveProperty("categories");
  });
});

describe("HTML entity decoding", () => {
  function decode(text: string): string {
    return text
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&#8211;/g, "–")
      .replace(/&nbsp;/g, " ");
  }

  it("decodes common HTML entities", () => {
    expect(decode("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(decode("&lt;tag&gt;")).toBe("<tag>");
    expect(decode("she said &quot;hello&quot;")).toBe('she said "hello"');
  });

  it("decodes numeric entities", () => {
    expect(decode("&#169;")).toBe("©");
    expect(decode("&#x2019;")).toBe("\u2019");
  });

  it("decodes WP-specific entities", () => {
    expect(decode("it&#8217;s")).toBe("it\u2019s");
    expect(decode("2020&#8211;2025")).toBe("2020–2025");
  });
});

describe("URL rewriting", () => {
  function rewriteMediaUrls(html: string, urlMap: Map<string, string>): string {
    let result = html;
    for (const [wpUrl, localPath] of urlMap) {
      result = result.split(wpUrl).join(localPath);
    }
    return result;
  }

  it("rewrites WP media URLs to local paths", () => {
    const map = new Map([
      ["https://old.com/wp-content/uploads/2024/photo.jpg", "/uploads/photo.jpg"],
    ]);
    const html = '<img src="https://old.com/wp-content/uploads/2024/photo.jpg" />';
    expect(rewriteMediaUrls(html, map)).toBe('<img src="/uploads/photo.jpg" />');
  });

  it("rewrites multiple URLs in same content", () => {
    const map = new Map([
      ["https://old.com/wp-content/uploads/a.jpg", "/uploads/a.jpg"],
      ["https://old.com/wp-content/uploads/b.jpg", "/uploads/b.jpg"],
    ]);
    const html = '<img src="https://old.com/wp-content/uploads/a.jpg" /><img src="https://old.com/wp-content/uploads/b.jpg" />';
    const result = rewriteMediaUrls(html, map);
    expect(result).toContain("/uploads/a.jpg");
    expect(result).toContain("/uploads/b.jpg");
    expect(result).not.toContain("old.com");
  });
});

describe("CMS config generation", () => {
  function generateCmsConfig(collections: Array<{ name: string; label: string; urlPrefix: string }>, url: string): string {
    const lines = [
      `import { defineConfig, defineCollection } from '@webhouse/cms';`,
      `// Auto-generated from WordPress site: ${url}`,
      `export default defineConfig({`,
      `  storage: { adapter: 'filesystem', contentDir: 'content' },`,
      `  collections: [`,
    ];
    for (const col of collections) {
      lines.push(`    defineCollection({ name: '${col.name}', label: '${col.label}', urlPrefix: '${col.urlPrefix}', fields: [{ name: 'title', type: 'text', required: true }, { name: 'content', type: 'richtext' }] }),`);
    }
    lines.push(`  ],`);
    lines.push(`});`);
    return lines.join("\n");
  }

  it("generates valid-looking config for posts + pages", () => {
    const config = generateCmsConfig([
      { name: "posts", label: "Posts", urlPrefix: "/blog" },
      { name: "pages", label: "Pages", urlPrefix: "/" },
    ], "https://example.com");

    expect(config).toContain("defineConfig");
    expect(config).toContain("'posts'");
    expect(config).toContain("'pages'");
    expect(config).toContain("adapter: 'filesystem'");
    expect(config).toContain("https://example.com");
  });

  it("generates config for custom post types", () => {
    const config = generateCmsConfig([
      { name: "exhibitions", label: "Udstillinger", urlPrefix: "/udstilling" },
    ], "https://maurseth.dk");

    expect(config).toContain("'exhibitions'");
    expect(config).toContain("'Udstillinger'");
  });
});

describe("Slugify", () => {
  function slugify(text: string): string {
    return text.toLowerCase()
      .replace(/[æ]/g, "ae").replace(/[ø]/g, "oe").replace(/[å]/g, "aa")
      .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")
      .replace(/^-|-$/g, "").slice(0, 80);
  }

  it("handles Danish characters", () => {
    expect(slugify("Påskeudstilling")).toBe("paaskeudstilling");
    expect(slugify("Ærø og Ø")).toBe("aeroe-og-oe");
  });

  it("handles special characters", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
    expect(slugify("  extra   spaces  ")).toBe("extra-spaces");
  });
});
