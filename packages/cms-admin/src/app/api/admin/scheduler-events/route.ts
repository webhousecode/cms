import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getActiveSitePaths } from "@/lib/site-paths";
import { readSchedulerEvents } from "@/lib/scheduler-log";
import { getServerTSafe } from "@/i18n/server";

export async function GET(req: NextRequest) {
  const t = await getServerTSafe();
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: t("errAdmin.common.unauthorized") }, { status: 401 });

  const since = req.nextUrl.searchParams.get("since") ?? undefined;
  const { dataDir } = await getActiveSitePaths();
  const events = await readSchedulerEvents(dataDir, since);

  return NextResponse.json({ events });
}
