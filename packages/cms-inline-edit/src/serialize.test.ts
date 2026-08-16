// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "./index";

const bulletLines = (md: string) => md.split("\n").filter((l) => /^- /.test(l));

describe("htmlToMarkdown — list integrity", () => {
  // The sanneandersen incident (2026-08-16): a 13-item CV list came back from
  // the live site as 1 loose paragraph + 12 bullets, on EVERY save, silently
  // corrupting a public page. The editor had orphaned the first <li> out of its
  // <ul>; serializeBlock had no "li" case, so the orphan fell through to the
  // inline default and lost its "- " marker.
  it("keeps every item when the first <li> has been orphaned out of its list", () => {
    const html =
      "<p>Som zoneterapeut …</p>" +
      "<h2>Min baggrund</h2>" +
      "<li>RAB zoneterapeut og behandler med egen klinik siden 2000</li>" +
      "<ul><li>Indehaver og skoleleder</li><li>Udbyder af RAB-kurser</li></ul>";

    const md = htmlToMarkdown(html);

    expect(bulletLines(md)).toHaveLength(3);
    expect(md).toContain("- RAB zoneterapeut og behandler med egen klinik siden 2000");
    // The orphan must rejoin the list, not become its own loose block — a blank
    // line between item 1 and item 2 is what produced the broken public page.
    expect(md).not.toMatch(/- RAB zoneterapeut[^\n]*\n\n/);
  });

  it("puts the orphan back in FIRST position, preserving author order", () => {
    const html = "<li>one</li><ul><li>two</li><li>three</li></ul>";
    expect(bulletLines(htmlToMarkdown(html))).toEqual(["- one", "- two", "- three"]);
  });

  it("re-attaches an orphan that follows its list", () => {
    const html = "<ul><li>one</li><li>two</li></ul><li>three</li>";
    expect(bulletLines(htmlToMarkdown(html))).toEqual(["- one", "- two", "- three"]);
  });

  it("keeps an orphan numbered when its list is ordered", () => {
    const html = "<li>one</li><ol><li>two</li></ol>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("1. one");
    expect(md).toContain("2. two");
  });

  it("wraps a lone orphan with no adjacent list", () => {
    expect(bulletLines(htmlToMarkdown("<p>intro</p><li>solo</li>"))).toEqual(["- solo"]);
  });

  // Guard: the fix must not disturb the normal, uncorrupted path.
  it("leaves a well-formed list untouched", () => {
    const html = "<h2>Titel</h2><ul><li>a</li><li>b</li><li>c</li></ul>";
    const md = htmlToMarkdown(html);
    expect(bulletLines(md)).toEqual(["- a", "- b", "- c"]);
    expect(md).toContain("## Titel");
  });

  it("leaves ordered lists and paragraphs untouched", () => {
    const md = htmlToMarkdown("<p>intro</p><ol><li>a</li><li>b</li></ol>");
    expect(md).toContain("intro");
    expect(md).toContain("1. a");
    expect(md).toContain("2. b");
  });
});
