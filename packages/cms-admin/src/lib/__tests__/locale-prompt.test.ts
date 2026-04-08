/**
 * F48 — locale-prompt defensive defaults.
 *
 * Originally added during the Phase 6 polish run after a workflow's
 * Translator step inherited an unset siteConfig.defaultLocale and
 * the LLM got "Write ALL output in undefined (undefined)".
 */
import { describe, it, expect } from "vitest";
import { buildLocaleInstruction } from "../ai/locale-prompt";

describe("buildLocaleInstruction", () => {
  it("uses the native language name for a known locale", () => {
    const out = buildLocaleInstruction("da");
    expect(out).toContain("Dansk");
    expect(out).toContain("(da)");
    expect(out).not.toContain("undefined");
  });

  it("falls back to English when given undefined", () => {
    const out = buildLocaleInstruction(undefined);
    expect(out).toContain("English");
    expect(out).toContain("(en)");
    expect(out).not.toContain("undefined");
  });

  it("falls back to English when given null", () => {
    const out = buildLocaleInstruction(null);
    expect(out).toContain("English");
    expect(out).toContain("(en)");
  });

  it("falls back to English when given an empty string", () => {
    const out = buildLocaleInstruction("");
    expect(out).toContain("English");
  });

  it("falls back to English when given whitespace only", () => {
    const out = buildLocaleInstruction("   ");
    expect(out).toContain("English");
  });

  it("uses the literal locale code when not in LOCALE_LABELS", () => {
    const out = buildLocaleInstruction("xx");
    expect(out).toContain("(xx)");
  });
});
