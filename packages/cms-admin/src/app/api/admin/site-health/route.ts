import { NextResponse } from "next/server";
import { readSiteConfig } from "@/lib/site-config";

/** GET /api/admin/site-health — check if preview site is reachable */
export async function GET() {
  try {
    const config = await readSiteConfig();
    const url = config.previewSiteUrl;
    if (!url) return NextResponse.json({ status: "no-preview" });

    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(3000),
    });
    return NextResponse.json({ status: res.ok ? "up" : "down", code: res.status });
  } catch {
    return NextResponse.json({ status: "down" });
  }
}
