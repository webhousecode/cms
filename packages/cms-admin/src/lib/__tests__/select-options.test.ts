import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  selectOptionValues,
  describeSelectOptions,
  invalidSelectValues,
  type SelectCheckField,
} from "@/lib/select-options";

const KIND: SelectCheckField = {
  name: "kind",
  type: "select",
  label: "Fulfillment-type",
  options: [
    { value: "digital", label: "Digital" },
    { value: "physical", label: "Fysisk" },
    { value: "gift", label: "Gavekort" },
  ],
};

describe("selectOptionValues", () => {
  it("returns the declared values", () => {
    expect(selectOptionValues(KIND)).toEqual(["digital", "physical", "gift"]);
  });

  it("returns null for a non-select field", () => {
    expect(selectOptionValues({ name: "title", type: "text" })).toBeNull();
  });

  it("returns null — not [] — for a select with no options", () => {
    // [] would mean "no value is legal" and reject everything on a field whose
    // author simply had not filled the options in yet.
    expect(selectOptionValues({ name: "x", type: "select" })).toBeNull();
    expect(selectOptionValues({ name: "x", type: "select", options: [] })).toBeNull();
  });
});

describe("describeSelectOptions — the ONE phrasing", () => {
  it("words the constraint with the exact values", () => {
    expect(describeSelectOptions(KIND)).toBe(
      'MUST be one of "digital" | "physical" | "gift"',
    );
  });

  it("says nothing when there is nothing to say", () => {
    expect(describeSelectOptions({ name: "title", type: "text" })).toBeNull();
    expect(describeSelectOptions({ name: "x", type: "select", options: [] })).toBeNull();
  });
});

describe("the two surfaces cannot drift apart", () => {
  // The whole point of this module. agent-runner had the rule; the chat prompt
  // did not. A second copy would BE the bug being fixed, so pin that neither
  // file re-implements the phrasing locally.
  const read = (p: string) => readFileSync(join(process.cwd(), "src/lib", p), "utf8");

  it("agent-runner imports the shared rule instead of building its own", () => {
    const src = read("agent-runner.ts");
    expect(src).toContain("describeSelectOptions");
    expect(src).not.toMatch(/MUST be one of \$\{/);
  });

  it("the chat system prompt imports the shared rule too", () => {
    const src = read("chat/system-prompt.ts");
    expect(src).toContain("describeSelectOptions");
    expect(src).not.toMatch(/MUST be one of \$\{/);
  });
});

describe("invalidSelectValues", () => {
  it("accepts every declared value", () => {
    for (const v of ["digital", "physical", "gift"]) {
      expect(invalidSelectValues([KIND], { kind: v })).toEqual([]);
    }
  });

  it("rejects the value the model actually invented", () => {
    // Measured 27 Aug 2026: the model answered "giftcard". The real value is
    // "gift". Two of three right is worse than none — it reads as authoritative.
    const errs = invalidSelectValues([KIND], { kind: "giftcard" });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("giftcard");
    expect(errs[0]).toContain("digital, physical, gift");
    expect(errs[0]).toContain("Fulfillment-type"); // names the field an editor sees
  });

  it("rejects the value it produced when told to create a document", () => {
    expect(invalidSelectValues([KIND], { kind: "digital download" })).toHaveLength(1);
  });

  it("only judges what this write carries — an unrelated edit is not blocked", () => {
    // A pre-existing bad value must not make every later edit fail. That would
    // punish the wrong write.
    expect(invalidSelectValues([KIND], { name: "Onlinekursus" })).toEqual([]);
  });

  it("leaves empty values to `required` — one mistake, one message", () => {
    expect(invalidSelectValues([KIND], { kind: "" })).toEqual([]);
    expect(invalidSelectValues([KIND], { kind: null })).toEqual([]);
    expect(invalidSelectValues([KIND], { kind: undefined })).toEqual([]);
  });

  it("rejects a non-string where a select value is expected", () => {
    expect(invalidSelectValues([KIND], { kind: 3 })).toHaveLength(1);
    expect(invalidSelectValues([KIND], { kind: ["digital"] })).toHaveLength(1);
  });

  it("ignores fields that do not constrain their values", () => {
    const fields: SelectCheckField[] = [
      { name: "title", type: "text" },
      { name: "loose", type: "select" },
    ];
    expect(invalidSelectValues(fields, { title: "x", loose: "anything" })).toEqual([]);
  });

  it("reports every bad field, not just the first", () => {
    const role: SelectCheckField = {
      name: "role",
      type: "select",
      options: [{ value: "admin", label: "Admin" }],
    };
    expect(invalidSelectValues([KIND, role], { kind: "nope", role: "nope" })).toHaveLength(2);
  });
});
