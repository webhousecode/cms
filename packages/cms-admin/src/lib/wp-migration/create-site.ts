/**
 * F03 — Create CMS site from WordPress probe data.
 *
 * Generates cms.config.ts with collections mapped from WP post types,
 * creates the directory structure, registers the site in the CMS registry.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { addSite } from "../site-registry";
import type { WpProbeResult } from "./probe";
import { extractAllContent, type WpDocument, type ExtractionProgress } from "./extract-content";

export interface MigrationResult {
  siteId: string;
  siteName: string;
  siteDir: string;
  configPath: string;
  contentDir: string;
  uploadDir: string;
  collections: Array<{ name: string; label: string; count: number }>;
  documentsImported: number;
  mediaDownloaded: number;
  redirectMap: Array<{ from: string; to: string }>;
}

/**
 * Run the full WordPress → CMS migration pipeline:
 * 1. Generate cms.config.ts from probe data
 * 2. Create site directory + register in CMS
 * 3. Extract all content + download media
 * 4. Write CMS documents as JSON
 */
export async function migrateWordPressSite(
  probe: WpProbeResult,
  options: {
    orgId: string;
    siteName: string;
    siteDir: string;
  },
  onProgress?: (p: ExtractionProgress) => void,
): Promise<MigrationResult> {
  const { orgId, siteName, siteDir } = options;
  const siteId = slugify(siteName) || randomUUID();
  const contentDir = path.join(siteDir, "content");
  const uploadDir = path.join(siteDir, "public", "uploads");
  const configPath = path.join(siteDir, "cms.config.ts");
  const dataDir = path.join(siteDir, "_data");

  // ── 1. Create directory structure ──
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(uploadDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  // ── 2. Generate cms.config.ts ──
  const collections = buildCollections(probe);
  const configContent = generateCmsConfig(collections, probe);
  writeFileSync(configPath, configContent, "utf-8");

  // Create content subdirectories for each collection
  for (const col of collections) {
    mkdirSync(path.join(contentDir, col.name), { recursive: true });
  }

  // ── 3. Extract content + download media ──
  onProgress?.({ phase: "extracting", current: 0, total: 1 });
  const { documents, redirectMap, mediaDownloaded } = await extractAllContent(probe, uploadDir, onProgress);

  // ── 4. Write CMS documents as JSON ──
  onProgress?.({ phase: "writing", current: 0, total: documents.length });
  let imported = 0;

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const colName = mapTypeToCollection(doc.type, probe);
    const colDir = path.join(contentDir, colName);
    mkdirSync(colDir, { recursive: true });

    const cmsDoc = wpDocToCmsJson(doc, colName);
    writeFileSync(path.join(colDir, `${doc.slug}.json`), JSON.stringify(cmsDoc, null, 2), "utf-8");
    imported++;
    onProgress?.({ phase: "writing", current: i + 1, total: documents.length, currentItem: doc.title });
  }

  // Save redirect map
  writeFileSync(path.join(dataDir, "redirect-map.json"), JSON.stringify(redirectMap, null, 2));

  // Save probe result for reference
  writeFileSync(path.join(dataDir, "wp-probe.json"), JSON.stringify(probe, null, 2));

  // ── 5. Register site in CMS ──
  await addSite(orgId, {
    id: siteId,
    name: siteName,
    adapter: "filesystem",
    configPath,
    contentDir,
    uploadDir,
  });

  // Aggregate collection counts
  const collectionCounts = collections.map((col) => ({
    ...col,
    count: documents.filter((d) => mapTypeToCollection(d.type, probe) === col.name).length,
  }));

  return {
    siteId,
    siteName,
    siteDir,
    configPath,
    contentDir,
    uploadDir,
    collections: collectionCounts,
    documentsImported: imported,
    mediaDownloaded,
    redirectMap,
  };
}

// ── Collection mapping ──

interface CollectionDef {
  name: string;
  label: string;
  urlPrefix: string;
  hasExcerpt: boolean;
  hasDate: boolean;
  hasFeaturedImage: boolean;
  hasTags: boolean;
  hasCategories: boolean;
}

