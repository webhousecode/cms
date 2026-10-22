import { describe, it, expect } from "vitest";
import { resolveBrand, brandCss, DEFAULT_BRAND, BRAND_PACKS, type BrandPack } from "../brand";
import { resolveUiLocale } from "../../i18n/locale";

/**
 * F210.1 — the brand is chosen by the ADDRESS the CMS is opened on.
 * cms.fysio.work shows fysio's name, logo and colour; webhouse.app and any
 * unknown address show webhouse. No cookie, no user setting.
 */

const FYSIO: BrandPack = {
  id: "fysio-work",
  name: "fysio.work",
  hosts: ["cms.fysio.work"],
  logo: { light: "/brands/fysio-work/logo-light.svg", dark: "/brands/fysio-work/logo-dark.svg" },
  favicon: "/brands/fysio-work/favicon.svg",
  color: "#0E4F5C",
  colorForeground: "#FFFFFF",
  colorDark: "#5FB3B3",
};

describe("F210.1 resolveBrand", () => {
  it("picks the pack whose host matches", () => {
    expect(resolveBrand("cms.fysio.work", [FYSIO]).id).toBe("fysio-work");
  });

  it("ignores case and port", () => {
    expect(resolveBrand("CMS.Fysio.Work:443", [FYSIO]).id).toBe("fysio-work");
  });

  it("accepts the .localhost alias, so a brand can be previewed on a dev machine", () => {
    expect(resolveBrand("cms.fysio.work.localhost:3019", [FYSIO]).id).toBe("fysio-work");
  });

  it("falls back to webhouse for webhouse.app, an unknown host, and a missing host", () => {
    expect(resolveBrand("webhouse.app", [FYSIO])).toBe(DEFAULT_BRAND);
    expect(resolveBrand("evil.example", [FYSIO])).toBe(DEFAULT_BRAND);
    expect(resolveBrand(null, [FYSIO])).toBe(DEFAULT_BRAND);
    expect(resolveBrand("", [FYSIO])).toBe(DEFAULT_BRAND);
  });

  it("does not match on a suffix — fysio.work.evil.example is not fysio", () => {
    expect(resolveBrand("cms.fysio.work.evil.example", [FYSIO])).toBe(DEFAULT_BRAND);
    expect(resolveBrand("xcms.fysio.work", [FYSIO])).toBe(DEFAULT_BRAND);
  });
});

