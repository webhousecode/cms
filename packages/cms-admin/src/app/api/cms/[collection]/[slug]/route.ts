import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { saveRevision } from "@/lib/revisions";
import { removeQueueItemsBySlug } from "@/lib/curation";
import { dispatchRevalidation } from "@/lib/revalidation";
import { getActiveSiteEntry } from "@/lib/site-paths";
import { getSiteRole, getSessionWithSiteRole } from "@/lib/require-role";
import { fireContentEvent } from "@/lib/webhook-events";
import { GitHubStorageAdapter } from "@webhouse/cms";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withSiteContext } from "@/lib/site-context";
import { loadRegistry, findSite } from "@/lib/site-registry";

/**
 * Token-based callers pass `?site=<id>` because they have no admin
 * cookies. Without this wrapper every nested call (getAdminCms,
 * getActiveSiteEntry, dispatchRevalidation) falls back to
 * registry.defaultSiteId — same bug that hit /api/cms/{collection} POST
 * (commit 61adbd71). Apply identical pattern here for PATCH/PUT/DELETE/
 * action-POST.
 */
async function resolveSiteCtx(siteId: string | null): Promise<{ orgId: string; siteId: string } | null> {
  if (!siteId) return null;
  const registry = await loadRegistry();
  if (!registry) return null;
  for (const org of registry.orgs) {
    if (findSite(registry, org.id, siteId)) return { orgId: org.id, siteId };
  }
  return null;
}

async function runScoped<T>(req: NextRequest, fn: () => Promise<T>): Promise<T | Response> {
  const overrideSite = req.nextUrl.searchParams.get("site");
  if (!overrideSite) return fn();
  const ctx = await resolveSiteCtx(overrideSite);
  if (!ctx) return NextResponse.json({ error: `site not found: ${overrideSite}` }, { status: 404 });
  return withSiteContext(ctx, fn);
}

/** Check if deployOnSave is enabled (lightweight, no deploy) */
async function checkDeployOnSave(): Promise<boolean> {
  try {
    const { readSiteConfig } = await import("@/lib/site-config");
    const config = await readSiteConfig();
    return !!config.deployOnSave;
  } catch { return false; }
}

/**
 * Fire-and-forget: auto-deploy on save.
 *
 * Instant Content Deployment: if the site has a revalidateUrl AND
 * the revalidation webhook succeeded, skip the full deploy pipeline.
 * Content is already live via ISR in ~2 seconds.
 *
 * Only triggers a full deploy (Docker build etc.) when:
 * - No revalidateUrl is configured, OR
 * - The revalidation webhook failed/wasn't dispatched
 */
async function dispatchAutoDeployOnSave(revalidationDispatched: boolean) {
  const { readSiteConfig } = await import("@/lib/site-config");
  const config = await readSiteConfig();
  if (!config.deployOnSave) return;

  // If content was already pushed via revalidation webhook → skip full deploy
  if (revalidationDispatched) {
    console.log("[auto-deploy] Skipped — content pushed via Instant Content Deployment (revalidation webhook)");
    return;
  }

  const { triggerDeploy } = await import("@/lib/deploy-service");
  console.log("[auto-deploy] No revalidation endpoint — triggering full deploy...");
  const result = await triggerDeploy();
  console.log(`[auto-deploy] ${result.status}${result.error ? ` — ${result.error}` : ""}`);
}

