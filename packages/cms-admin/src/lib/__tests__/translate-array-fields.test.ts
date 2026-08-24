import { describe, it, expect } from "vitest";
import { collectTranslatableFields, applyArrayTranslations } from "../ai/translation-helpers";
import type { FieldConfig } from "@webhouse/cms";

/**
 * Text inside an `array` field is text, and it was never translated.
 *
 * MEASURED on webhouse-site, 2026-08-24. The Danish twin of the globals
 * document had a Danish site title and a Danish footer tagline, and a
 * navigation bar reading:
 *
 *   Services · AI · CMS · Work · Articles · Products · About · Contact
 *
 * The one component that appears on every single page was the one that stayed
 * English, on a site whose entire purpose was to be bilingual. Nothing failed:
 * a copied label is a perfectly valid label, so the twin looked complete.
 *
 * `array` is not in TRANSLATABLE_TYPES and the collector only ever looked at
 * top-level fields, so every repeating list on every site — nav links, footer
 * columns, philosophy points, hero CTAs, stat labels — was copied verbatim.
 */

const NAV_LINKS: FieldConfig = {
  name: "navLinks",
  type: "array",
  label: "Navigation links",
  fields: [
    { name: "href", type: "text", label: "URL" },
    { name: "label", type: "text", label: "Label" },
    { name: "color", type: "text", label: "Accent colour" },
  ],
} as unknown as FieldConfig;

const TITLE: FieldConfig = { name: "siteTitle", type: "text", label: "Title" } as FieldConfig;

describe("array fields are translatable", () => {
  const data = {
    siteTitle: "WebHouse — Intelligent Software Since 1995",
    navLinks: [
      { href: "/services", label: "Services", color: "#3C97D3" },
      { href: "/about", label: "About", color: "#C026D3" },
    ],
  };

  it("collects the text inside array rows", () => {
    const out = collectTranslatableFields(data, [TITLE, NAV_LINKS]);
    expect(out["navLinks[0].label"]).toBe("Services");
    expect(out["navLinks[1].label"]).toBe("About");
  });

  it("still collects ordinary fields", () => {
    const out = collectTranslatableFields(data, [TITLE, NAV_LINKS]);
    expect(out["siteTitle"]).toBe("WebHouse — Intelligent Software Since 1995");
  });

  it("leaves URLs and colour tokens alone — translating an href breaks the link", () => {
    const out = collectTranslatableFields(data, [TITLE, NAV_LINKS]);
    expect(out["navLinks[0].href"]).toBeUndefined();
    expect(out["navLinks[0].color"]).toBeUndefined();
  });

  it("writes translations back into the right row", () => {
    const merged = { ...data, navLinks: data.navLinks.map(r => ({ ...r })) };
    applyArrayTranslations(merged, { "navLinks[0].label": "Ydelser", "navLinks[1].label": "Om os" });
    expect(merged.navLinks[0]).toEqual({ href: "/services", label: "Ydelser", color: "#3C97D3" });
    expect(merged.navLinks[1]).toEqual({ href: "/about", label: "Om os", color: "#C026D3" });
  });

  it("does not touch the SOURCE document while translating it", () => {
    // mergedData is a shallow spread, so without a deep copy the rows are the
    // very same objects the English document holds.
    const source = { navLinks: [{ href: "/about", label: "About" }] };
    const merged = { ...source, navLinks: source.navLinks.map(r => ({ ...r })) };
    applyArrayTranslations(merged, { "navLinks[0].label": "Om os" });
    expect(source.navLinks[0].label).toBe("About");
    expect(merged.navLinks[0].label).toBe("Om os");
  });

  it("ignores a row the source does not have — a translation must not add entries", () => {
    const merged = { navLinks: [{ href: "/about", label: "About" }] };
    const applied = applyArrayTranslations(merged, { "navLinks[7].label": "Spøgelse" });
    expect(applied).toEqual([]);
    expect(merged.navLinks).toHaveLength(1);
  });

  it("returns which keys it consumed, so the caller does not also set them literally", () => {
    const merged = { navLinks: [{ label: "About" }] };
    expect(applyArrayTranslations(merged, { "navLinks[0].label": "Om os" })).toEqual(["navLinks[0].label"]);
    expect((merged as Record<string, unknown>)["navLinks[0].label"]).toBeUndefined();
  });

  it("an array with no translatable sub-fields is skipped entirely", () => {
    const nums = {
      name: "stats", type: "array", label: "Stats",
      fields: [{ name: "value", type: "number", label: "Value" }],
    } as unknown as FieldConfig;
    const out = collectTranslatableFields({ stats: [{ value: 30 }] }, [nums]);
    expect(Object.keys(out)).toHaveLength(0);
  });
});
