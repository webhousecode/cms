/**
 * @broberg/cms-inline-edit — field-slice save tests (F003.2).
 * Run: cd packages/cms-inline-edit && npx vitest run
 */
import { describe, it, expect } from "vitest";
import { applyFieldSlice } from "./field-slice";

describe("applyFieldSlice", () => {
  it("replaces a single prose segment inside a body with [block:] embeds, preserving everything else", () => {
    const content = [
      "## Intro",
      "Første afsnit om projektet.",
      "",
      "[block:comparison-1]",
      "",
      "Andet afsnit efter blokken.",
    ].join("\n");
    // The editor edits the FIRST prose segment (before the embed).
    const original = "## Intro\nFørste afsnit om projektet.\n";
    const edited = "## Intro\nFørste afsnit — nu redigeret.\n";
    const out = applyFieldSlice(content, original, edited);
    expect(out).toBe(
      ["## Intro", "Første afsnit — nu redigeret.", "", "[block:comparison-1]", "", "Andet afsnit efter blokken."].join("\n"),
    );
    // The embed + the second segment are untouched.
    expect(out).toContain("[block:comparison-1]");
    expect(out).toContain("Andet afsnit efter blokken.");
  });

  it("round-trips a single-segment body (slice == whole field) to just the new value", () => {
    const content = "Kun ét afsnit.";
    expect(applyFieldSlice(content, "Kun ét afsnit.", "Redigeret afsnit.")).toBe("Redigeret afsnit.");
  });

  it("aborts (throws) when the original slice is not found — never clobbers", () => {
    expect(() => applyFieldSlice("noget helt andet", "findes ikke", "ny")).toThrow(/not found/);
  });

  it("aborts (throws) when the original slice appears more than once — ambiguous", () => {
    const content = "Note:\n\n[block:x]\n\nNote:";
    expect(() => applyFieldSlice(content, "Note:", "Ny note:")).toThrow(/more than once|ambiguous/);
  });

  it("preserves æøå and does not touch neighbouring segments", () => {
    const content = "Håndlavet på Læsø.\n\n[block:img]\n\nSæsonens råvarer.";
    const out = applyFieldSlice(content, "Sæsonens råvarer.", "Sæsonens bedste råvarer.");
    expect(out).toBe("Håndlavet på Læsø.\n\n[block:img]\n\nSæsonens bedste råvarer.");
  });
});
