import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getActiveSitePaths } from "@/lib/site-paths";
import { readSchedulerEvents } from "@/lib/scheduler-log";

export async function GET(req: NextRequest) {
  const session = await getSessionUser(await cookies());
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = req.nextUrl.searchParams.get("since") ?? undefined;
  const { dataDir } = await getActiveSitePaths();
  const events = await readSchedulerEvents(dataDir, since);

  return NextResponse.json({ events });
}
