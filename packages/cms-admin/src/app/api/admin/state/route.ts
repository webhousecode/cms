/**
 * GET /api/admin/state — Coarse-grained admin-server state for client UX.
 *
 * Returns flags the sidebar / command palette / empty-state pages need
 * to know about up-front. Avoid putting site-specific data here — this
 * endpoint should answer fast and not depend on a "current site".
 */
import { NextResponse } from "next/server";
import { isAdminEmpty } from "@/lib/admin-empty";

export async function GET() {
  return NextResponse.json({
    isEmpty: await isAdminEmpty(),
  });
}
