import { NextRequest, NextResponse } from "next/server";
import { getAdminConfig } from "@/lib/cms";
import { getActiveSitePaths } from "@/lib/site-paths";
import { getSiteRole } from "@/lib/require-role";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * POST /api/cms/schema-drift/fix
 *
 * Removes orphaned fields from content JSON files.
 * Body: { collection: string, fields: string[] }
 *
 * Directly reads/writes JSON files to ensure fields are truly removed
 * (cms.content.update merges data, which doesn't support field deletion).
 */
export async function POST(req: NextRequest) {
  const role = await getSiteRole();
  if (!role || role === "viewer") {
    return NextResponse.json({ error: "No write access" }, { status: 403 });
  }

  try {
    const { collection, fields } = (await req.json()) as { collection?: string; fields?: string[] };
    if (!collection || !fields?.length) {
      return NextResponse.json({ error: "collection and fields[] required" }, { status: 400 });
    }

    const config = await getAdminConfig();
    const colConfig = config.collections.find((c) => c.name === collection);
    if (!colConfig) {
      return NextResponse.json({ error: `Collection "${collection}" not found` }, { status: 404 });
    }

    // Safety: only allow removing fields that are truly NOT in the schema
    const schemaKeys = new Set(colConfig.fields.map((f) => f.name));
    const safeFields = fields.filter((f) => !schemaKeys.has(f));
    if (safeFields.length === 0) {
      return NextResponse.json({ error: "All specified fields exist in schema — nothing to remove" }, { status: 400 });
    }

    // Read content directory directly
    const { contentDir } = await getActiveSitePaths();
    const collectionDir = join(contentDir, collection);
    // Path containment — prevent traversal via crafted collection name
    if (!collectionDir.startsWith(contentDir + "/")) {
      return NextResponse.json({ error: "Invalid collection path" }, { status: 400 });
    }
    if (!existsSync(collectionDir)) {
      return NextResponse.json({ error: `Content directory not found: ${collection}` }, { status: 404 });
    }

    const jsonFiles = readdirSync(collectionDir).filter((f) => f.endsWith(".json"));
    let fixed = 0;

    for (const file of jsonFiles) {
      const filePath = join(collectionDir, file);
      const doc = JSON.parse(readFileSync(filePath, "utf-8"));
      const data = doc.data;
      if (!data) continue;

      const hasOrphans = safeFields.some((f) => f in data);
      if (!hasOrphans) continue;

      // Remove orphaned fields directly from data
      for (const f of safeFields) {
        delete data[f];
      }

      // Write back with same formatting
      writeFileSync(filePath, JSON.stringify(doc, null, 2) + "\n");
      fixed++;
    }

    return NextResponse.json({
      fixed,
      total: jsonFiles.length,
      removedFields: safeFields,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fix failed" },
      { status: 500 },
    );
  }
}