function buildCollections(probe: WpProbeResult): CollectionDef[] {
  const cols: CollectionDef[] = [];

  if (probe.contentCounts.posts > 0) {
    cols.push({
      name: "posts",
      label: "Posts",
      urlPrefix: "/blog",
      hasExcerpt: true,
      hasDate: true,
      hasFeaturedImage: true,
      hasTags: true,
      hasCategories: true,
    });
  }

  if (probe.contentCounts.pages > 0) {
    cols.push({
      name: "pages",
      label: "Pages",
      urlPrefix: "/",
      hasExcerpt: false,
      hasDate: false,
      hasFeaturedImage: true,
      hasTags: false,
      hasCategories: false,
    });
  }

  for (const cpt of probe.contentCounts.customPostTypes) {
    const name = slugify(cpt.name);
    cols.push({
      name,
      label: cpt.name,
      urlPrefix: `/${name}`,
      hasExcerpt: false,
      hasDate: true,
      hasFeaturedImage: true,
      hasTags: false,
      hasCategories: false,
    });
  }

  return cols;
}

function mapTypeToCollection(type: string, probe: WpProbeResult): string {
  if (type === "post") return "posts";
  if (type === "page") return "pages";
  // CPT: find matching collection name
  const cpt = probe.contentCounts.customPostTypes.find((c) => c.slug === type);
  return cpt ? slugify(cpt.name) : type;
}

// ── Config generation ──

function generateCmsConfig(collections: CollectionDef[], probe: WpProbeResult): string {
  const lines: string[] = [
    `import { defineConfig, defineCollection } from '@webhouse/cms';`,
    ``,
    `// Auto-generated from WordPress site: ${probe.url}`,
    `// Theme: ${probe.theme.name} | Builder: ${probe.pageBuilder}`,
    `// Generated: ${new Date().toISOString()}`,
    ``,
    `export default defineConfig({`,
    `  storage: { adapter: 'filesystem', contentDir: 'content' },`,
    `  collections: [`,
  ];

  for (const col of collections) {
    lines.push(`    defineCollection({`);
    lines.push(`      name: '${col.name}',`);
    lines.push(`      label: '${col.label}',`);
    lines.push(`      urlPrefix: '${col.urlPrefix}',`);
    lines.push(`      fields: [`);
    lines.push(`        { name: 'title', type: 'text', required: true },`);
    lines.push(`        { name: 'content', type: 'richtext' },`);
    if (col.hasExcerpt) lines.push(`        { name: 'excerpt', type: 'textarea' },`);
    if (col.hasFeaturedImage) lines.push(`        { name: 'featuredImage', type: 'image' },`);
    if (col.hasDate) lines.push(`        { name: 'date', type: 'date' },`);
    if (col.hasTags) lines.push(`        { name: 'tags', type: 'tags' },`);
    if (col.hasCategories) lines.push(`        { name: 'categories', type: 'tags' },`);
    lines.push(`      ],`);
    lines.push(`    }),`);
  }

  lines.push(`  ],`);
  lines.push(`});`);
  lines.push(``);

  return lines.join("\n");
}

// ── WP Document → CMS JSON ──

function wpDocToCmsJson(doc: WpDocument, collection: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    title: doc.title,
    content: doc.content,
  };

  if (doc.excerpt) data.excerpt = doc.excerpt;
  if (doc.featuredImageLocal) data.featuredImage = doc.featuredImageLocal;
  if (doc.date) data.date = doc.date;
  if (doc.tags?.length) data.tags = doc.tags;
  if (doc.categories?.length) data.categories = doc.categories;

  return {
    slug: doc.slug,
    status: doc.status === "publish" ? "published" : "draft",
    data,
    id: randomUUID(),
    _fieldMeta: {},
    createdAt: doc.date,
    updatedAt: doc.modified,
  };
}

// ── Helpers ──

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[æ]/g, "ae").replace(/[ø]/g, "oe").replace(/[å]/g, "aa").replace(/[ü]/g, "u")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
