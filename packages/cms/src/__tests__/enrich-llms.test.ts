/**
 * F206.5 — llms.txt / llms-full.txt / sitemap from enrichDist describe the
 * site the way a reader (or an AI) needs it: sections, no tag noise, no
 * duplicates, real lastmod.
 *
 * Measured on www.trailmem.com before this card (3 Oct 2026): one flat
 * "## Pages" list where ~40 /tags/ pages dominated, "As We May Think" listed
 * twice, no llms-full.txt, and lastmod = build date on all 65 URLs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { enrichDist } from "../enrich/index";

const BASE = "https://site.example";

function page(dist: string, rel: string, title: string, head = "") {
  const full = path.join(dist, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `<!DOCTYPE html><html><head><title>${title}</title>${head}</head><body><p>${title}</p></body></html>`);
}

function doc(content: string, collection: string, slug: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const dir = path.join(content, collection);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify({ slug, status: "published", data, ...extra }));
}

let root: string;
let dist: string;
let llms: string;
let full: string;
let sitemap: string;

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "enrich-llms-"));
  dist = path.join(root, "dist");
  const content = path.join(root, "project", "content");

  page(dist, "index.html", "Home");
  page(dist, "about/index.html", "About us");
  page(dist, "posts/first/index.html", "First post");
  page(dist, "posts/second/index.html", "Second post");
  page(dist, "posts/third/index.html", "Third post");
  page(dist, "tags/ai/index.html", "Tag: ai");
  page(dist, "tags/memory/index.html", "Tag: memory");
  page(dist, "categories/essays/index.html", "Category: essays");
  // Same document reachable at two URLs; the second declares the first canonical.
  page(dist, "concept/index.html", "As We May Think");
  page(dist, "trails/concept/index.html", "As We May Think", `<link rel="canonical" href="${BASE}/concept/">`);
  // Same title + description at two URLs, both self-canonical — still one entry.
  page(dist, "dup-a/index.html", "Twin page");
  page(dist, "dup-b/index.html", "Twin page");

  doc(content, "pages", "about", { title: "About us", description: "Who we are." }, { updatedAt: "2026-09-01T10:00:00.000Z" });
  doc(content, "pages", "concept", { title: "As We May Think", description: "The 1945 essay." }, { updatedAt: "2026-08-15T10:00:00.000Z" });
  doc(content, "posts", "first", { title: "First post", excerpt: "One.", category: "Essays", content: "# First\n\nThe body of the **first** post, long enough to be exported in full." }, { updatedAt: "2026-07-01T00:00:00.000Z" });
  doc(content, "posts", "second", { title: "Second post", excerpt: "Two.", category: "Essays", date: "2026-06-20", content: "Second body with enough characters to count as real content for export." });
  doc(content, "posts", "third", { title: "Third post", excerpt: "Three.", category: "Notes", content: "Third body with enough characters to count as real content for export." }, { updatedAt: "2026-05-05T00:00:00.000Z" });

  await enrichDist(dist, content, {
    baseUrl: BASE,
    basePath: "",
    siteName: "Site",
    siteDescription: "A test site",
    extraPages: [
      { path: "/demo/", title: "Live demo", description: "Try it in the browser.", section: "Product" },
    ],
  });

  llms = readFileSync(path.join(dist, "llms.txt"), "utf-8");
  full = existsSync(path.join(dist, "llms-full.txt")) ? readFileSync(path.join(dist, "llms-full.txt"), "utf-8") : "";
  sitemap = readFileSync(path.join(dist, "sitemap.xml"), "utf-8");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const linesOf = (s: string, needle: string) => s.split("\n").filter((l) => l.includes(needle));

describe("llms.txt sections (F206.5)", () => {
  it("puts home and pages first, then one section per collection", () => {
    const pagesIdx = llms.indexOf("## Pages");
    const postsIdx = llms.indexOf("## Posts");
    expect(pagesIdx).toBeGreaterThan(-1);
    expect(postsIdx).toBeGreaterThan(pagesIdx);
    expect(llms.slice(pagesIdx, postsIdx)).toContain(`[Home](${BASE}/)`);
    expect(llms.slice(pagesIdx, postsIdx)).toContain(`[About us](${BASE}/about/)`);
  });

  it("groups articles by category", () => {
    const essays = llms.indexOf("### Essays");
    const notes = llms.indexOf("### Notes");
    expect(essays).toBeGreaterThan(llms.indexOf("## Posts"));
    expect(notes).toBeGreaterThan(-1);
    const essaysBlock = llms.slice(essays, notes > essays ? notes : undefined);
    expect(essaysBlock).toContain("First post");
    expect(essaysBlock).toContain("Second post");
    expect(essaysBlock).not.toContain("Third post");
  });

  it("does not list taxonomy pages one by one — at most one summary line", () => {
    expect(linesOf(llms, "/tags/ai/")).toEqual([]);
    expect(linesOf(llms, "/tags/memory/")).toEqual([]);
    expect(linesOf(llms, "/categories/essays/")).toEqual([]);
    expect(linesOf(llms, "/tags/").length).toBeLessThanOrEqual(1);
  });

  it("lists a page whose canonical points elsewhere only once", () => {
    expect(linesOf(llms, "As We May Think")).toHaveLength(1);
    expect(linesOf(llms, "/trails/concept/")).toEqual([]);
  });

  it("collapses two self-canonical URLs with the same title and description", () => {
    expect(linesOf(llms, "Twin page")).toHaveLength(1);
  });

  it("adds extraPages to their named section", () => {
    const product = llms.indexOf("## Product");
    expect(product).toBeGreaterThan(-1);
    expect(llms.slice(product)).toContain(`- [Live demo](${BASE}/demo/): Try it in the browser.`);
  });
});

describe("llms-full.txt (F206.5)", () => {
  it("exists and carries each document's body", () => {
    expect(full).toContain("The body of the **first** post");
    expect(full).toContain("Second body with enough characters");
    expect(full).toContain(`${BASE}/posts/first/`);
  });

  it("does not overwrite a llms-full.txt the site shipped itself", async () => {
    const own = mkdtempSync(path.join(tmpdir(), "enrich-own-"));
    page(path.join(own, "dist"), "index.html", "Home");
    writeFileSync(path.join(own, "dist", "llms-full.txt"), "SITE-OWN");
    await enrichDist(path.join(own, "dist"), path.join(own, "content"), { baseUrl: BASE, basePath: "", siteName: "S", siteDescription: "d" });
    expect(readFileSync(path.join(own, "dist", "llms-full.txt"), "utf-8")).toBe("SITE-OWN");
    rmSync(own, { recursive: true, force: true });
  });
});

describe("sitemap.xml (F206.5)", () => {
  const entry = (loc: string) => {
    const m = sitemap.match(new RegExp(`<url>\\s*<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>([\\s\\S]*?)</url>`));
    return m ? m[1] : null;
  };

  it("uses the document's updatedAt as lastmod", () => {
    expect(entry(`${BASE}/posts/first/`)).toContain("<lastmod>2026-07-01</lastmod>");
    expect(entry(`${BASE}/about/`)).toContain("<lastmod>2026-09-01</lastmod>");
  });

  it("falls back to the document's date", () => {
    expect(entry(`${BASE}/posts/second/`)).toContain("<lastmod>2026-06-20</lastmod>");
  });

  it("never writes the build date — a page without a document gets no lastmod", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(sitemap).not.toContain(`<lastmod>${today}</lastmod>`);
    expect(entry(`${BASE}/tags/ai/`)).not.toContain("<lastmod>");
  });

  it("leaves out a URL whose canonical points elsewhere", () => {
    expect(entry(`${BASE}/trails/concept/`)).toBeNull();
    expect(entry(`${BASE}/concept/`)).not.toBeNull();
  });

  it("includes extraPages that the dist does not already list", () => {
    expect(entry(`${BASE}/demo/`)).not.toBeNull();
  });
});
