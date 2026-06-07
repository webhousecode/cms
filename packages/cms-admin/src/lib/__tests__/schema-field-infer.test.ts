/**
 * schema-field-infer tests.
 *
 * Background: 2026-06-07 production incident — the "Add to schema" drift
 * banner button (POST /api/cms/schema-drift/add-to-schema) asked an LLM to
 * rewrite the WHOLE cms.config.ts and wrote the raw model output to disk
 * unvalidated. The model returned a markdown explanation instead of code and
 * the config (sent truncated to 8KB) was destroyed — all collections vanished
 * from webhouse.dk's admin. These tests pin the deterministic replacement:
 * rule-based type inference + surgical insertion that touches nothing else +
 * a structural guard that refuses to write a damaged config.
 */
import { describe, it, expect } from "vitest";
import {
  inferFieldType,
  humanizeLabel,
  serializeFieldLine,
  findMatchingBracket,
  locateCollectionFieldsArray,
  insertFieldsIntoCollection,
  assertConfigStructureIntact,
} from "../schema-field-infer";

// A realistic config slice mirroring webhouse-site's shape: string-literal
// brackets in labels, urlPattern, nested array fields, an empty fields array.
const CONFIG = `import { defineConfig, defineCollection, defineBlock } from '@webhouse/cms';

export default defineConfig({
  locales: ['da', 'en'],
  defaultLocale: 'da',
  blocks: [
    defineBlock({ name: "carousel", label: "Carousel", fields: [{ name: "images", type: "image-gallery" }] }),
  ],
  collections: [
    defineCollection({
      name: "posts",
      label: "Posts",
      urlPrefix: "/blog",
      urlPattern: "/:category/:slug",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "content", type: "richtext" },
      ],
    }),
    defineCollection({
      name: "pages",
      label: "Pages",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "stats", type: "array", label: "Stats [home]", fields: [
          { name: "value", type: "text", label: "Value" },
        ]},
      ],
    }),
    defineCollection({
      name: "empty",
      label: "Empty",
      fields: [],
    }),
  ],
  forms: [
    { name: "contact", label: "Contact", fields: [{ name: "email", type: "email" }] },
  ],
});
`;

describe("inferFieldType", () => {
  it("infers scalars", () => {
    expect(inferFieldType([true]).type).toBe("boolean");
    expect(inferFieldType([42]).type).toBe("number");
    expect(inferFieldType(["hello"]).type).toBe("text");
  });

  it("infers date / image / richtext / textarea from strings", () => {
    expect(inferFieldType(["2026-06-07T09:00:00Z"]).type).toBe("date");
    expect(inferFieldType(["/uploads/123-pic.jpeg"]).type).toBe("image");
    expect(inferFieldType(["https://x.test/a.png"]).type).toBe("image");
    expect(inferFieldType(["<p>rich</p>"]).type).toBe("richtext");
    expect(inferFieldType(["line one\nline two"]).type).toBe("textarea");
    expect(inferFieldType(["x".repeat(200)]).type).toBe("textarea");
  });

  it("infers tags for string arrays and empty arrays", () => {
    expect(inferFieldType([["a", "b"]]).type).toBe("tags");
    expect(inferFieldType([[]]).type).toBe("tags");
  });

  it("infers array-with-nested-fields for arrays of objects", () => {
    const inf = inferFieldType([[{ label: "L", href: "/x" }]]);
    expect(inf.type).toBe("array");
    expect(inf.fields?.map((f) => f.name).sort()).toEqual(["href", "label"]);
  });

  it("infers object with nested fields", () => {
    const inf = inferFieldType([{ a: 1, b: "hi" }]);
    expect(inf.type).toBe("object");
    expect(inf.fields?.find((f) => f.name === "a")?.type).toBe("number");
  });

  it("falls back to text for null-only samples", () => {
    expect(inferFieldType([null, undefined]).type).toBe("text");
  });
});

describe("humanizeLabel", () => {
  it("sentence-cases camelCase names", () => {
    expect(humanizeLabel("titleHighlight")).toBe("Title highlight");
    expect(humanizeLabel("coverImage")).toBe("Cover image");
    expect(humanizeLabel("sort_order")).toBe("Sort order");
  });
});

