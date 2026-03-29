import { describe, it, expect } from "vitest";

// ── Inline helpers (same logic as implementation) ──────────

/** Strip HTML tags and decode basic entities */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract clean text from a document's content fields */
function extractContent(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (key.startsWith("_")) continue; // skip system fields
    if (typeof val === "string" && val.length > 50) {
      // Likely a content field — strip HTML if needed
      parts.push(val.includes("<") ? stripHtml(val) : val);
    }
  }
  return parts.join("\n\n");
}

interface Doc {
  slug: string;
  data: Record<string, unknown>;
  updatedAt?: string;
  locale?: string;
}

function generateLlmsFullTxt(
  collections: Record<string, Doc[]>,
  config: { collections: { name: string; label?: string }[] },
  baseUrl: string,
  siteName: string,
  siteDesc?: string,
): string {
  const lines: string[] = [];

  lines.push(`# ${siteName}`);
  lines.push("");
  if (siteDesc) {
    lines.push(`> ${siteDesc}`);
    lines.push("");
  }
  lines.push(`> Full content export for AI consumption. See also: [llms.txt](${baseUrl}/llms.txt)`);
  lines.push("");

  for (const col of config.collections) {
    const docs = collections[col.name] ?? [];
    if (docs.length === 0) continue;

    // Sort by updatedAt descending
    const sorted = [...docs].sort((a, b) =>
      new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
    );

    for (const doc of sorted) {
      const title = String(doc.data.title ?? doc.data.name ?? doc.slug);
      lines.push(`## ${col.name}/${doc.slug}`);
      lines.push("");
      lines.push(`Title: ${title}`);
      if (doc.updatedAt) lines.push(`Updated: ${doc.updatedAt.slice(0, 10)}`);
      if (doc.locale) lines.push(`Locale: ${doc.locale}`);
      lines.push("");

      const content = extractContent(doc.data);
      if (content) {
        lines.push(content);
      }

      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ── Tests ──────────────────────────────────────────────────

describe("llms-full.txt Generator (G03)", () => {
  const baseUrl = "https://example.com";
  const config = {
    collections: [
      { name: "posts", label: "Blog Posts" },
      { name: "pages", label: "Pages" },
    ],
  };

  const collections: Record<string, Doc[]> = {
    posts: [
      {
        slug: "hello-world",
        data: { title: "Hello World", content: "<h2>Introduction</h2><p>This is a test post with <strong>bold</strong> text.</p>", excerpt: "A test post" },
        updatedAt: "2026-03-28T10:00:00Z",
      },
      {
        slug: "second-post",
        data: { title: "Second Post", content: "Plain text content that is long enough to be included in the output for testing." },
        updatedAt: "2026-03-27T10:00:00Z",
      },
    ],
    pages: [
      {
        slug: "about",
        data: { title: "About Us", description: "We are a company that does things. This description is long enough to be included." },
        updatedAt: "2026-03-20T10:00:00Z",
      },
    ],
  };

  it("generates header with site name and description", () => {
    const txt = generateLlmsFullTxt(collections, config, baseUrl, "My Site", "A great site");
    expect(txt).toContain("# My Site");
    expect(txt).toContain("> A great site");
    expect(txt).toContain("llms.txt");
  });

  it("includes all documents grouped by collection", () => {
    const txt = generateLlmsFullTxt(collections, config, baseUrl, "Site");
    expect(txt).toContain("## posts/hello-world");
    expect(txt).toContain("## posts/second-post");
    expect(txt).toContain("## pages/about");
  });

  it("includes title and updated date", () => {
    const txt = generateLlmsFullTxt(collections, config, baseUrl, "Site");
    expect(txt).toContain("Title: Hello World");
    expect(txt).toContain("Updated: 2026-03-28");
  });

  it("strips HTML from rich text content", () => {
    const txt = generateLlmsFullTxt(collections, config, baseUrl, "Site");
    expect(txt).toContain("Introduction");
    expect(txt).toContain("bold");
    expect(txt).not.toContain("<h2>");
    expect(txt).not.toContain("<strong>");
    expect(txt).not.toContain("<p>");
  });

  it("includes plain text content as-is", () => {
    const txt = generateLlmsFullTxt(collections, config, baseUrl, "Site");
    expect(txt).toContain("Plain text content");
  });

  it("skips system fields starting with _", () => {
    const cols: Record<string, Doc[]> = {
      posts: [{ slug: "test", data: { title: "Test", _seo: { score: 80 }, _fieldMeta: {}, content: "This is a long enough content string to be included in the export for testing purposes." }, updatedAt: "2026-03-28T10:00:00Z" }],
    };
    const txt = generateLlmsFullTxt(cols, config, baseUrl, "Site");
    expect(txt).not.toContain("_seo");
    expect(txt).not.toContain("_fieldMeta");
    expect(txt).toContain("long enough content");
  });

  it("sorts documents by updatedAt descending", () => {
    const txt = generateLlmsFullTxt(collections, config, baseUrl, "Site");
    const helloIdx = txt.indexOf("posts/hello-world");
    const secondIdx = txt.indexOf("posts/second-post");
    expect(helloIdx).toBeLessThan(secondIdx); // hello-world is newer
  });

  it("skips empty collections", () => {
    const cols: Record<string, Doc[]> = { posts: [], pages: [{ slug: "home", data: { title: "Home", content: "Welcome to our site. This content is definitely long enough to be included." }, updatedAt: "2026-03-28T10:00:00Z" }] };
    const txt = generateLlmsFullTxt(cols, config, baseUrl, "Site");
    expect(txt).not.toContain("posts/");
    expect(txt).toContain("pages/home");
  });

  it("includes locale when present", () => {
    const cols: Record<string, Doc[]> = {
      posts: [{ slug: "hej", data: { title: "Hej", content: "Dansk indhold som er langt nok til at blive inkluderet i eksporten for testformål." }, locale: "da", updatedAt: "2026-03-28T10:00:00Z" }],
    };
    const txt = generateLlmsFullTxt(cols, config, baseUrl, "Site");
    expect(txt).toContain("Locale: da");
  });

  it("separates documents with ---", () => {
    const txt = generateLlmsFullTxt(collections, config, baseUrl, "Site");
    expect(txt.match(/---/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe("stripHtml", () => {
  it("removes tags and decodes entities", () => {
    expect(stripHtml("<p>Hello &amp; <strong>world</strong></p>")).toBe("Hello & world");
  });

  it("collapses multiple newlines", () => {
    expect(stripHtml("a\n\n\n\n\nb")).toBe("a\n\nb");
  });
});
