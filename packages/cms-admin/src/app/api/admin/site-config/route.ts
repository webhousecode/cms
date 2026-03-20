import { NextRequest, NextResponse } from "next/server";
import { readSiteConfig, writeSiteConfig, type SiteConfig } from "@/lib/site-config";
import { getSiteRole } from "@/lib/require-role";
import { getActiveSitePaths } from "@/lib/site-paths";

export async function GET() {
  const [config, paths] = await Promise.all([readSiteConfig(), getActiveSitePaths()]);
  return NextResponse.json({ ...config, resolvedContentDir: paths.contentDir });
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
