import { getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { writeConfigCollections } from "@/lib/config-writer";
import type { CollectionDef } from "@/lib/config-writer";
import { readSiteConfig } from "@/lib/site-config";
import { getActiveSitePaths } from "@/lib/site-paths";

type Ctx = { params: Promise<{ collection: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { schemaEditEnabled } = await readSiteConfig();
    if (!schemaEditEnabled) {
      return NextResponse.json({ error: "Schema editing disabled" }, { status: 403 });
    }
    const { collection } = await params;
    const body = await req.json() as CollectionDef;
    const config = await getAdminConfig();
    const { configPath } = await getActiveSitePaths();

    const collections: CollectionDef[] = config.collections.map((col) => {
      const base = {
        name: col.name,
        label: col.label,
        urlPrefix: (col as { urlPrefix?: string }).urlPrefix,
        fields: col.fields,
      };
      return col.name === collection ? { ...base, ...body } : base;
    });

    await writeConfigCollections(configPath, config, collections);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[schema PUT error]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { schemaEditEnabled } = await readSiteConfig();
  if (!schemaEditEnabled) {
    return NextResponse.json({ error: "Schema editing disabled" }, { status: 403 });
  }
  const { collection } = await params;
  const config = await getAdminConfig();
  const { configPath } = await getActiveSitePaths();

  const collections: CollectionDef[] = config.collections
    .filter((col) => col.name !== collection)
    .map((col) => ({
      name: col.name,
      label: col.label,
      urlPrefix: (col as { urlPrefix?: string }).urlPrefix,
      fields: col.fields,
    }));

  await writeConfigCollections(configPath, config, collections);
  return NextResponse.json({ ok: true });
}
