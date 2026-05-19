import { describe, it, expect } from "vitest";
import type { CollectionConfig } from "@webhouse/cms";
import {
  collectTranslatableFields,
  findReadTimeField,
  findPrimaryBodyField,
  computeReadingMinutes,
  TRANSLATABLE_TYPES,
} from "../ai/translation-helpers";

const sampleCollection: CollectionConfig = {
  name: "posts",
  fields: [
    { name: "title", type: "text" },
    { name: "excerpt", type: "textarea" },
    { name: "body", type: "richtext" },
    { name: "tags", type: "tags" },
    { name: "readTimeMin", type: "number" },
    { name: "publishedAt", type: "date" },
    { name: "heroImage", type: "image" },
  ],
};

describe("collectTranslatableFields", () => {
  it("includes text/textarea/richtext + tags array, skips dates/images/numbers", () => {
    const data = {
      title: "Hello",
      excerpt: "  intro  ",
      body: "<p>Body</p>",
      tags: ["health", "training"],
      readTimeMin: 5,
      publishedAt: "2026-05-19",
      heroImage: "/img.png",
    };
    const result = collectTranslatableFields(data, sampleCollection.fields);
    expect(result).toEqual({
      title: "Hello",
      excerpt: "  intro  ",
      body: "<p>Body</p>",
      tags: ["health", "training"],
    });
  });

  it("drops empty tag entries and skips empty tag arrays", () => {
    const data = { title: "T", tags: ["", "  ", "ok"] };
    const result = collectTranslatableFields(data, sampleCollection.fields);
    expect(result.tags).toEqual(["ok"]);
  });

  it("omits empty strings and missing fields entirely", () => {
    const data = { title: "T", excerpt: "   ", body: "" };
    const result = collectTranslatableFields(data, sampleCollection.fields);
    expect(result).toEqual({ title: "T" });
  });

  it("declares tags as a translatable type", () => {
    expect(TRANSLATABLE_TYPES.has("tags")).toBe(true);
  });
});

describe("findReadTimeField", () => {
  it("matches readTimeMin", () => {
    const f = findReadTimeField(sampleCollection);
    expect(f?.name).toBe("readTimeMin");
  });

  it("matches readingTime, minutesToRead, læsetid", () => {
    const cases = ["readingTime", "minutesToRead", "minutes_to_read", "læsetid"];
    for (const name of cases) {
      const col: CollectionConfig = {
        name: "x",
        fields: [{ name, type: "number" }],
      };
      expect(findReadTimeField(col)?.name).toBe(name);
    }
  });

  it("ignores non-number fields with read-time names", () => {
    const col: CollectionConfig = {
      name: "x",
      fields: [
        { name: "readTime", type: "text" },
        { name: "readMin", type: "text" },
      ],
    };
    expect(findReadTimeField(col)).toBeUndefined();
  });

  it("returns undefined when no matching field exists", () => {
    const col: CollectionConfig = {
      name: "x",
      fields: [{ name: "duration", type: "number" }],
    };
    expect(findReadTimeField(col)).toBeUndefined();
  });
});

describe("findPrimaryBodyField", () => {
  it("prefers richtext", () => {
    expect(findPrimaryBodyField(sampleCollection)?.name).toBe("body");
  });

  it("falls back to htmldoc then textarea", () => {
    const col1: CollectionConfig = {
      name: "x",
      fields: [{ name: "html", type: "htmldoc" }, { name: "note", type: "textarea" }],
    };
    expect(findPrimaryBodyField(col1)?.name).toBe("html");

    const col2: CollectionConfig = {
      name: "x",
      fields: [{ name: "title", type: "text" }, { name: "note", type: "textarea" }],
    };
    expect(findPrimaryBodyField(col2)?.name).toBe("note");
  });
});

describe("computeReadingMinutes", () => {
  it("returns 0 for empty input", () => {
    expect(computeReadingMinutes("")).toBe(0);
    expect(computeReadingMinutes("   ")).toBe(0);
    expect(computeReadingMinutes("<p>  </p>")).toBe(0);
  });

  it("returns at least 1 for any words", () => {
    expect(computeReadingMinutes("Hello world")).toBe(1);
  });

  it("strips HTML before counting", () => {
    const html = "<p>" + "word ".repeat(220) + "</p>";
    expect(computeReadingMinutes(html)).toBe(1);
  });

  it("scales with content (rounded to nearest minute)", () => {
    const text = "word ".repeat(440);
    expect(computeReadingMinutes(text)).toBe(2);
  });

  it("honors custom wpm", () => {
    const text = "word ".repeat(200);
    expect(computeReadingMinutes(text, 100)).toBe(2);
  });
});
