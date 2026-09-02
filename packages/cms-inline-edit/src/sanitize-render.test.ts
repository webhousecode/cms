import { describe, expect, it } from "vitest";
import { resolveCmsLinks, sanitizeCmsHtml } from "./server";

describe("sanitizeCmsHtml — the render side", () => {
  // The editor refuses these three ways on the way IN, but that only covers
  // text this dialog wrote. Content also arrives from cms-admin's richtext, the
  // REST API, MCP and AI agents — and marked renders both a Markdown link and a
  // raw anchor with javascript: straight through (measured with this repo's own
  // version). The save-side guard alone left that content executing.
  it("removes the link and keeps the words", () => {
    expect(sanitizeCmsHtml('se <a href="javascript:alert(1)">her</a> nu')).toBe("se her nu");
  });

  it("catches the forms a browser still runs", () => {
    for (const bad of [
      '<a href="JavaScript:alert(1)">x</a>',
      '<a href=" javascript:alert(1)">x</a>',
      '<a href="java\tscript:alert(1)">x</a>',
      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
      '<a href="vbscript:msgbox(1)">x</a>',
      '<a target="_blank" rel="noopener" href="javascript:alert(1)">x</a>',
    ]) {
      expect(sanitizeCmsHtml(bad), bad).toBe("x");
    }
  });

  // The negative control. A guard that stripped every anchor would pass every
  // assertion above and silently delete all links on every site that renders
  // through here.
  it("leaves ordinary links completely alone", () => {
    for (const ok of [
      '<a href="https://www.trailmem.com">Trail</a>',
      '<a href="/flagskibe/trail">Trail</a>',
      '<a href="mailto:cb@webhouse.dk">mail</a>',
      '<a href="#kontakt">kontakt</a>',
      '<a href="https://x.dk/?q=javascript:1">q</a>',
    ]) {
      expect(sanitizeCmsHtml(ok), ok).toBe(ok);
    }
    expect(sanitizeCmsHtml("")).toBe("");
  });

  it("runs as part of resolveCmsLinks, so a consumer gets it without asking", () => {
    const html = 'a <a href="javascript:alert(1)">x</a> b <a href="/y" data-cms-ref="sider:y">Y</a>';
    const out = resolveCmsLinks(html, () => ({ url: "/da/y", title: "Y" }));
    expect(out).not.toContain("javascript:");
    expect(out).toContain('href="/da/y"'); // the reference still resolves
  });
});

describe("sanitizeCmsHtml — the shapes a naive pattern misses", () => {
  // Each of these was found by a negative case in this file, not by review.
  it("handles a > inside a quoted attribute the way a browser does", () => {
    expect(sanitizeCmsHtml('<a href="data:text/html,<b>hi</b>">x</a>')).toBe("x");
  });

  it("handles an unquoted href", () => {
    expect(sanitizeCmsHtml("<a href=javascript:alert(1)>x</a>")).toBe("x");
  });

  it("still leaves an ordinary link with a > in its title alone", () => {
    const ok = '<a href="/x" title="a > b">y</a>';
    expect(sanitizeCmsHtml(ok)).toBe(ok);
  });
});
