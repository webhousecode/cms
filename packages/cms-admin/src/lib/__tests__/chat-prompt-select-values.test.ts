import { describe, it, expect } from "vitest";
import { buildChatSystemPrompt, type SiteContext } from "@/lib/chat/system-prompt";

/**
 * F177 — the prompt must state a select field's legal values.
 *
 * Reproduces sanneandersen's `product-types.kind` exactly, because that is the
 * field the failure was measured on (27 Aug 2026): the prompt rendered
 * "`kind` (select) *required — Fulfillment-type" and the model, asked which
 * values were legal, answered "digital, physical, giftcard". The real third
 * value is "gift".
 *
 * A fixture rather than an import of the live site config on purpose — a test
 * that reaches into a sibling repo passes on one laptop and fails in CI.
 */
function ctx(fields: SiteContext["collections"][number]["fields"]): SiteContext {
  return {
    siteName: "Fixture",
    adapter: "filesystem",
    collections: [{ name: "product-types", label: "Produkt-typer", fields, documentCount: 3 }],
    defaultLocale: "da",
    locales: ["da"],
    autoTranslate: false,
  };
}

const KIND = {
  name: "kind",
  type: "select",
  label: "Fulfillment-type",
  required: true,
  options: [
    { value: "digital", label: "Digital — download" },
    { value: "physical", label: "Fysisk — pakkes og sendes" },
    { value: "gift", label: "Gavekort — kode + mail" },
  ],
};

describe("chat system prompt states what a select field allows", () => {
  it("renders the exact legal values on the field line", () => {
    const line = buildChatSystemPrompt(ctx([KIND]))
      .split("\n")
      .find((l) => l.includes("`kind`"));
    expect(line).toBe(
      '    - `kind` (select) *required — Fulfillment-type — MUST be one of "digital" | "physical" | "gift"',
    );
  });

  it("names the value that was invented, so the gap is provably closed", () => {
    const prompt = buildChatSystemPrompt(ctx([KIND]));
    expect(prompt).toContain('"gift"');
    // The invented one must NOT appear — asserting only that "gift" is present
    // would also pass on a prompt that listed both.
    expect(prompt).not.toContain("giftcard");
  });

  it("leaves a non-select field untouched", () => {
    const line = buildChatSystemPrompt(ctx([{ name: "slug", type: "text", label: "Slug" }]))
      .split("\n")
      .find((l) => l.includes("`slug`"));
    expect(line).toBe("    - `slug` (text) — Slug");
  });

  it("does not emit an empty constraint for a select with no options", () => {
    const prompt = buildChatSystemPrompt(ctx([{ name: "loose", type: "select" }]));
    expect(prompt).toContain("- `loose` (select)");
    expect(prompt).not.toContain("MUST be one of\n");
    expect(prompt).not.toMatch(/MUST be one of\s*$/m);
  });
});
