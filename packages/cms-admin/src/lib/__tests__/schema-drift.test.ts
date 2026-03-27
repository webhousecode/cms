import { describe, it, expect } from "vitest";

// Inline helper — same logic that will be in the API route
const SYSTEM_KEYS = new Set([
  "slug", "status", "id", "createdAt", "updatedAt",
  "_fieldMeta", "_lastEditedBy", "_trashedAt", "_trashedBy",
  "_lockedFields", "locale", "translationOf",
  "publishAt", "unpublishAt",
]);

interface FieldConfig {
  name: string;
  type: string;
}

interface Doc {
  data: Record<string, unknown>;
}

function detectDrift(
  schemaFields: FieldConfig[],
  docs: Doc[],
): string[] {
  if (docs.length === 0) return [];
  const schemaKeys = new Set(schemaFields.map((f) => f.name));
  const contentKeys = new Set<string>();
  for (const doc of docs) {
    for (const key of Object.keys(doc.data)) {
      if (!SYSTEM_KEYS.has(key) && !key.startsWith("_")) {
        contentKeys.add(key);
      }
    }
  }
  // Keys in content but NOT in schema = drift
  return [...contentKeys].filter((k) => !schemaKeys.has(k)).sort();
}

describe("Schema Drift Detection", () => {
  it("returns empty array when schema matches content", () => {
    const fields: FieldConfig[] = [
      { name: "title", type: "text" },
      { name: "body", type: "richtext" },
      { name: "date", type: "date" },
    ];
    const docs: Doc[] = [
      { data: { title: "Hello", body: "World", date: "2026-01-01" } },
    ];
    expect(detectDrift(fields, docs)).toEqual([]);
  });

  it("detects fields in content but missing from schema", () => {
    const fields: FieldConfig[] = [
      { name: "title", type: "text" },
    ];
    const docs: Doc[] = [
      { data: { title: "Hello", body: "World", excerpt: "Short" } },
    ];
    expect(detectDrift(fields, docs)).toEqual(["body", "excerpt"]);
  });

  it("ignores system keys", () => {
    const fields: FieldConfig[] = [
      { name: "title", type: "text" },
    ];
    const docs: Doc[] = [
      { data: { title: "Hello", _fieldMeta: {}, _lastEditedBy: "user", _trashedAt: null } },
    ];
    expect(detectDrift(fields, docs)).toEqual([]);
  });

  it("ignores keys starting with underscore", () => {
    const fields: FieldConfig[] = [
      { name: "title", type: "text" },
    ];
    const docs: Doc[] = [
      { data: { title: "Hello", _customMeta: "foo", _internal: true } },
    ];
    expect(detectDrift(fields, docs)).toEqual([]);
  });

  it("returns empty for empty docs array", () => {
    const fields: FieldConfig[] = [
      { name: "title", type: "text" },
      { name: "body", type: "richtext" },
    ];
    expect(detectDrift(fields, [])).toEqual([]);
  });

  it("does NOT warn about extra schema fields (normal for new fields)", () => {
    const fields: FieldConfig[] = [
      { name: "title", type: "text" },
      { name: "body", type: "richtext" },
      { name: "newField", type: "text" }, // in schema but not in content
    ];
    const docs: Doc[] = [
      { data: { title: "Hello", body: "World" } },
    ];
    expect(detectDrift(fields, docs)).toEqual([]);
  });

  it("collects keys across multiple docs", () => {
    const fields: FieldConfig[] = [
      { name: "title", type: "text" },
    ];
    const docs: Doc[] = [
      { data: { title: "A", author: "Bob" } },
      { data: { title: "B", category: "News" } },
      { data: { title: "C", author: "Alice", tags: ["x"] } },
    ];
    expect(detectDrift(fields, docs)).toEqual(["author", "category", "tags"]);
  });

  it("handles docs with no data keys", () => {
    const fields: FieldConfig[] = [
      { name: "title", type: "text" },
    ];
    const docs: Doc[] = [
      { data: {} },
    ];
    expect(detectDrift(fields, docs)).toEqual([]);
  });
});
