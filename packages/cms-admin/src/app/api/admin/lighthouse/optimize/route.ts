/**
 * POST /api/admin/lighthouse/optimize — Auto-fix Lighthouse issues.
 * Body: { mobile?: LighthouseResult, desktop?: LighthouseResult }
 * Returns: OptimizeResult
 */
import { NextRequest, NextResponse } from "next/server";
import { optimizeLighthouse } from "@/lib/lighthouse/optimize";
import type { LighthouseResult } from "@/lib/lighthouse/types";
import { getSiteRole } from "@/lib/require-role";
import { getServerTSafe } from "@/i18n/server";

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  const role = await getSiteRole();
  if (role === "viewer") {
    return NextResponse.json({ error: t("errAdmin.common.forbidden") }, { status: 403 });
  }

  try {
    const { mobile, desktop } = await request.json() as {
      mobile?: LighthouseResult;
      desktop?: LighthouseResult;
    };

    // Merge both results — use the one with more issues
    const result = mobile && desktop
      ? (mobile.opportunities.length + mobile.diagnostics.length >= desktop.opportunities.length + desktop.diagnostics.length ? mobile : desktop)
      : mobile ?? desktop;

    if (!result) {
      return NextResponse.json({ error: t("errAdmin.lighthouse.noResults") }, { status: 400 });
    }

    const optimizeResult = await optimizeLighthouse(result);
    return NextResponse.json(optimizeResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : t("errAdmin.lighthouse.optimizeFailed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
