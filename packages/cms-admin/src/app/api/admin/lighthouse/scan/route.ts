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
      // Prefer the live production URL — PSI API requires a public URL,
      // not localhost. Fall back to custom domain, then previewSiteUrl.
      const customDomain = config.deployCustomDomain
        ? `https://${config.deployCustomDomain}`
        : "";
      url = config.deployProductionUrl || customDomain || config.previewSiteUrl;
      if (!url) {
        return NextResponse.json({ error: "No URL provided and no production or preview URL configured" }, { status: 400 });
      }
    }

    if (!url.startsWith("http")) {
      url = `https://${url}`;
    }

    // PSI API cannot audit localhost — reject early with a clear message
    if (/localhost|127\.0\.0\.1|\[::1\]/.test(url)) {
      return NextResponse.json({
        error: "Cannot audit localhost URLs — PSI API requires a public URL. Configure a production URL in Site Settings → Deploy.",
      }, { status: 400 });
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
