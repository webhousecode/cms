import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";
import { getSiteRole } from "@/lib/require-role";

type Ctx = { params: Promise<{ name: string }> };

/** GET /api/cms/collections/[name]/documents — all docs including trashed */
export async function GET(_req: Request, { params }: Ctx) {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ error: "No access to this site" }, { status: 403 });
  try {
    const { name } = await params;
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const colConfig = config.collections.find((c) => c.name === name);
    if (!colConfig) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
    const { documents } = await cms.content.findMany(name, {});
    return NextResponse.json(documents);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
