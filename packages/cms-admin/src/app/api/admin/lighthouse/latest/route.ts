import { NextResponse } from "next/server";
import { getLatestBoth } from "@/lib/lighthouse/history";
import { getSiteRole } from "@/lib/require-role";

/**
 * Returns the latest full result for BOTH mobile and desktop strategies.
 * The page renders side-by-side cards and the Export-report builder
 * needs full opportunities/diagnostics/CWV for both — returning only
 * one strategy here meant the other side fell back to scores-only from
 * history, and the exported Markdown was missing mobile (or desktop)
 * sections (reported 2026-05-19).
 */
export async function GET() {
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ mobile: null, desktop: null }, { status: 401 });
  const { mobile, desktop } = await getLatestBoth();
  return NextResponse.json({ mobile, desktop });
}