describe("serializeFieldLine", () => {
  it("emits a valid field line", () => {
    expect(serializeFieldLine("coverImage", { type: "image" })).toBe(
      `{ name: "coverImage", type: "image", label: "Cover image" },`,
    );
  });
  it("emits nested fields for arrays", () => {
    const line = serializeFieldLine("items", { type: "array", fields: [{ name: "url", type: "text" }] });
    expect(line).toContain(`type: "array"`);
    expect(line).toContain(`fields: [{ name: "url", type: "text", label: "Url" }]`);
  });
});

describe("findMatchingBracket", () => {
  it("ignores brackets inside string literals", () => {
    const s = `[ "a [b] c", "d" ]`;
    expect(findMatchingBracket(s, 0)).toBe(s.length - 1);
  });
});

describe("locateCollectionFieldsArray", () => {
  it("finds the right collection even when names collide with field labels", () => {
    const loc = locateCollectionFieldsArray(CONFIG, "pages");
    expect(loc).not.toBeNull();
    // The located slice must be the pages fields array (contains "stats"), and
    // its closing bracket must come after the string-literal "Stats [home]".
    const inner = CONFIG.slice(loc!.openIdx, loc!.closeIdx + 1);
    expect(inner).toContain("stats");
    expect(inner).toContain("Stats [home]");
    expect(inner).not.toContain('name: "empty"');
  });
});

describe("insertFieldsIntoCollection", () => {
  it("inserts into a populated collection and preserves everything else", () => {
    const out = insertFieldsIntoCollection(CONFIG, "posts", [
      serializeFieldLine("coverImage", { type: "image" }),
      serializeFieldLine("titleHighlight", { type: "text" }),
    ]);
    expect(out).toContain(`{ name: "coverImage", type: "image", label: "Cover image" },`);
    expect(out).toContain(`{ name: "titleHighlight", type: "text", label: "Title highlight" },`);
    // Untouched siblings survive byte-for-byte.
    expect(out).toContain(`urlPattern: "/:category/:slug"`);
    expect(out).toContain(`locales: ['da', 'en']`);
    expect(out).toContain(`forms: [`);
    expect(out).toContain(`Stats [home]`);
    // Original posts fields still present.
    expect(out).toContain(`{ name: "title", type: "text", required: true },`);
  });

  it("inserts into an empty fields array", () => {
    const out = insertFieldsIntoCollection(CONFIG, "empty", [
      serializeFieldLine("name", { type: "text" }),
    ]);
    expect(out).toContain(`{ name: "name", type: "text", label: "Name" },`);
    // pages/posts arrays untouched.
    expect(out).toContain(`urlPattern: "/:category/:slug"`);
  });

  it("throws (does not corrupt) when the collection can't be found", () => {
    expect(() => insertFieldsIntoCollection(CONFIG, "nonexistent", ["x"])).toThrow();
  });
});

describe("assertConfigStructureIntact", () => {
  const colls = ["posts", "pages", "empty"];
  it("passes for a valid insertion", () => {
    const out = insertFieldsIntoCollection(CONFIG, "posts", [
      serializeFieldLine("coverImage", { type: "image" }),
    ]);
    expect(() => assertConfigStructureIntact(CONFIG, out, colls, ["coverImage"])).not.toThrow();
  });
  it("rejects output missing defineConfig (the AI-prose failure mode)", () => {
    const garbage = "# Schema Update for blocks\n\nHere is the config...";
    expect(() => assertConfigStructureIntact(CONFIG, garbage, colls, ["coverImage"])).toThrow();
  });
  it("rejects output that dropped a collection", () => {
    const dropped = CONFIG.replace(/name: "empty"/, 'name: "renamed"');
    expect(() => assertConfigStructureIntact(CONFIG, dropped + " ", colls, [])).toThrow(/empty/);
  });
  it("rejects output that didn't actually add the field", () => {
    expect(() => assertConfigStructureIntact(CONFIG, CONFIG + "  ", colls, ["coverImage"])).toThrow(/coverImage/);
  });
});
