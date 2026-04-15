import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expandShortcodes } from "../build/shortcodes.js";

describe("expandShortcodes", () => {
  describe("{{svg:slug}}", () => {
    it("inlines SVG from file when uploadsDir is set", () => {
      const dir = mkdtempSync(join(tmpdir(), "svg-test-"));
      mkdirSync(join(dir, "svg"));
      writeFileSync(join(dir, "svg", "icon.svg"), '<svg><circle cx="8" cy="8" r="4"/></svg>');

      const out = expandShortcodes("<p>{{svg:icon}}</p>", { uploadsDir: dir });
      expect(out).toContain('<figure class="cms-svg cms-svg--icon">');
      expect(out).toContain('<circle cx="8" cy="8" r="4"/>');
      expect(out).not.toContain("<figcaption>");
    });

    it("adds caption when shortcode has one", () => {
      const dir = mkdtempSync(join(tmpdir(), "svg-test-"));
      mkdirSync(join(dir, "svg"));
      writeFileSync(join(dir, "svg", "x.svg"), "<svg></svg>");

      const out = expandShortcodes("{{svg:x|Hello world}}", { uploadsDir: dir });
      expect(out).toContain("<figcaption>Hello world</figcaption>");
    });

    it("falls back to svgCaptions map when shortcode has no explicit caption", () => {
      const dir = mkdtempSync(join(tmpdir(), "svg-test-"));
      mkdirSync(join(dir, "svg"));
      writeFileSync(join(dir, "svg", "foo.svg"), "<svg></svg>");

      const out = expandShortcodes("{{svg:foo}}", {
        uploadsDir: dir,
        svgCaptions: { foo: "Fallback caption" },
      });
      expect(out).toContain("<figcaption>Fallback caption</figcaption>");
    });

    it("falls back to <img> when file is missing", () => {
      const out = expandShortcodes("{{svg:missing}}", { uploadsDir: "/nonexistent" });
      expect(out).toContain('<img src="/uploads/svg/missing.svg"');
      expect(out).toContain('alt="missing"');
    });

    it("escapes caption HTML", () => {
      const dir = mkdtempSync(join(tmpdir(), "svg-test-"));
      mkdirSync(join(dir, "svg"));
      writeFileSync(join(dir, "svg", "e.svg"), "<svg></svg>");

      const out = expandShortcodes("{{svg:e|<script>alert(1)</script>}}", { uploadsDir: dir });
      expect(out).not.toContain("<script>");
      expect(out).toContain("&lt;script&gt;");
    });

    it("accepts underscores and uppercase in slug", () => {
      const dir = mkdtempSync(join(tmpdir(), "svg-test-"));
      mkdirSync(join(dir, "svg"));
      writeFileSync(join(dir, "svg", "My_Icon.svg"), "<svg id=mi></svg>");

      const out = expandShortcodes("{{svg:My_Icon}}", { uploadsDir: dir });
      expect(out).toContain("<svg id=mi></svg>");
    });

    it("custom svgDir overrides default 'svg'", () => {
      const dir = mkdtempSync(join(tmpdir(), "svg-test-"));
      mkdirSync(join(dir, "figures"));
      writeFileSync(join(dir, "figures", "f.svg"), "<svg id=custom></svg>");

      const out = expandShortcodes("{{svg:f}}", { uploadsDir: dir, svgDir: "figures" });
      expect(out).toContain("<svg id=custom></svg>");
    });

    it("applies basePath to fallback <img> src", () => {
      const out = expandShortcodes("{{svg:foo}}", { basePath: "/app" });
      expect(out).toContain('src="/app/uploads/svg/foo.svg"');
    });
  });

  describe("{{snippet:slug}}", () => {
    it("replaces with resolved content", () => {
      const out = expandShortcodes("{{snippet:bio}}", { snippets: { bio: "<p>Author bio</p>" } });
      expect(out).toBe("<p>Author bio</p>");
    });

    it("returns empty string when slug not found", () => {
      const out = expandShortcodes("<p>{{snippet:missing}}</p>", {});
      expect(out).toBe("<p></p>");
    });
  });

  describe("!!INTERACTIVE[...]", () => {
    it("expands id + title + width + height", () => {
      const out = expandShortcodes("!!INTERACTIVE[chart|My Chart|width:500px|height:400px]", {});
      expect(out).toContain('src="/uploads/interactives/chart.html"');
      expect(out).toContain('title="My Chart"');
      expect(out).toContain("width: 500px");
      expect(out).toContain("height: 400px");
    });

    it("applies basePath", () => {
      const out = expandShortcodes("!!INTERACTIVE[x]", { basePath: "/prefix" });
      expect(out).toContain('src="/prefix/uploads/interactives/x.html"');
    });
  });

  describe("!!FILE[...]", () => {
    it("expands with filename + label", () => {
      const out = expandShortcodes("!!FILE[report.pdf|Q4 Report]", {});
      expect(out).toContain('href="/uploads/report.pdf"');
      expect(out).toContain("Q4 Report");
    });
  });

  describe("!!MAP[...]", () => {
    it("generates leaflet embed with address", () => {
      const out = expandShortcodes("!!MAP[Aalborg, Denmark|13]", {});
      expect(out).toContain("cms-map");
      expect(out).toContain("Aalborg, Denmark");
      expect(out).toContain("13");
    });
  });

  describe("multiple shortcodes in one pass", () => {
    it("expands all five types", () => {
      const dir = mkdtempSync(join(tmpdir(), "svg-test-"));
      mkdirSync(join(dir, "svg"));
      writeFileSync(join(dir, "svg", "a.svg"), "<svg>a</svg>");

      const html = "{{svg:a}}\n{{snippet:b}}\n!!INTERACTIVE[c]\n!!FILE[d.pdf|D]\n!!MAP[Oslo|12]";
      const out = expandShortcodes(html, {
        uploadsDir: dir,
        snippets: { b: "BEE" },
      });
      expect(out).toContain("<svg>a</svg>");
      expect(out).toContain("BEE");
      expect(out).toContain("interactives/c.html");
      expect(out).toContain("d.pdf");
      expect(out).toContain("Oslo");
    });
  });

  describe("custom renderer override", () => {
    it("uses provided renderSvg instead of default", () => {
      const out = expandShortcodes("{{svg:x|cap}}", {
        renderSvg: (slug, caption) => `<custom-${slug} caption="${caption}"/>`,
      });
      expect(out).toBe('<custom-x caption="cap"/>');
    });
  });
});
