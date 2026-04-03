/**
 * GET /api/admin/deploy/templates — List available site templates.
 */
import { NextResponse } from "next/server";
import { TEMPLATES, getTemplateScreenshotUrl } from "@/lib/deploy/template-registry";
import { denyViewers } from "@/lib/require-role";

export async function GET() {
  const denied = await denyViewers();
  if (denied) return denied;

  const templates = TEMPLATES.map((t) => ({
    ...t,
    screenshotUrl: getTemplateScreenshotUrl(t.id),
  }));

  return NextResponse.json({ templates });
}
