import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getAccessibleSiteIds } from "@/lib/team-access";

export async function GET() {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) {
    return NextResponse.json({ siteIds: [] });
  }
  const siteIds = await getAccessibleSiteIds(session.sub);
  return NextResponse.json({ siteIds });
}
