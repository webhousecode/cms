import { NextRequest, NextResponse } from "next/server";
import { getAdminConfig } from "@/lib/cms";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const config = await getAdminConfig();
  const col = config.collections.find((c) => c.name === name);
  if (!col) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    name: col.name,
    label: col.label,
    fields: col.fields,
    urlPrefix: col.urlPrefix,
    parentField: (col as any).parentField,
    previewable: col.previewable,
    // F127 — collection purpose metadata
    kind: (col as any).kind,
    description: (col as any).description,
  });
}
