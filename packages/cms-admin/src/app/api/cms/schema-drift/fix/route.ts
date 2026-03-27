import { NextRequest, NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";

/**
 * POST /api/cms/schema-drift/fix
 *
 * Fixes schema drift by removing orphaned fields from content documents.
 * Body: { collection: string, fields: string[] }
 *
 * For each document in the collection, removes the specified fields from data.
 * Only removes fields that are NOT in the current schema (safety check).
 */
export async function POST(req: NextRequest) {
  try {
    const { collection, fields } = (await req.json()) as { collection?: string; fields?: string[] };
    if (!collection || !fields?.length) {
      return NextResponse.json({ error: "collection and fields[] required" }, { status: 400 });
    }

    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
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

    // Process all documents
    const { documents } = await cms.content.findMany(collection, {});
    let fixed = 0;

    for (const doc of documents) {
      const data = (doc as { data?: Record<string, unknown> }).data;
      if (!data) continue;

      const hasOrphans = safeFields.some((f) => f in data);
      if (!hasOrphans) continue;

      // Remove orphaned fields
      const cleaned = { ...data };
      for (const f of safeFields) {
        delete cleaned[f];
      }

      // Save back
      await cms.content.update(collection, doc.slug, { data: cleaned });
      fixed++;
    }

    return NextResponse.json({
      fixed,
      total: documents.length,
      removedFields: safeFields,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fix failed" },
      { status: 500 },
    );
  }
}
