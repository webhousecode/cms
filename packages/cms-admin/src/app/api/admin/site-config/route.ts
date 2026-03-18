import { NextRequest, NextResponse } from "next/server";
import { readSiteConfig, writeSiteConfig, type SiteConfig } from "@/lib/site-config";
import { getSiteRole } from "@/lib/require-role";

export async function GET() {
  const config = await readSiteConfig();
  return NextResponse.json(config);
}

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const patch = (await request.json()) as Partial<SiteConfig>;
  const updated = await writeSiteConfig(patch);
  return NextResponse.json(updated);
}

export async function PATCH(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const patch = (await request.json()) as Partial<SiteConfig>;
  const updated = await writeSiteConfig(patch);
  return NextResponse.json(updated);
}
