import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Every browser-facing gate that decides "is this origin one of the site's own"
 * MUST read all of the site's configured hosts, not previewSiteUrl alone.
 *
 * The single-field version has now broken production twice: webhouse.dk on
 * 2026-08-25 (inline-edit saves died the day the domain moved) and
 * sanneandersen.dk on 2026-08-26 (inline editing refused the new domain, and
 * the contact form would have refused every submission from it). The helper was
 * written after the first one — and only ONE of the four call sites adopted it,
 * so the class stayed open and cost a customer's launch day.
 */
const GATES = [
  "app/admin/inline-edit/connect/route.ts",
  "app/admin/inline-edit/logout/route.ts",
  "app/api/forms/[name]/route.ts",
  "app/api/cms/[collection]/[slug]/route.ts",
];

describe("browser-facing origin gates read every configured host", () => {
  it.each(GATES)("%s uses the shared helper, not previewSiteUrl alone", (rel) => {
    const src = readFileSync(join(SRC, rel), "utf-8");

    // Positive control: prove we actually read the file we think we read. A
    // guard that scans nothing reports the same "no violations" as one that
    // scans everything and finds none.
    expect(src.length, `${rel} is empty — guard scanned nothing`).toBeGreaterThan(200);

    expect(src, rel).toMatch(/siteOrigins(WithSiblings)?\s*\(/);

    // The exact shape both incidents had: previewSiteUrl treated as the whole
    // truth about where the site lives.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code, `${rel} still compares an origin against previewSiteUrl alone`)
      .not.toMatch(/previewSiteUrl\s*\)\s*\.origin|previewSiteUrl\s*&&\s*new URL/);
  });
});
