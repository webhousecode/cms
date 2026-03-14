import { getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { writeConfigCollections } from "@/lib/config-writer";
import type { CollectionDef } from "@/lib/config-writer";
import { readSiteConfig } from "@/lib/site-config";
import { getActiveSitePaths } from "@/lib/site-paths";

export async function GET() {
  const config = await getAdminConfig();
  const collections = config.collections
    .filter((c) => c.name !== "global")
    .map((c) => ({ name: c.name, label: c.label ?? c.name }));
  return NextResponse.json({ collections });
}

export async function POST(req: NextRequest) {
  const { schemaEditEnabled } = await readSiteConfig();
  if (!schemaEditEnabled) {
    return NextResponse.json({ error: "Schema editing disabled" }, { status: 403 });
  }
  const body = await req.json() as CollectionDef;
  const config = await getAdminConfig();
  const { configPath } = await getActiveSitePaths();

  const existing = config.collections.map((col) => ({
    name: col.name,
    label: col.label,
    urlPrefix: (col as { urlPrefix?: string }).urlPrefix,
    fields: col.fields,
  }));

  if (existing.find((c) => c.name === body.name)) {
    return NextResponse.json({ error: "Collection already exists" }, { status: 409 });
  }

  writeConfigCollections(configPath, config, [...existing, body]);
  return NextResponse.json({ ok: true }, { status: 201 });
}
