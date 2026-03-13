import { getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";
import { readSiteConfig } from "@/lib/site-config";

export async function GET() {
  const { schemaEditEnabled } = await readSiteConfig();
  if (!schemaEditEnabled) {
    return NextResponse.json({ error: "Schema editing disabled" }, { status: 403 });
  }
  const config = await getAdminConfig();
  const collections = config.collections.map((col) => ({
    name: col.name,
    label: col.label,
    urlPrefix: (col as { urlPrefix?: string }).urlPrefix,
    fields: col.fields,
  }));
  return NextResponse.json({ collections });
}
