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
import { requirePermission } from "@/lib/permissions";
import { getServerTSafe } from "@/i18n/server";

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  const denied = await requirePermission("import.execute"); if (denied) return denied;

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
      return NextResponse.json({ error: t("errAdmin.import.missingFields") }, { status: 400 });
    }

    const config = await getAdminConfig();
    const colConfig = config.collections.find((c) => c.name === collection);
    if (!colConfig) {
      return NextResponse.json({ error: t("errAdmin.import.collectionNotFound", { collection }) }, { status: 404 });
    }

    const tf = titleField ?? colConfig.fields[0]?.name ?? "title";
    const { records } = parseFile(content, format, undefined, t);
    const rows = applyMappings(records, mappings, tf, t);

    const cms = await getAdminCms();
    const result = await executeImport(cms, collection, rows);

    // Dispatch content-changed event so dashboard refreshes
    // (handled by workspace-shell's content-changed listener)

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : t("errAdmin.import.failed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