describe("F210.1 brandCss", () => {
  it("emits nothing for the default brand — webhouse.app is byte-for-byte unchanged", () => {
    expect(brandCss(DEFAULT_BRAND)).toBe("");
  });

  it("dark themes get the dark variant, light themes the main colour", () => {
    const css = brandCss(FYSIO);
    // Dark is the default (:root) and every data-theme starting with "dark".
    expect(css).toContain('html:root,html[data-theme^="dark"]{--brand:#5FB3B3;');
    expect(css).toContain('html[data-theme^="light"]{--brand:#0E4F5C;--brand-foreground:#FFFFFF;--primary:#0E4F5C;--primary-foreground:#FFFFFF;--brand-strong:#0E4F5C;--brand-strong-foreground:#FFFFFF;');
    // The light rule must come AFTER the dark one: same specificity, last wins.
    expect(css.indexOf('[data-theme^="light"]')).toBeGreaterThan(css.indexOf('[data-theme^="dark"]'));
  });

  it("picks a readable text colour on the dark variant when none is given", () => {
    // White on #5FB3B3 is ~2.4:1 — unreadable. Near-black wins.
    expect(brandCss(FYSIO)).toContain('--brand-foreground:#0D0D0D');
  });

  it("without a dark variant, both themes use the main colour", () => {
    const css = brandCss({ ...FYSIO, colorDark: undefined });
    expect(css).toContain('html:root,html[data-theme^="dark"]{--brand:#0E4F5C;--brand-foreground:#FFFFFF;');
  });

  it("the always-dark sign-in screens use the dark-background colour in EVERY theme", () => {
    const css = brandCss(FYSIO);
    const light = css.slice(css.indexOf('[data-theme^="light"]'));
    expect(light).toContain("--brand-on-dark:#5FB3B3");
    expect(css).toContain("--brand-tint-bg:color-mix(in srgb, #5FB3B3 14%, #0a0a0a)");
  });

  // F210.6 — Christian 22/10, screenshot from cms.fysio.work: the SEO score's
  // "warning" yellow was #F7BB2E, webhouse gold's own code. A warning keeps its
  // meaning (still orange, between green and red) but is not webhouse's colour.
  it("a customer brand's warning is an orange, never webhouse gold", () => {
    const css = brandCss(FYSIO);
    expect(css).toContain("--status-warning:#EA580C");
    expect(css.toLowerCase()).not.toContain("#f7bb2e");
  });

  // F210.6 — the menu's active item and the focus ring were still gold: they
  // are written as oklch(… 85) in globals.css, which the hex sweep never saw.
  it("the menu's active item and the focus ring follow the brand in both themes", () => {
    const css = brandCss(FYSIO);
    const dark = css.slice(0, css.indexOf('[data-theme^="light"]'));
    const light = css.slice(css.indexOf('[data-theme^="light"]'));
    expect(dark).toContain("--ring:#5FB3B3");
    expect(dark).toContain("--sidebar-accent:color-mix(in srgb, #5FB3B3 15%, transparent)");
    expect(dark).toContain("--sidebar-accent-foreground:#5FB3B3");
    expect(light).toContain("--ring:#0E4F5C");
    expect(light).toContain("--sidebar-accent:color-mix(in srgb, #0E4F5C 12%, transparent)");
    expect(light).toContain("--sidebar-accent-foreground:#0E4F5C");
  });

  // F210.7 — Christian: «Skrifttypen skal også kunne følge det style sheet som
  // "kunden" kommer med». The UI typeface comes from the brand pack.
  it("a brand with a typeface sets --font-sans; without one the font is untouched", () => {
    const withFont = brandCss({ ...FYSIO, font: { family: "Manrope", stylesheet: "/brands/fysio-work/fonts.css" } });
    expect(withFont).toContain('--font-sans:"Manrope", ui-sans-serif, system-ui, sans-serif');
    expect(brandCss(FYSIO)).not.toContain("--font-sans");
    expect(brandCss(DEFAULT_BRAND)).toBe("");
  });

  it("refuses a typeface name or stylesheet that could break out of the <style>/<link>", () => {
    expect(() => brandCss({ ...FYSIO, font: { family: 'X";}</style><script>', stylesheet: "/brands/x/fonts.css" } })).toThrow(/font/);
    expect(() => brandCss({ ...FYSIO, font: { family: "Manrope", stylesheet: "https://fonts.googleapis.com/css2" } })).toThrow(/font/);
  });

  it("refuses a colour that is not a plain hex value (it lands inside a <style> tag)", () => {
    expect(() => brandCss({ ...FYSIO, color: "red;}</style><script>" })).toThrow(/hex/);
    expect(() => brandCss({ ...FYSIO, colorForeground: "url(x)" })).toThrow(/hex/);
  });
});

describe("F211.3 cms.fysio.work opens in Danish", () => {
  const fysio = resolveBrand("cms.fysio.work", BRAND_PACKS);

  it("the real fysio.work pack defaults to Danish", () => {
    expect(fysio.id).toBe("fysio-work");
    expect(fysio.defaultLocale).toBe("da");
  });

  it("a fysio user with no choice and an English browser still gets Danish", () => {
    expect(resolveUiLocale({ user: null, brand: fysio.defaultLocale, acceptLanguage: "en-US,en;q=0.9" })).toBe("da");
  });

  it("the user's own choice still wins on fysio", () => {
    expect(resolveUiLocale({ user: "en", brand: fysio.defaultLocale, acceptLanguage: "da" })).toBe("en");
  });

  it("CONTROL: webhouse.app is not pulled into Danish", () => {
    const webhouse = resolveBrand("webhouse.app", BRAND_PACKS);
    expect(webhouse.defaultLocale).toBeUndefined();
    expect(resolveUiLocale({ user: null, brand: webhouse.defaultLocale, acceptLanguage: "en-US" })).toBe("en");
  });
});
