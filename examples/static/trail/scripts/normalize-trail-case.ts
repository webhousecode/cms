#!/usr/bin/env tsx
/**
 * Normalize "trail" → "Trail" in prose-context JSON fields.
 *
 * Convention (decided 2026-04-15):
 *   - Prose/marketing/article text:  Trail  (proper noun, capital T)
 *   - Code / CLI / paths / package names / slugs:  trail  (lowercase)
 *   - Nav / logo / siteTitle:  trail (matches the lowercase logo)
 *
 * The regex uses lookbehind/lookahead to skip occurrences adjacent to
 * word chars, slashes, hyphens, or dots — so these stay lowercase:
 *   /trail, trail/, -trail, trail-, trail.broberg.ai, trails, tetrail
 * And these get capitalized (prose):
 *   "trail compiles knowledge"  →  "Trail compiles knowledge"
 *   "inside the trail build"    →  "inside the Trail build"
 *
 * Skipped fields (stay lowercase): slug, id, author, data.slug, data.id,
 * data.author, data.siteTitle, data.category (when it's a relation slug),
 * data.logo, data.*Href, data.navLinks, data.footerLinks.
 *
 * Usage: bun run scripts/normalize-trail-case.ts
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = "/Users/cb/Apps/webhouse/cms/examples/static/trail/content";
const MD_SOURCES = ["/Users/cb/Apps/broberg/trail/docs/as-we-may-think.md"];

const PATTERN = /(?<![\w/\-.])trail(?![\w/\-.])/g;

const PROSE_FIELDS = new Set([
  "title",
  "metaDescription",
  "excerpt",
  "content",
  "description",
  "siteDescription",
  "eyebrow",
  "titleLine1",
  "titleLine2",
  "name",
]);

const SKIP_FIELDS = new Set([
  "slug",
  "id",
  "siteTitle",
  "logo",
  "category",  // relation-slug on posts
  "signInHref",
  "navCtaHref",
  "signInLabel",
  "navCtaLabel",
  "footerCopyright",  // already has "Trail" capitalized
  "footerTagline",
  "author",  // imported posts have "trail" as author, which is brand-positioning we leave
  "href",
  "label",
]);

function normalizeString(s: string): { out: string; changes: number } {
  let changes = 0;
  const out = s.replace(PATTERN, () => {
    changes++;
    return "Trail";
  });
  return { out, changes };
}

function normalizeValue(value: unknown, fieldName: string): { value: unknown; changes: number } {
  if (SKIP_FIELDS.has(fieldName)) return { value, changes: 0 };
  if (typeof value === "string" && PROSE_FIELDS.has(fieldName)) {
    const { out, changes } = normalizeString(value);
    return { value: out, changes };
  }
  if (Array.isArray(value)) {
    let total = 0;
    const arr = value.map((item) => {
      const r = normalizeValue(item, fieldName);
      total += r.changes;
      return r.value;
    });
    return { value: arr, changes: total };
  }
  if (value && typeof value === "object") {
    const obj: Record<string, unknown> = {};
    let total = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const r = normalizeValue(v, k);
      obj[k] = r.value;
      total += r.changes;
    }
    return { value: obj, changes: total };
  }
  return { value, changes: 0 };
}

function walkJson(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name.startsWith("_") || name === "node_modules") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkJson(full, out);
    else if (name.endsWith(".json")) out.push(full);
  }
}

const jsonFiles: string[] = [];
walkJson(BASE, jsonFiles);

let grandTotal = 0;
for (const file of jsonFiles) {
  const raw = readFileSync(file, "utf-8");
  const doc = JSON.parse(raw);
  const r = normalizeValue(doc, "__root__");
  if (r.changes > 0) {
    writeFileSync(file, JSON.stringify(r.value, null, 2) + "\n");
    console.log(`  ${file.replace(BASE + "/", "")}  (${r.changes})`);
    grandTotal += r.changes;
  }
}

for (const md of MD_SOURCES) {
  const raw = readFileSync(md, "utf-8");
  // Split frontmatter from body — only normalize body
  const fmMatch = raw.match(/^(---[\s\S]*?---\n)([\s\S]*)$/);
  let fm = "";
  let body = raw;
  if (fmMatch) {
    fm = fmMatch[1];
    body = fmMatch[2];
  }
  const { out, changes } = normalizeString(body);
  if (changes > 0) {
    writeFileSync(md, fm + out);
    console.log(`  ${md}  (${changes})`);
    grandTotal += changes;
  }
}

console.log(`\nNormalized ${grandTotal} "trail" → "Trail" occurrence(s) in prose contexts.`);
