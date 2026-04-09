/**
 * POST /api/admin/wp-migrate/probe — Probe a WordPress site.
 *
 * Body: { url: string }
 * Returns: WpProbeResult
 */
import { NextRequest, NextResponse } from "next/server";
import { probeWpSite } from "@/lib/wp-migration/probe";
import { getSiteRole } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    // Basic URL validation
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    const result = await probeWpSite(normalizedUrl);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Probe failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
