import { getAdminConfig, getAdminCms } from "@/lib/cms";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { writeConfigCollections } from "@/lib/config-writer";
import type { CollectionDef } from "@/lib/config-writer";
import { readSiteConfig } from "@/lib/site-config";
import { getActiveSitePaths } from "@/lib/site-paths";
import { denyViewers } from "@/lib/require-role";

type Ctx = { params: Promise<{ collection: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const denied = await denyViewers(); if (denied) return denied;
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
  const denied = await denyViewers(); if (denied) return denied;
  const { schemaEditEnabled } = await readSiteConfig();
  if (!schemaEditEnabled) {
    return NextResponse.json({ error: "Schema editing disabled" }, { status: 403 });
  }
  const { collection } = await params;
  const config = await getAdminConfig();
  const { configPath } = await getActiveSitePaths();

  // Delete all documents in the collection before removing the schema
  try {
    const cms = await getAdminCms();
    const { documents } = await cms.content.findMany(collection, {});
    for (const doc of documents) {
      await cms.content.delete(collection, (doc as { id: string }).id);
    }
  } catch (err) {
    console.warn(`[schema DELETE] Could not delete documents for "${collection}":`, err);
    // Continue with schema removal even if document cleanup fails
  }

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
