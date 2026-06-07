import { getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { writeConfigCollections } from "@/lib/config-writer";
import type { CollectionDef } from "@/lib/config-writer";
import { readSiteConfig } from "@/lib/site-config";
import { getActiveSitePaths } from "@/lib/site-paths";
import { denyViewers, getSiteRole } from "@/lib/require-role";
import { invalidateActiveSite } from "@/lib/site-pool";

export async function GET() {
  const config = await getAdminConfig();
  const collections = config.collections
    .filter((c) => c.name !== "global")
    .map((c) => ({ name: c.name, label: c.label ?? c.name }));
  return NextResponse.json({ collections });
}

export async function POST(req: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const role = await getSiteRole();
  if (role !== "admin") {
    const { schemaEditEnabled } = await readSiteConfig();
    if (!schemaEditEnabled) {
      return NextResponse.json({ error: "Schema editing disabled" }, { status: 403 });
    }
  }
  const body = await req.json() as CollectionDef;
  const config = await getAdminConfig();
  const { configPath } = await getActiveSitePaths();

  // Keep existing collections as full objects (no prop reduction) so the
  // writer can't drop urlPattern/previewable/nested fields on a sibling.
  const existing = config.collections as unknown as CollectionDef[];

  if (existing.find((c) => c.name === body.name)) {
    return NextResponse.json({ error: "Collection already exists" }, { status: 409 });
  }

  await writeConfigCollections(configPath, config, [...existing, body]);
  await invalidateActiveSite();
  return NextResponse.json({ ok: true }, { status: 201 });
}
