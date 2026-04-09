/**
 * POST /api/admin/import/upload — Upload a file, parse it, return detected fields.
 *
 * Accepts multipart/form-data with "file" field.
 * Returns: { format, fields, rowCount, preview (first 5 rows) }
 */
import { NextRequest, NextResponse } from "next/server";
import { parseFile, parseMarkdownFiles, detectFormat, type ImportFormat } from "@/lib/import-engine";
import { getSiteRole } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("file") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const firstFile = files[0];
    const format = detectFormat(firstFile.name);
    let records: Record<string, unknown>[];
    let fields: string[];

    if (format === "markdown" && files.length > 1) {
      // Multiple markdown files
      const mdFiles = await Promise.all(
        files.map(async (f) => ({ name: f.name, content: await f.text() })),
      );
      const parsed = parseMarkdownFiles(mdFiles);
      records = parsed.records;
      fields = parsed.fields;
    } else {
      const content = await firstFile.text();
      const parsed = parseFile(content, format, firstFile.name);
      records = parsed.records;
      fields = parsed.fields;
    }

    return NextResponse.json({
      format,
      fields,
      rowCount: records.length,
      preview: records.slice(0, 5),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parse failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
