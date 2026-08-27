import { getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";
import { readSiteConfig } from "@/lib/site-config";
import { getSiteRole } from "@/lib/require-role";

export async function GET() {
  const role = await getSiteRole();
  if (role !== "admin") {
    const { schemaEditEnabled } = await readSiteConfig();
    if (!schemaEditEnabled) {
      return NextResponse.json({ error: "Schema editing disabled" }, { status: 403 });
    }
  }
  const config = await getAdminConfig();
  // The WHOLE collection, not a hand-picked subset.
  //
  // This used to return four properties — name, label, urlPrefix, fields — and
  // silently omit everything else. Measured on 27 Aug 2026 while syncing a new
  // collection to sanneandersen: `kind`, `sourceLocale` and the editor-facing
  // `description` were written correctly to cms.config.ts and absent from this
  // response, so the peer session verifying the sync would have concluded it
  // failed. `previewable`, `urlPattern`, `nested`, `defaultSort` and every
  // property a future collection gains were in the same hole.
  //
  // The POST route in this same feature already carries the lesson —
  // "keep existing collections as full objects (no prop reduction)" — for the
  // write path. The read path never got it. Instance closed, class left open.
  return NextResponse.json({ collections: config.collections });
}
