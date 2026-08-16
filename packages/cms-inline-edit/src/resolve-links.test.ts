import { describe, it, expect } from "vitest";
import { resolveCmsLinks, type CmsLinkLookup } from "./server";

/**
 * F164.4 — this is where the promise ("the link updates itself") is actually
 * kept. Everything before it only stores the reference; this is what makes a
 * moved or renamed page fix its own links at render time.
 */
const PAGES: Record<string, { url: string; title: string }> = {
  "sider:om-sanne": { url: "/da/om-mig", title: "Om mig" }, // moved AND renamed
};
const lookup: CmsLinkLookup = (c, s) => PAGES[`${c}:${s}`] ?? null;

const REF = (extra = "") =>
  `<p>Se <a href="/da/om-sanne" data-cms-ref="sider:om-sanne"${extra}>Om Sanne</a> her.</p>`;

describe("resolveCmsLinks", () => {
  it("re-points href at the page's current path", () => {
    const out = resolveCmsLinks(REF(), lookup);
    expect(out).toContain('href="/da/om-mig"');
    expect(out).not.toContain('href="/da/om-sanne"');
  });

  it("follows the page's current title when the link opted in", () => {
    const out = resolveCmsLinks(REF(' data-cms-ref-label="auto"'), lookup);
    expect(out).toContain(">Om mig<");
    expect(out).not.toContain(">Om Sanne<");
  });

  it("leaves the editor's own text alone when they wrote it", () => {
    const out = resolveCmsLinks(REF(), lookup);
    expect(out).toContain(">Om Sanne<");
  });

  it("keeps the last known href when the page is gone", () => {
    const out = resolveCmsLinks(
      '<a href="/da/slettet" data-cms-ref="sider:slettet">Væk</a>',
      lookup,
    );
    expect(out).toContain('href="/da/slettet"');
    expect(out).toContain(">Væk<");
  });

  it("survives a lookup that throws — the page still renders", () => {
    const boom: CmsLinkLookup = () => {
      throw new Error("db down");
    };
    expect(() => resolveCmsLinks(REF(), boom)).not.toThrow();
    expect(resolveCmsLinks(REF(), boom)).toContain('href="/da/om-sanne"');
  });

  it("does not touch ordinary links", () => {
    const html = '<p><a href="https://example.com">eksternt</a></p>';
    expect(resolveCmsLinks(html, lookup)).toBe(html);
  });

  it("resolves several references in one field", () => {
    const html = REF() + REF(' data-cms-ref-label="auto"');
    const out = resolveCmsLinks(html, lookup);
    expect(out.match(/href="\/da\/om-mig"/g)).toHaveLength(2);
  });

  it("escapes a hostile title instead of injecting markup", () => {
    const evil: CmsLinkLookup = () => ({ url: "/x", title: '<script>alert(1)</script>' });
    const out = resolveCmsLinks(REF(' data-cms-ref-label="auto"'), evil);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("handles empty input", () => {
    expect(resolveCmsLinks("", lookup)).toBe("");
  });
});
