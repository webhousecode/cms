/**
 * POST /api/admin/lighthouse/scan — Run a Lighthouse audit.
 * Body: { url?: string, strategy?: "mobile" | "desktop" }
 * Falls back to site's previewSiteUrl if no url provided.
 */
import { NextRequest, NextResponse } from "next/server";
import { runAudit } from "@/lib/lighthouse/runner";
import { readSiteConfig } from "@/lib/site-config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    let url = body.url as string | undefined;
    const strategy = (body.strategy as "mobile" | "desktop") ?? "mobile";

    if (!url) {
      const config = await readSiteConfig();
      url = config.previewSiteUrl;
      if (!url) {
        return NextResponse.json({ error: "No URL provided and no previewSiteUrl configured" }, { status: 400 });
      }
    }

    // PSI needs https:// for production sites
    if (!url.startsWith("http")) {
      url = `https://${url}`;
    }

    const config = await readSiteConfig();
    const apiKey = config.psiApiKey || process.env.GOOGLE_PSI_API_KEY;
    const result = await runAudit(url, { strategy, apiKey });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
