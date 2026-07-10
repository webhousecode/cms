import { getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { writeConfigCollections } from "@/lib/config-writer";
import type { CollectionDef } from "@/lib/config-writer";
import { readSiteConfig } from "@/lib/site-config";
import { getActiveSitePaths } from "@/lib/site-paths";
import { denyViewers, getSiteRole } from "@/lib/require-role";
import { invalidateActiveSite } from "@/lib/site-pool";
import { invalidateQuickCacheOnWrite } from "@/lib/chat/quick-prewarm";
import { mergeCollectionsForSync, type SyncMode } from "@/lib/schema-sync";

/**
 * F159 — beam-site config auto-sync.
 *   POST /api/schema/sync?site=<id>  { collections: CollectionDef[], mode?: "upsert"|"replace" }
 *
 * A beam-site boot-pushes its full `config.collections` here so webhouse.app's
 * beamed copy mirrors the deployed repo config (the single source of truth) —
 * no more "Unknown collection" for a repo-added collection, no manual step.
 *
 * Safety:
 *   - collections ONLY. Any storage/locales/blocks in the payload is ignored;
 *     webhouse.app's own top-level fields (esp. absolute /data `storage` paths)
 *     are preserved verbatim by writeConfigCollections (the broberg-ai
 *     content-wipe bug class).
 *   - `upsert` (default) never deletes; an empty payload → 400. So a partial or
 *     buggy boot-push can't wipe the tenant's config.
 *   - an identical re-push is a no-op — nothing is rewritten, so every boot
 *     doesn't churn the config or trigger a quick-cache pre-warm.
 */
export async function POST(req: NextRequest) {
  const denied = await denyViewers();
  if (denied) return denied;
  const role = await getSiteRole();
  if (role !== "admin") {
    const { schemaEditEnabled } = await readSiteConfig();
    if (!schemaEditEnabled) {
      return NextResponse.json({ ok: false, error: "Schema editing disabled" }, { status: 403 });
    }
  }

  const body = (await req.json().catch(() => ({}))) as { collections?: unknown; mode?: unknown };
  const mode: SyncMode = body.mode === "replace" ? "replace" : "upsert";

  if (!Array.isArray(body.collections) || body.collections.length === 0) {
    return NextResponse.json(
      { ok: false, error: "collections must be a non-empty array" },
      { status: 400 },
    );
  }
  if (!body.collections.every((c) => c && typeof (c as { name?: unknown }).name === "string")) {
    return NextResponse.json(
      { ok: false, error: "every collection needs a string name" },
      { status: 400 },
    );
  }
  const payload = body.collections as unknown as CollectionDef[];

  const config = await getAdminConfig();
  const { configPath } = await getActiveSitePaths();
  const existing = config.collections as unknown as CollectionDef[];

  const { merged, added, updated, unchanged, adminOnly, changed } = mergeCollectionsForSync(
    existing,
    payload,
    mode,
  );

  if (changed) {
    await writeConfigCollections(configPath, config, merged);
    await invalidateActiveSite();
    await invalidateQuickCacheOnWrite(); // schema changed → refresh site-info/overview
  }

  return NextResponse.json({ ok: true, mode, changed, added, updated, unchanged, adminOnly });
}
