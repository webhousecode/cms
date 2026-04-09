/**
 * F02 — Import Engine unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  parseFile,
  parseMarkdownFiles,
  detectFormat,
  applyMappings,
  suggestMappings,
  slugify,
  type FieldMapping,
} from "../import-engine";

// ── Format detection ──

describe("detectFormat", () => {
  it("detects CSV", () => expect(detectFormat("data.csv")).toBe("csv"));
  it("detects TSV as CSV", () => expect(detectFormat("data.tsv")).toBe("csv"));
  it("detects JSON", () => expect(detectFormat("export.json")).toBe("json"));
  it("detects Markdown", () => expect(detectFormat("post.md")).toBe("markdown"));
  it("defaults to JSON", () => expect(detectFormat("unknown.txt")).toBe("json"));
});

// ── CSV parsing ──

describe("parseFile — CSV", () => {
  it("parses basic CSV with header", () => {
    const csv = "title,body,tags\nHello,World,a,b\nFoo,Bar,c";
    const { records, fields } = parseFile(csv, "csv");
    expect(fields).toContain("title");
    expect(fields).toContain("body");
    expect(records).toHaveLength(2);
    expect(records[0]).toHaveProperty("title", "Hello");
  });

  it("trims headers", () => {
    const csv = " title , body \nHello,World";
    const { fields } = parseFile(csv, "csv");
    expect(fields).toContain("title");
    expect(fields).toContain("body");
  });

  it("skips empty lines", () => {
    const csv = "title\nA\n\nB\n";
    const { records } = parseFile(csv, "csv");
    expect(records).toHaveLength(2);
  });
});

// ── JSON parsing ──

describe("parseFile — JSON", () => {
  it("parses array of objects", () => {
    const json = JSON.stringify([
      { title: "Post 1", body: "Content 1" },
      { title: "Post 2", body: "Content 2" },
    ]);
    const { records, fields } = parseFile(json, "json");
    expect(records).toHaveLength(2);
    expect(fields).toContain("title");
    expect(fields).toContain("body");
  });

  it("unwraps { data: [...] }", () => {
    const json = JSON.stringify({ data: [{ name: "A" }] });
    const { records } = parseFile(json, "json");
    expect(records).toHaveLength(1);
    expect(records[0]).toHaveProperty("name", "A");
  });

  it("wraps single object in array", () => {
    const json = JSON.stringify({ title: "Solo" });
    const { records } = parseFile(json, "json");
    expect(records).toHaveLength(1);
  });
});

// ── Markdown parsing ──

describe("parseFile — Markdown", () => {
  it("extracts frontmatter + content", () => {
    const md = `---\ntitle: Hello\ndate: 2026-01-01\n---\n\nBody text here.`;
    const { records, fields } = parseFile(md, "markdown", "hello.md");
    expect(records).toHaveLength(1);
    expect(records[0]).toHaveProperty("title", "Hello");
    expect(records[0]).toHaveProperty("content", "Body text here.");
    expect(records[0]).toHaveProperty("_fileName", "hello");
    expect(fields).toContain("title");
    expect(fields).toContain("content");
  });
});

describe("parseMarkdownFiles", () => {
  it("merges multiple markdown files", () => {
    const files = [
      { name: "a.md", content: "---\ntitle: A\n---\nBody A" },
      { name: "b.md", content: "---\ntitle: B\ntags: x,y\n---\nBody B" },
    ];
    const { records, fields } = parseMarkdownFiles(files);
    expect(records).toHaveLength(2);
    expect(fields).toContain("title");
    expect(fields).toContain("tags");
    expect(fields).toContain("content");
  });
});

// ── Slugify ──

describe("slugify", () => {
  it("lowercases and strips special chars", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });
  it("handles Danish characters", () => {
    expect(slugify("Ærø Ø Å")).toBe("aeroe-oe-aa");
  });
  it("collapses multiple dashes", () => {
    expect(slugify("a--b---c")).toBe("a-b-c");
  });
  it("limits length to 80", () => {
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(80);
  });
});

// ── Field mapping ──

describe("applyMappings", () => {
  const records = [
    { Name: "Post One", Body: "Content here", Published: "2026-01-15" },
    { Name: "Post Two", Body: "More content", Published: "invalid" },
  ];

  it("maps fields with transforms", () => {
    const mappings: FieldMapping[] = [
      { sourceField: "Name", targetField: "title", transform: "none" },
      { sourceField: "Body", targetField: "content", transform: "none" },
      { sourceField: "Published", targetField: "date", transform: "date-iso" },
    ];
    const rows = applyMappings(records, mappings, "title");
    expect(rows[0].valid).toBe(true);
    expect(rows[0].mappedData.title).toBe("Post One");
    expect(rows[0].slug).toBe("post-one");
    // Row 2 has invalid date
    expect(rows[1].errors.length).toBeGreaterThan(0);
  });

  it("split-comma produces array", () => {
    const rows = applyMappings(
      [{ tags: "a, b, c" }],
      [{ sourceField: "tags", targetField: "tags", transform: "split-comma" }],
      "tags",
    );
    expect(rows[0].mappedData.tags).toEqual(["a", "b", "c"]);
  });
});

// ── Auto-suggest mappings ──

describe("suggestMappings", () => {
  const schemaFields = [
    { name: "title", type: "text" },
    { name: "content", type: "richtext" },
    { name: "date", type: "date" },
    { name: "tags", type: "tags" },
    { name: "heroImage", type: "image" },
  ];

  it("matches exact field names", () => {
    const mappings = suggestMappings(["title", "content", "date"], schemaFields);
    expect(mappings).toHaveLength(3);
    expect(mappings.find((m) => m.sourceField === "title")?.targetField).toBe("title");
  });

  it("matches aliases (body → content)", () => {
    const mappings = suggestMappings(["body", "image"], schemaFields);
    expect(mappings.find((m) => m.sourceField === "body")?.targetField).toBe("content");
    expect(mappings.find((m) => m.sourceField === "image")?.targetField).toBe("heroImage");
  });

  it("skips internal fields", () => {
    const mappings = suggestMappings(["_id", "id", "status", "createdAt", "title"], schemaFields);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].sourceField).toBe("title");
  });
});
