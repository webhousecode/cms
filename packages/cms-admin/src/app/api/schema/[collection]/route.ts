import { getAdminConfig, getAdminCms } from "@/lib/cms";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { writeConfigCollections } from "@/lib/config-writer";
import type { CollectionDef } from "@/lib/config-writer";
import { readSiteConfig } from "@/lib/site-config";
import { getActiveSitePaths } from "@/lib/site-paths";
import { denyViewers, getSiteRole } from "@/lib/require-role";
import { invalidateActiveSite } from "@/lib/site-pool";
import { invalidateQuickCacheOnWrite } from "@/lib/chat/quick-prewarm";

type Ctx = { params: Promise<{ collection: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const role = await getSiteRole();
    if (role !== "admin") {
      const { schemaEditEnabled } = await readSiteConfig();
      if (!schemaEditEnabled) {
        return NextResponse.json({ error: "Schema editing disabled" }, { status: 403 });
      }
    }
    const { collection } = await params;
    const body = await req.json() as CollectionDef;
    const config = await getAdminConfig();
    const { configPath } = await getActiveSitePaths();

    // Pass the FULL collection objects through — never reduce to a subset of
    // props, or the writer would drop urlPattern/previewable/nested fields/etc.
    // The edited collection is merged so the client's changes win while any
    // prop it didn't send is preserved from the existing definition.
    const collections = config.collections.map((col) =>
      col.name === collection ? { ...col, ...body } : col,
    ) as unknown as CollectionDef[];

    await writeConfigCollections(configPath, config, collections);
    // Cache invalidation: site-pool keeps config in memory forever in prod,
    // so without this the next read returns the old label and editors see
    // "save didn't work" (precedent: sanneandersen 2026-05-19, label edits
    // hit disk but UI kept showing the previous value).
    await invalidateActiveSite();
    void invalidateQuickCacheOnWrite(); // F158: schema changed → refresh site-info/overview
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[schema PUT error]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await denyViewers(); if (denied) return denied;
  const role = await getSiteRole();
  if (role !== "admin") {
    const { schemaEditEnabled } = await readSiteConfig();
    if (!schemaEditEnabled) {
      return NextResponse.json({ error: "Schema editing disabled" }, { status: 403 });
    }
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

  // Keep the remaining collections as full objects (no prop reduction).
  const collections = config.collections
    .filter((col) => col.name !== collection) as unknown as CollectionDef[];

  await writeConfigCollections(configPath, config, collections);
  await invalidateActiveSite();
  void invalidateQuickCacheOnWrite(); // F158: collection removed → refresh site-info/overview
  return NextResponse.json({ ok: true });
}
