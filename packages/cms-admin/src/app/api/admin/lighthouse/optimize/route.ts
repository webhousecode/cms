/**
 * POST /api/admin/lighthouse/optimize — Auto-fix Lighthouse issues.
 * Body: { mobile?: LighthouseResult, desktop?: LighthouseResult }
 * Returns: OptimizeResult
 */
import { NextRequest, NextResponse } from "next/server";
import { optimizeLighthouse } from "@/lib/lighthouse/optimize";
import type { LighthouseResult } from "@/lib/lighthouse/types";
import { getSiteRole } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const role = await getSiteRole();
  if (role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      return NextResponse.json({ error: "No scan results provided" }, { status: 400 });
    }

    const optimizeResult = await optimizeLighthouse(result);
    return NextResponse.json(optimizeResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Optimize failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
