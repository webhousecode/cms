import { NextRequest, NextResponse } from "next/server";
import { readSiteConfig, writeSiteConfig, type SiteConfig } from "@/lib/site-config";

export async function GET() {
  const config = await readSiteConfig();
  return NextResponse.json(config);
}

export async function POST(request: NextRequest) {
  const patch = (await request.json()) as Partial<SiteConfig>;
  const updated = await writeSiteConfig(patch);
  return NextResponse.json(updated);
}
