import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkDocumentSchema } from "@/lib/document-schema";

const KIND = {
  name: "kind",
  type: "select",
  label: "Fulfillment-type",
  required: true,
  options: [
    { value: "digital", label: "Digital" },
    { value: "physical", label: "Fysisk" },
    { value: "gift", label: "Gavekort" },
  ],
};
const NAME = { name: "name", type: "text", label: "Navn", required: true };
const FIELDS = [KIND, NAME];

const ok = (r: ReturnType<typeof checkDocumentSchema>) => r.ok;
const errs = (r: ReturnType<typeof checkDocumentSchema>) => (r.ok ? [] : r.errors);

describe("checkDocumentSchema — one question, both halves", () => {
  it("accepts a complete, legal published document", () => {
    const d = { kind: "gift", name: "Gavekort" };
    expect(ok(checkDocumentSchema(FIELDS, d, d, "published"))).toBe(true);
  });

  it("refuses the value the chat invented — even on a DRAFT", () => {
    // A select value is never legitimately half-finished, so unlike `required`
    // this does not wait for publish.
    const d = { kind: "giftcard", name: "x" };
    const r = checkDocumentSchema(FIELDS, d, d, "draft");
    expect(ok(r)).toBe(false);
    expect(errs(r)[0]).toContain("giftcard");
    expect(errs(r)[0]).toContain("digital, physical, gift");
  });

  it("refuses the value it produced when told to create a document", () => {
    const d = { kind: "digital download", name: "Onlinekursus" };
    expect(ok(checkDocumentSchema(FIELDS, d, d, "draft"))).toBe(false);
  });

  it("does NOT block an unrelated edit of a document that already holds a bad value", () => {
    // Measured 27 Aug 2026: sanneandersen has 9 users stored with role
    // "student", a value its own schema never declared. Renaming one of them
    // must still work — the bad value is not this write's fault.
    const merged = { kind: "giftcard", name: "Nyt navn" };
    const written = { name: "Nyt navn" };
    expect(ok(checkDocumentSchema(FIELDS, merged, written, "published"))).toBe(true);
  });

  it("still enforces required on the merged state when publishing", () => {
    const r = checkDocumentSchema(FIELDS, { kind: "gift" }, { kind: "gift" }, "published");
    expect(ok(r)).toBe(false);
    expect(errs(r).join(" ")).toContain("Navn");
  });

  it("lets a draft be incomplete — required is a publish-time promise", () => {
    expect(ok(checkDocumentSchema(FIELDS, {}, {}, "draft"))).toBe(true);
  });

  it("an empty select on a required field is reported ONCE, by required", () => {
    // Not twice, and not as "\"\" is not a valid value" — one mistake, one message.
    const d = { kind: "", name: "x" };
    const r = checkDocumentSchema(FIELDS, d, d, "published");
    expect(errs(r)).toHaveLength(1);
    expect(errs(r)[0]).toContain("Fulfillment-type is required");
  });

  it("an empty select on an OPTIONAL field is fine", () => {
    const optional = [{ ...KIND, required: false }];
    const d = { kind: "" };
    expect(ok(checkDocumentSchema(optional, d, d, "published"))).toBe(true);
  });

  it("reports both halves together when both are broken", () => {
    const d = { kind: "nope" };
    const r = checkDocumentSchema(FIELDS, d, d, "published");
    expect(errs(r)).toHaveLength(2);
  });
});

describe("no write path keeps its own copy of the rule", () => {
  const ROUTES = [
    "src/app/api/cms/[collection]/route.ts",
    "src/app/api/cms/[collection]/[slug]/route.ts",
  ];
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  for (const r of ROUTES) {
    it(`${r} asks the shared question`, () => {
      const src = read(r);
      expect(src, `${r} does not use the shared rule`).toContain("checkDocumentSchema");
      // A route that hand-rolls an options check would be the bug this fixes.
      expect(src).not.toMatch(/options\.(some|includes|map)\(/);
    });
  }
});
