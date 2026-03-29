import { describe, it, expect } from "vitest";
import { generateRssFeed } from "../build/rss.js";

const mockContext = {
  config: {
    collections: [
      { name: "posts", label: "Blog Posts", urlPrefix: "/posts", fields: [] },
      { name: "pages", label: "Pages", urlPrefix: "/pages", fields: [] },
    ],
    defaultLocale: "en",
  },
  collections: {
    posts: [
      { id: "1", slug: "hello-world", status: "published", data: { title: "Hello World", content: "<p>This is a test post about building things.</p>", excerpt: "A test post" }, createdAt: "2026-03-20T10:00:00Z", updatedAt: "2026-03-28T10:00:00Z" },
      { id: "2", slug: "second-post", status: "published", data: { title: "Second Post", content: "Plain text" }, createdAt: "2026-03-18T10:00:00Z", updatedAt: "2026-03-27T10:00:00Z" },
    ],
    pages: [
      { id: "3", slug: "about", status: "published", data: { title: "About Us", description: "We are a great company" }, createdAt: "2026-01-01T10:00:00Z", updatedAt: "2026-03-15T10:00:00Z" },
    ],
  },
} as any;

describe("RSS Feed Generator", () => {
  it("generates valid RSS 2.0 XML", () => {
    const xml = generateRssFeed(mockContext, "https://example.com");
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<channel>");
    expect(xml).toContain("</channel>");
    expect(xml).toContain("</rss>");
  });

  it("includes all items from all collections by default", () => {
    const xml = generateRssFeed(mockContext, "https://example.com");
    expect(xml).toContain("<title>Hello World</title>");
    expect(xml).toContain("<title>Second Post</title>");
    expect(xml).toContain("<title>About Us</title>");
  });

  it("respects collection filter", () => {
    const xml = generateRssFeed(mockContext, "https://example.com", { collections: ["posts"] });
    expect(xml).toContain("<title>Hello World</title>");
    expect(xml).toContain("<title>Second Post</title>");
    expect(xml).not.toContain("<title>About Us</title>");
  });

  it("sorts by date descending", () => {
    const xml = generateRssFeed(mockContext, "https://example.com");
    const helloIdx = xml.indexOf("Hello World");
    const secondIdx = xml.indexOf("Second Post");
    const aboutIdx = xml.indexOf("About Us");
    expect(helloIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(aboutIdx);
  });

  it("respects maxItems limit", () => {
    const xml = generateRssFeed(mockContext, "https://example.com", { maxItems: 1 });
    expect(xml).toContain("Hello World");
    expect(xml).not.toContain("Second Post");
    expect(xml).not.toContain("About Us");
  });

  it("generates correct URLs with baseUrl", () => {
    const xml = generateRssFeed(mockContext, "https://example.com");
    expect(xml).toContain("<link>https://example.com/posts/hello-world/</link>");
  });

  it("strips trailing slash from baseUrl", () => {
    const xml = generateRssFeed(mockContext, "https://example.com/");
    expect(xml).toContain("<link>https://example.com</link>");
  });

  it("includes atom:link self-reference", () => {
    const xml = generateRssFeed(mockContext, "https://example.com");
    expect(xml).toContain('href="https://example.com/feed.xml"');
    expect(xml).toContain('type="application/rss+xml"');
  });

  it("uses excerpt for description when available", () => {
    const xml = generateRssFeed(mockContext, "https://example.com");
    expect(xml).toContain("A test post");
  });

  it("strips HTML from descriptions", () => {
    const xml = generateRssFeed(mockContext, "https://example.com", { collections: ["posts"] });
    expect(xml).not.toContain("<p>");
  });

  it("uses custom title and description", () => {
    const xml = generateRssFeed(mockContext, "https://example.com", { title: "My Blog", description: "My blog feed" });
    expect(xml).toContain("<title>My Blog</title>");
    expect(xml).toContain("<description>My blog feed</description>");
  });

  it("sets language from config or override", () => {
    const xml = generateRssFeed(mockContext, "https://example.com", { language: "da" });
    expect(xml).toContain("<language>da</language>");
  });

  it("escapes XML special characters", () => {
    const ctx = {
      ...mockContext,
      collections: {
        posts: [{ id: "1", slug: "test", status: "published", data: { title: "Tom & Jerry's <Adventure>", content: "" }, createdAt: "2026-03-28T10:00:00Z", updatedAt: "2026-03-28T10:00:00Z" }],
        pages: [],
      },
    } as any;
    const xml = generateRssFeed(ctx, "https://example.com");
    expect(xml).toContain("Tom &amp; Jerry&apos;s &lt;Adventure&gt;");
  });
});
