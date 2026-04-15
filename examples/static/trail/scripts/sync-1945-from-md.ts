#!/usr/bin/env tsx
/**
 * Sync the 1945-concept page content from the canonical markdown source.
 *
 * Root cause: the CMS-admin richtext editor strips raw `<svg>` blocks
 * when the page is saved via the UI. The canonical source is the
 * markdown file in the trail repo — this script re-extracts its body
 * (minus frontmatter and the leading h1) and writes it back into the
 * page's JSON content field, preserving every other field.
 *
 * DO NOT edit the 1945-concept page via CMS admin after this runs —
 * richtext save will strip the SVGs again. Edit the markdown source
 * and re-run this script instead.
 *
 * Usage: bun run scripts/sync-1945-from-md.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "/Users/cb/Apps/broberg/trail/docs/as-we-may-think.md";
const TARGET = "/Users/cb/Apps/webhouse/cms/examples/static/trail/content/pages/the-1945-concept.json";

const md = readFileSync(SOURCE, "utf-8");
const m = md.match(/^---[\s\S]*?---\n([\s\S]*)$/);
if (!m) {
  console.error("No frontmatter in source markdown");
  process.exit(1);
}
let body = m[1].trim();
// Strip leading h1 (title is already in the page's data.title field)
body = body.replace(/^#\s+[^\n]*\n+/, "");

const doc = JSON.parse(readFileSync(TARGET, "utf-8"));
const before = String(doc.data.content ?? "").length;
doc.data.content = body;
writeFileSync(TARGET, JSON.stringify(doc, null, 2) + "\n");

const svgCount = (body.match(/<svg/g) ?? []).length;
console.log(`Synced ${TARGET}`);
console.log(`  content: ${before} → ${body.length} chars`);
console.log(`  svg blocks: ${svgCount}`);
