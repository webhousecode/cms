import { getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { writeConfigCollections, writeConfigForms } from "@/lib/config-writer";
import type { CollectionDef, FormDef } from "@/lib/config-writer";
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

  const body = (await req.json().catch(() => ({}))) as {
    collections?: unknown;
    forms?: unknown;
    mode?: unknown;
  };
  const mode: SyncMode = body.mode === "replace" ? "replace" : "upsert";

  // `forms` may arrive on its own — a site whose only drift is a form field
  // should not have to re-push its whole schema to fix it.
  const wantsForms = body.forms !== undefined;
  if (wantsForms) {
    if (!Array.isArray(body.forms) || body.forms.length === 0) {
      return NextResponse.json(
        { ok: false, error: "forms must be a non-empty array" },
        { status: 400 },
      );
    }
    if (!body.forms.every((f) => f && typeof (f as { name?: unknown }).name === "string")) {
      return NextResponse.json({ ok: false, error: "every form needs a string name" }, { status: 400 });
    }
  }

  if (wantsForms && body.collections === undefined) {
    return syncFormsOnly(body.forms as FormDef[]);
  }

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

  if (wantsForms) {
    const formsResult = await syncFormsOnly(body.forms as FormDef[]);
    const formsBody = (await formsResult.json()) as Record<string, unknown>;
    if (formsResult.status !== 200) return NextResponse.json(formsBody, { status: formsResult.status });
    return NextResponse.json({ ok: true, mode, changed, added, updated, unchanged, adminOnly, forms: formsBody });
  }

  return NextResponse.json({ ok: true, mode, changed, added, updated, unchanged, adminOnly });
}

/**
 * Upsert the `forms` array by name — never delete.
 *
 * Same safety as collections and for the same reason: a partial or buggy push
 * must not be able to empty a tenant's forms. A form the payload does not
 * mention is left exactly as it was.
 */
async function syncFormsOnly(payload: FormDef[]): Promise<NextResponse> {
  const config = await getAdminConfig();
  const { configPath } = await getActiveSitePaths();
  const existing = ((config.forms ?? []) as unknown as FormDef[]).map((f) => ({ ...f }));

  const byName = new Map(existing.map((f) => [f.name, f] as const));
  const added: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];

  for (const f of payload) {
    const before = byName.get(f.name);
    if (!before) {
      byName.set(f.name, f);
      added.push(f.name);
    } else if (JSON.stringify(before) !== JSON.stringify(f)) {
      byName.set(f.name, f);
      updated.push(f.name);
    } else {
      unchanged.push(f.name);
    }
  }

  const changed = added.length > 0 || updated.length > 0;
  if (changed) {
    // Order follows the existing file, with anything new appended — so an
    // unchanged re-push cannot reshuffle the file and look like a diff.
    const merged = [
      ...existing.map((f) => byName.get(f.name)!),
      ...added.map((n) => byName.get(n)!),
    ];
    await writeConfigForms(configPath, config, merged);
    await invalidateActiveSite();
    await invalidateQuickCacheOnWrite();
  }

  return NextResponse.json({ ok: true, changed, added, updated, unchanged });
}
