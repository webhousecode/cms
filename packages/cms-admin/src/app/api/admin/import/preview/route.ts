/**
 * POST /api/admin/import/preview — Apply field mappings and return preview rows.
 *
 * Body: { content, format, mappings, collection, titleField }
 * Returns: { rows: ImportPreviewRow[], suggestedMappings?: FieldMapping[] }
 */
import { NextRequest, NextResponse } from "next/server";
import {
  parseFile,
  applyMappings,
  suggestMappings,
  type FieldMapping,
  type ImportFormat,
} from "@/lib/import-engine";
import { getAdminConfig } from "@/lib/cms";
import { getSiteRole } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      content,
      format,
      mappings,
      collection,
      titleField,
    } = body as {
      content: string;
      format: ImportFormat;
      mappings?: FieldMapping[];
      collection: string;
      titleField?: string;
    };

    if (!content || !format || !collection) {
      return NextResponse.json({ error: "Missing content, format, or collection" }, { status: 400 });
    }

    const config = await getAdminConfig();
    const colConfig = config.collections.find((c) => c.name === collection);
    if (!colConfig) {
      return NextResponse.json({ error: `Collection "${collection}" not found` }, { status: 404 });
    }

    const tf = titleField ?? colConfig.fields[0]?.name ?? "title";
    const { records, fields: sourceFields } = parseFile(content, format);

    // If no mappings provided, suggest them
    const finalMappings = mappings ?? suggestMappings(sourceFields, colConfig.fields);

    const rows = applyMappings(records, finalMappings, tf);

    return NextResponse.json({
      rows,
      mappings: finalMappings,
      sourceFields,
      schemaFields: colConfig.fields.map((f) => ({ name: f.name, type: f.type, label: f.label })),
      titleField: tf,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
