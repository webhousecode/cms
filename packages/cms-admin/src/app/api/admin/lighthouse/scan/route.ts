/**
 * POST /api/admin/lighthouse/scan — Run Lighthouse audits.
 * Runs BOTH mobile and desktop in parallel.
 * Body: { url?: string }
 * Returns: { mobile: LighthouseResult, desktop: LighthouseResult }
 */
import { NextRequest, NextResponse } from "next/server";
import { runAudit } from "@/lib/lighthouse/runner";
import { readSiteConfig } from "@/lib/site-config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    let url = body.url as string | undefined;

    const config = await readSiteConfig();
    if (!url) {
      url = config.previewSiteUrl;
      if (!url) {
        return NextResponse.json({ error: "No URL provided and no previewSiteUrl configured" }, { status: 400 });
      }
    }

    if (!url.startsWith("http")) {
      url = `https://${url}`;
    }

    const apiKey = config.psiApiKey || process.env.GOOGLE_PSI_API_KEY;

    // Run both strategies in parallel
    const [mobile, desktop] = await Promise.all([
      runAudit(url, { strategy: "mobile", apiKey }),
      runAudit(url, { strategy: "desktop", apiKey }),
    ]);

    return NextResponse.json({ mobile, desktop });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
