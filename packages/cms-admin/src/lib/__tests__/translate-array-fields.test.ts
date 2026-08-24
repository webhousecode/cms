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

/**
 * A LIST INSIDE A LIST.
 *
 * MEASURED on webhouse-site, 2026-08-24, right after the array fix above
 * shipped. The /products page stores each product as a row, and each row
 * carries `features: string[]` — four bullet points. The Danish twin came back
 * with a Danish name, a Danish tagline, a Danish description, and four English
 * bullets underneath:
 *
 *   Produkter → @webhouse/cms → "Udvikler-først. AI-integreret."
 *     · AI-native content workflows
 *     · Static-first output
 *
 * Same failure shape as the parent bug, one level deeper: the collector only
 * looked at STRING sub-fields, so a `tags` sub-field fell through the branch
 * and was copied verbatim. Nothing failed — a copied bullet is a valid bullet.
 */
const PRODUCTS: FieldConfig = {
  name: "products",
  type: "array",
  label: "Products",
  fields: [
    { name: "name", type: "text", label: "Name" },
    { name: "tagline", type: "text", label: "Tagline" },
    { name: "href", type: "text", label: "URL" },
    { name: "features", type: "tags", label: "Feature bullets" },
  ],
} as unknown as FieldConfig;

const PRODUCT_ROWS = {
  products: [
    {
      name: "@webhouse/cms",
      tagline: "Developer-first.",
      href: "/cms",
      features: ["AI-native content workflows", "Static-first output"],
    },
    {
      name: "Senti.Cloud",
      tagline: "Industrial IoT.",
      href: "https://senti.cloud",
      features: ["Real-time sensor data"],
    },
  ],
};

describe("tags sub-field inside an array row", () => {
  it("collects the bullet list so the translator is asked for it at all", () => {
    const out = collectTranslatableFields(PRODUCT_ROWS, [PRODUCTS]);
    expect(out["products[0].features"]).toEqual([
      "AI-native content workflows",
      "Static-first output",
    ]);
    expect(out["products[1].features"]).toEqual(["Real-time sensor data"]);
  });

  it("still leaves the row's URL alone — a translated href 404s silently", () => {
    const out = collectTranslatableFields(PRODUCT_ROWS, [PRODUCTS]);
    expect(out["products[0].href"]).toBeUndefined();
    expect(out["products[1].href"]).toBeUndefined();
  });

  it("writes the translated bullets back into the right row", () => {
    const merged = JSON.parse(JSON.stringify(PRODUCT_ROWS));
    const applied = applyArrayTranslations(merged, {
      "products[0].features": ["AI-drevne arbejdsgange", "Statisk output"],
      "products[1].features": ["Sensordata i realtid"],
    });
    expect(applied).toContain("products[0].features");
    expect(merged.products[0].features).toEqual([
      "AI-drevne arbejdsgange",
      "Statisk output",
    ]);
    expect(merged.products[1].features).toEqual(["Sensordata i realtid"]);
    // untouched siblings
    expect(merged.products[0].name).toBe("@webhouse/cms");
    expect(merged.products[0].href).toBe("/cms");
  });

  it("does not write the SOURCE object when merging a copy", () => {
    const merged = JSON.parse(JSON.stringify(PRODUCT_ROWS));
    applyArrayTranslations(merged, { "products[0].features": ["Dansk"] });
    expect(PRODUCT_ROWS.products[0].features).toEqual([
      "AI-native content workflows",
      "Static-first output",
    ]);
  });

  it("ignores a value that is neither a string nor a list of strings", () => {
    const merged = JSON.parse(JSON.stringify(PRODUCT_ROWS));
    const applied = applyArrayTranslations(merged, {
      "products[0].features": [1, 2] as unknown as string[],
      "products[0].name": { nope: true } as unknown as string,
    });
    expect(applied).toEqual([]);
    expect(merged.products[0].features).toEqual([
      "AI-native content workflows",
      "Static-first output",
    ]);
    expect(merged.products[0].name).toBe("@webhouse/cms");
  });
});
