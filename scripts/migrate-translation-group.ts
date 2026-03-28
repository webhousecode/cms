#!/usr/bin/env npx tsx
/**
 * Migration: translationOf → translationGroup
 *
 * Finds all documents with translationOf (slug-based), generates a shared
 * translationGroup ID, and stamps it on BOTH source and translation.
 *
 * Safe to run multiple times — skips docs that already have translationGroup.
 *
 * Usage: npx tsx scripts/migrate-translation-group.ts <contentDir>
 * Example: npx tsx scripts/migrate-translation-group.ts examples/blog/content
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";

const contentDir = process.argv[2];
if (!contentDir) {
  console.error("Usage: npx tsx scripts/migrate-translation-group.ts <contentDir>");
  process.exit(1);
}

if (!existsSync(contentDir)) {
  console.error(`Content directory not found: ${contentDir}`);
  process.exit(1);
}

const collections = readdirSync(contentDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let migrated = 0;
let skipped = 0;

for (const collection of collections) {
  const colDir = join(contentDir, collection);
  const files = readdirSync(colDir).filter((f) => f.endsWith(".json"));

  // Load all docs in this collection
  const docs: Record<string, any> = {};
  for (const file of files) {
    const path = join(colDir, file);
    const doc = JSON.parse(readFileSync(path, "utf-8"));
    docs[doc.slug] = { doc, path };
  }

  // Find docs with translationOf and create translationGroup links
  for (const { doc, path } of Object.values(docs)) {
    if (!doc.translationOf) continue; // not a translation
    if (doc.translationGroup) {
      skipped++;
      continue; // already migrated
    }

    const sourceSlug = doc.translationOf;
    const source = docs[sourceSlug];

    if (!source) {
      console.warn(`  ⚠ ${collection}/${doc.slug}: source "${sourceSlug}" not found — skipping`);
      continue;
    }

    // Generate or reuse translationGroup ID
    const groupId = source.doc.translationGroup || nanoid(21);

    // Stamp on source if it doesn't have one
    if (!source.doc.translationGroup) {
      source.doc.translationGroup = groupId;
      writeFileSync(source.path, JSON.stringify(source.doc, null, 2) + "\n", "utf-8");
      console.log(`  ✓ ${collection}/${source.doc.slug}: added translationGroup ${groupId}`);
      migrated++;
    }

    // Stamp on translation
    doc.translationGroup = groupId;
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", "utf-8");
    console.log(`  ✓ ${collection}/${doc.slug}: added translationGroup ${groupId} (was translationOf: ${sourceSlug})`);
    migrated++;
  }
}

console.log(`\nDone. Migrated: ${migrated}, Already migrated: ${skipped}`);
