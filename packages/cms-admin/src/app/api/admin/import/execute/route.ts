/**
 * POST /api/admin/import/execute — Run the import, batch-create documents.
 *
 * Body: { content, format, mappings, collection, titleField }
 * Returns: ImportResult
 */
import { NextRequest, NextResponse } from "next/server";
import {
  parseFile,
  applyMappings,
  executeImport,
  type FieldMapping,
  type ImportFormat,
} from "@/lib/import-engine";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
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
      mappings: FieldMapping[];
      collection: string;
      titleField?: string;
    };

    if (!content || !format || !mappings || !collection) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const config = await getAdminConfig();
    const colConfig = config.collections.find((c) => c.name === collection);
    if (!colConfig) {
      return NextResponse.json({ error: `Collection "${collection}" not found` }, { status: 404 });
    }

    const tf = titleField ?? colConfig.fields[0]?.name ?? "title";
    const { records } = parseFile(content, format);
    const rows = applyMappings(records, mappings, tf);

    const cms = await getAdminCms();
    const result = await executeImport(cms, collection, rows);

    // Dispatch content-changed event so dashboard refreshes
    // (handled by workspace-shell's content-changed listener)

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
