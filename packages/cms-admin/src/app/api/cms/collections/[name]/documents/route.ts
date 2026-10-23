import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";
import { getSiteRole } from "@/lib/require-role";
import { getServerTSafe } from "@/i18n/server";

type Ctx = { params: Promise<{ name: string }> };

/** GET /api/cms/collections/[name]/documents — all docs including trashed */
export async function GET(_req: Request, { params }: Ctx) {
  const t = await getServerTSafe();
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ error: t("errCms.shared.noAccessToSite") }, { status: 403 });
  try {
    const { name } = await params;
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const colConfig = config.collections.find((c) => c.name === name);
    if (!colConfig) return NextResponse.json({ error: t("errCms.shared.unknownCollection") }, { status: 404 });
    const { documents } = await cms.content.findMany(name, {});
    return NextResponse.json(documents);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: t("errCms.shared.internalError") }, { status: 500 });
  }
}