type Ctx = { params: Promise<{ collection: string; slug: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const result = await runScoped(req, async () => {
    try {
      const { collection, slug } = await params;
      const cms = await getAdminCms();
      const doc = await cms.content.findBySlug(collection, slug);
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(doc);
    } catch {
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  });
  return result instanceof Response ? result : (result as Response);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const postSession = await getSessionWithSiteRole();
  if (!postSession || !postSession.siteRole || postSession.siteRole === "viewer") {
    return NextResponse.json({ error: "No write access" }, { status: 403 });
  }
  const result = await runScoped(req, async () => {
  try {
    const { collection, slug } = await params;
    const body = await req.json() as { action?: string };
    const cms = await getAdminCms();

    // Set Git commit author
    if (cms.storage instanceof GitHubStorageAdapter) {
      cms.storage.setCommitAuthor(postSession.name, postSession.email);
    }

    if (body.action === "restore") {
      const doc = await cms.content.findBySlug(collection, slug);
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const restoredData = { ...doc.data };
      delete restoredData._trashedAt;
      await cms.content.update(collection, doc.id, {
        status: "draft",
        data: restoredData,
      });
      const updated = await cms.content.findBySlug(collection, slug);

      // Dispatch revalidation on restore
      const site = await getActiveSiteEntry().catch(() => null);
      if (site?.revalidateUrl) {
        const config = await getAdminConfig();
        const col = config.collections.find((c) => c.name === collection);
        const urlPrefix = (col as { urlPrefix?: string })?.urlPrefix;
        dispatchRevalidation(site, { collection, slug, action: "updated", document: updated }, urlPrefix).catch(() => {});
      }

      // F35 — fire content webhook
      fireContentEvent("restored", collection, slug, updated ?? undefined, `user:${postSession.email}`).catch(() => {});

      return NextResponse.json(updated);
    }

    if (body.action === "clone") {
      const original = await cms.content.findBySlug(collection, slug);
      if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Find an unused slug: <slug>-copy, <slug>-copy-2, etc.
      let newSlug = `${slug}-copy`;
      let existing = await cms.content.findBySlug(collection, newSlug);
      let n = 2;
      while (existing) {
        newSlug = `${slug}-copy-${n}`;
        existing = await cms.content.findBySlug(collection, newSlug);
        n++;
      }

      const cloned = await cms.content.create(collection, {
        slug: newSlug,
        status: "draft",
        data: { ...original.data },
        ...(original.locale ? { locale: original.locale } : {}),
      });

      // F35 — fire content webhook
      fireContentEvent("cloned", collection, newSlug, cloned, `user:${postSession.email}`).catch(() => {});

      return NextResponse.json(cloned);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  });
  return result instanceof Response ? result : (result as Response);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getSessionWithSiteRole();
  if (!session || !session.siteRole || session.siteRole === "viewer") {
    return NextResponse.json({ error: "No write access" }, { status: 403 });
  }
  const result = await runScoped(req, async () => {
  try {
    const { collection, slug } = await params;
    const body = await req.json() as { data?: Record<string, unknown>; status?: string; locale?: string; translationOf?: string | null; translationGroup?: string; publishAt?: string | null; unpublishAt?: string | null; slug?: string };
    const cms = await getAdminCms();

    // Set Git commit author to the actual editor (not the service token owner)
    if (cms.storage instanceof GitHubStorageAdapter) {
      cms.storage.setCommitAuthor(session.name, session.email);
    }

    const doc = await cms.content.findBySlug(collection, slug);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Validate new slug if provided
    if (body.slug !== undefined && body.slug !== slug) {
      const existing = await cms.content.findBySlug(collection, body.slug);
      if (existing) return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }

    // Save revision snapshot before overwriting
    await saveRevision(collection, doc).catch(() => { /* non-fatal */ });

    const nextStatus = (body.status as string) ?? doc.status;
    // Manually publishing clears any pending schedule
    const publishAt = nextStatus === "published" ? null : body.publishAt;

    // Track who made this edit
    const editedData = {
      ...(body.data ?? doc.data),
      _lastEditedBy: { userId: session.userId, name: session.name, email: session.email, at: new Date().toISOString() },
    };

    await cms.content.update(collection, doc.id, {
      data: editedData,
      status: nextStatus as "draft" | "published" | "archived",
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.locale !== undefined && { locale: body.locale }),
      ...(body.translationOf !== undefined && { translationOf: body.translationOf ?? undefined }),
      ...(body.translationGroup !== undefined && { translationGroup: body.translationGroup }),
      ...("publishAt" in body || nextStatus === "published" ? { publishAt } : {}),
      ...("unpublishAt" in body ? { unpublishAt: body.unpublishAt } : {}),
    });

    // F61: audit
    try {
      const { logDocumentPublished, logDocumentTrashed, logDocumentUpdated, auditLog } = await import("@/lib/event-log");
      const title = String((editedData as Record<string, unknown>).title ?? doc.data?.title ?? slug);
      const statusChanged = body.status && body.status !== doc.status;
      const actor = { userId: session.userId, email: session.email, name: session.name };
      const finalSlug = body.slug ?? slug;
      if (statusChanged && nextStatus === "published") {
        await logDocumentPublished(actor, collection, finalSlug, title);
      } else if (statusChanged && nextStatus === "trashed") {
        await logDocumentTrashed(actor, collection, finalSlug, title);
      } else if (statusChanged && nextStatus === "draft" && doc.status === "published") {
        await auditLog("document.unpublished", { type: "user", ...actor }, { type: "document", collection, slug: finalSlug, title });
      } else {
        await logDocumentUpdated(actor, collection, finalSlug, title, body.data ? Object.keys(body.data) : undefined);
      }
    } catch { /* non-fatal */ }

    // If trashing, clean up any pending curation queue entries for this doc
    if (nextStatus === "trashed") {
      await removeQueueItemsBySlug(collection, slug).catch(() => {});
    }

    const newSlug = body.slug ?? slug;
    const updated = await cms.content.findBySlug(collection, newSlug);

    // Dispatch revalidation for sites with revalidateUrl configured (Instant Content Deployment)
    const site = await getActiveSiteEntry().catch(() => null);
    let revalidationOk = false;
    if (site?.revalidateUrl) {
      const config = await getAdminConfig();
      const col = config.collections.find((c) => c.name === collection);
      const urlPrefix = (col as { urlPrefix?: string })?.urlPrefix;
      const action = nextStatus === "published" ? "published" : nextStatus === "trashed" ? "deleted" : "updated";
      // If slug changed, delete the old file on the site first
      if (newSlug !== slug) {
        dispatchRevalidation(site, { collection, slug, action: "deleted" }, urlPrefix).catch(() => {});
      }
      const result = await dispatchRevalidation(site, { collection, slug: newSlug, action, document: updated }, urlPrefix).catch(() => ({ ok: false }));
      revalidationOk = result.ok;
    }

    // Auto-translate on publish / auto-retranslate on update (fire-and-forget)
    // Only trigger for docs in default locale to avoid circular translations
    {
      try {
        const { readSiteConfig } = await import("@/lib/site-config");
        const siteConfig = await readSiteConfig();
        const docLocale = updated?.locale || siteConfig.locales[0] || "";
        const isDefaultLocale = docLocale === (siteConfig.defaultLocale || siteConfig.locales[0] || "");
        const targetLocales = isDefaultLocale
          ? siteConfig.locales.filter((l: string) => l !== docLocale)
          : [];
        if (targetLocales.length > 0) {
          const shouldTranslate = siteConfig.autoRetranslateOnUpdate &&
            (nextStatus === "published" || doc.status === "published"); // only when toggle is ON
          if (shouldTranslate) {
            const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
            const serviceToken = process.env.CMS_JWT_SECRET;
            for (const targetLocale of targetLocales) {
              fetch(`${baseUrl}/api/cms/${collection}/${newSlug}/translate`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-cms-service-token": serviceToken || "" },
                body: JSON.stringify({ targetLocale, publish: false }),
              }).catch(() => {}); // fire-and-forget
            }
            const reason = nextStatus === "published" ? "publish" : "update (autoRetranslate)";
            console.log(`[auto-translate] Triggered ${reason} of ${collection}/${newSlug} → ${targetLocales.join(", ")}`);
          }
        }
      } catch { /* non-fatal */ }
    }

    // Auto-deploy on save (fire-and-forget)
    // If revalidation webhook succeeded, content is already live — skip full deploy
    const willDeploy = revalidationOk ? false : await checkDeployOnSave();
    dispatchAutoDeployOnSave(revalidationOk).catch(() => {});

    // F35 — fire content lifecycle webhook
    {
      const previousStatus = doc.status;
      let action: "updated" | "published" | "unpublished" | "trashed" = "updated";
      if (nextStatus === "published" && previousStatus !== "published") action = "published";
      else if (nextStatus === "trashed") action = "trashed";
      else if (previousStatus === "published" && nextStatus === "draft") action = "unpublished";
      fireContentEvent(action, collection, newSlug, updated ?? undefined, `user:${session.email}`).catch(() => {});
    }

    return NextResponse.json({ ...updated, _deployTriggered: willDeploy });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  });
  return result instanceof Response ? result : (result as Response);
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const delSession = await getSessionWithSiteRole();
  if (!delSession || !delSession.siteRole || delSession.siteRole === "viewer") {
    return NextResponse.json({ error: "No write access" }, { status: 403 });
  }
  const result = await runScoped(req, async () => {
  try {
    const { collection, slug } = await params;
    const permanent = req.nextUrl.searchParams.get("permanent") === "true";
    const cms = await getAdminCms();
    const doc = await cms.content.findBySlug(collection, slug);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (permanent) {
      await cms.content.delete(collection, doc.id);
    } else {
      // Move to trash
      await cms.content.update(collection, doc.id, {
        status: "trashed" as any,
        data: { ...doc.data, _trashedAt: new Date().toISOString() },
      });
    }

    // F61: audit
    try {
      const { logDocumentDeleted, logDocumentTrashed } = await import("@/lib/event-log");
      const actor = { userId: delSession.userId, email: delSession.email, name: delSession.name };
      const title = String(doc.data?.title ?? slug);
      if (permanent) {
        await logDocumentDeleted(actor, collection, slug, title);
      } else {
        await logDocumentTrashed(actor, collection, slug, title);
      }
    } catch { /* non-fatal */ }

    // Either way, clean up any pending curation queue entries
    await removeQueueItemsBySlug(collection, slug).catch(() => {});

    // Dispatch revalidation
    const site = await getActiveSiteEntry().catch(() => null);
    if (site?.revalidateUrl) {
      const config = await getAdminConfig();
      const col = config.collections.find((c) => c.name === collection);
      const urlPrefix = (col as { urlPrefix?: string })?.urlPrefix;
      dispatchRevalidation(site, { collection, slug, action: "deleted" }, urlPrefix).catch(() => {});
    }

    // F35 — fire content webhook
    fireContentEvent(permanent ? "trashed" : "trashed", collection, slug, doc, `user:${delSession.email}`).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  });
  return result instanceof Response ? result : (result as Response);
}
