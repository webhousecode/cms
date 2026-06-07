import { describe, it, expect } from "vitest";
import { sanitizeWordPasteHtml } from "../paste-sanitizer";

describe("sanitizeWordPasteHtml — F150 Word/Office paste cleanup", () => {
  it("unwraps the sanneandersen span-wrapped markdown, preserving inner markdown", () => {
    // Ground-truth payload pattern from prod (products/fordjelsen.json).
    const input =
      "<span>*Undervisning hjemme hos dig selv via Zoom.*</span>\n\n" +
      "<span>**<u>1. En sund – og god forløjelse – er grundlaget for al liv.</u>**</span>";
    const out = sanitizeWordPasteHtml(input);
    expect(out).not.toContain("<span>");
    expect(out).not.toContain("</span>");
    // inner markdown + intentional <u> survive intact
    expect(out).toContain("*Undervisning hjemme hos dig selv via Zoom.*");
    expect(out).toContain("**<u>1. En sund");
    expect(out).toContain("</u>**");
  });

  it("removes XML-namespace tags like <o:p>", () => {
    expect(sanitizeWordPasteHtml("<p>hi<o:p></o:p></p>")).toBe("<p>hi</p>");
    expect(sanitizeWordPasteHtml("<o:p>keep</o:p>")).toBe("keep");
  });

  it("unwraps <font> tags but keeps their content", () => {
    expect(sanitizeWordPasteHtml('<font face="Arial" size="3">hello</font>')).toBe("hello");
  });

  it("strips Office conditional comments and fragment markers", () => {
    const input =
      "<!--[if gte mso 9]><xml><o:OfficeDocumentSettings/></xml><![endif]-->" +
      "<!--StartFragment-->text<!--EndFragment-->";
    expect(sanitizeWordPasteHtml(input)).toBe("text");
  });

  it("strips downlevel-revealed conditional comments", () => {
    expect(sanitizeWordPasteHtml("<![if !mso]>x<![endif]>")).toBe("x");
  });

  it("removes mso-* style declarations but keeps real ones", () => {
    const out = sanitizeWordPasteHtml('<p style="margin:0; mso-pagination:none">x</p>');
    expect(out).toBe('<p style="margin:0">x</p>');
  });

  it("drops a style attribute that becomes empty after mso stripping, then unwraps the bare span", () => {
    const out = sanitizeWordPasteHtml('<span style="mso-fareast-language:DA">x</span>');
    expect(out).toBe("x");
  });

  it('removes class="Mso…" attributes', () => {
    expect(sanitizeWordPasteHtml('<p class="MsoNormal">x</p>')).toBe("<p>x</p>");
  });

  it("drops Word <style> and <xml> blocks wholesale", () => {
    const input = "<style>p{mso-x:1}</style><xml><w:WordDocument/></xml><p>body</p>";
    expect(sanitizeWordPasteHtml(input)).toBe("<p>body</p>");
  });

  // ── edge guards: never destroy intent ──

  it("preserves a deliberate color span (TextStyle/Color)", () => {
    const input = '<span style="color:#f00">red</span>';
    expect(sanitizeWordPasteHtml(input)).toBe(input);
  });

  it("preserves a background-color span", () => {
    const input = '<span style="background-color:#ff0">hi</span>';
    expect(sanitizeWordPasteHtml(input)).toBe(input);
  });

  it("preserves a color span even when it also carried mso noise", () => {
    const out = sanitizeWordPasteHtml('<span style="mso-x:1; color:#0f0">g</span>');
    expect(out).toBe('<span style="color:#0f0">g</span>');
  });

  it("preserves spans with a real class/id/data attribute", () => {
    expect(sanitizeWordPasteHtml('<span class="badge">x</span>')).toBe('<span class="badge">x</span>');
    expect(sanitizeWordPasteHtml('<span data-foo="1">x</span>')).toBe('<span data-foo="1">x</span>');
  });

  it("leaves clean third-party HTML untouched", () => {
    const input = '<strong>bold</strong> and <a href="https://x.com">link</a><ul><li>a</li><li>b</li></ul>';
    expect(sanitizeWordPasteHtml(input)).toBe(input);
  });

  it("returns empty and plain input unchanged", () => {
    expect(sanitizeWordPasteHtml("")).toBe("");
    expect(sanitizeWordPasteHtml("just text")).toBe("just text");
  });

  it("fully unwraps nested noise-only spans", () => {
    expect(sanitizeWordPasteHtml("<span><span>deep</span></span>")).toBe("deep");
  });

  it("keeps a semantic color span while unwrapping a noise span around it", () => {
    const out = sanitizeWordPasteHtml('<span><span style="color:#f00">red</span></span>');
    expect(out).toBe('<span style="color:#f00">red</span>');
  });
});
