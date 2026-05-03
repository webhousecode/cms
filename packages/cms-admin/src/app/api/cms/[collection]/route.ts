import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSiteRole } from "@/lib/require-role";
import { dispatchRevalidation } from "@/lib/revalidation";
import { getActiveSiteEntry } from "@/lib/site-paths";
import { saveRevision } from "@/lib/revisions";
import { withSiteContext } from "@/lib/site-context";
import { loadRegistry, findSite } from "@/lib/site-registry";

type Ctx = { params: Promise<{ collection: string }> };

/**
 * Resolve org for a `?site=<id>` token-based call. Without this the
 * downstream getActiveSitePaths / getAdminCms / getActiveSiteEntry all
 * fall back to registry.defaultSiteId — which means a token scoped to
 * site:trail can land documents on webhouse-site by accident. The bug
 * shipped before site-context was wired into this route.
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

/** Wrap a handler in withSiteContext when ?site= is present. */
async function runScoped<T>(req: NextRequest, fn: () => Promise<T>): Promise<T | Response> {
  const overrideSite = req.nextUrl.searchParams.get("site");
  if (!overrideSite) return fn();
  const ctx = await resolveSiteCtx(overrideSite);
  if (!ctx) return NextResponse.json({ error: `site not found: ${overrideSite}` }, { status: 404 });
  return withSiteContext(ctx, fn);
}

export async function GET(req: NextRequest, { params }: Ctx) {
  // Viewers can read, but check team membership exists
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ error: "No access to this site" }, { status: 403 });
  const result = await runScoped(req, async () => {
  try {
    const { collection } = await params;
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const colConfig = config.collections.find((c) => c.name === collection);
    if (!colConfig) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
    const { documents } = await cms.content.findMany(collection, {});
    // ?all=true includes trashed docs (needed for collection list filters)
    const includeAll = req.nextUrl.searchParams.get("all") === "true";
    return NextResponse.json(includeAll ? documents : documents.filter((d: any) => d.status !== "trashed"));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  });
  return result instanceof Response ? result : result as Response;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  // Only admins and editors can create documents
  const role = await getSiteRole();
  if (!role || role === "viewer") return NextResponse.json({ error: "Editors only" }, { status: 403 });

  const result = await runScoped(req, async () => {
  try {
    const { collection } = await params;
    const body = await req.json() as {
      slug: string;
      data?: Record<string, unknown>;
      locale?: string;
      status?: "draft" | "published";
    };
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

    const colConfig = config.collections.find((c) => c.name === collection);
    if (!colConfig) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });

    // Default to draft. Callers may opt in to "published" for one-shot
    // create-and-publish — without this the document lands as draft and the
    // content never reaches the live site, which broke ICD timing on
    // create+publish-in-one-call (silent: API returned 201 but live URL stayed
    // 404 because no revalidation webhook fires for drafts).
    const status: "draft" | "published" = body.status === "published" ? "published" : "draft";

    const locale = body.locale ?? config.defaultLocale;
    const doc = await cms.content.create(collection, {
      slug: body.slug,
      data: body.data ?? {},
      status,
      ...(locale ? { locale } : {}),
    });

    // F61: audit
    try {
      const { logDocumentCreated } = await import("@/lib/event-log");
      const { getSessionWithSiteRole } = await import("@/lib/require-role");
      const session = await getSessionWithSiteRole();
      if (session) {
        await logDocumentCreated(
          { userId: session.userId, email: session.email, name: session.name },
          collection,
          body.slug,
          String(body.data?.title ?? body.slug),
        );
      }
    } catch { /* non-fatal */ }

    // ICD: a published document needs to reach the live site immediately.
    // Mirror the PATCH path: save a revision, then fire the revalidation
    // webhook (and skip full Docker rebuild because revalidation already
    // pushed the JSON). Drafts skip both — they're not on the live site.
    let deployTriggered = false;
    if (status === "published") {
      try { await saveRevision(collection, doc); } catch { /* non-fatal */ }

      const site = await getActiveSiteEntry().catch(() => null);
      const urlPrefix = (colConfig as { urlPrefix?: string }).urlPrefix;
      let revalidationDispatched = false;
      if (site?.revalidateUrl) {
        const result = await dispatchRevalidation(
          site,
          { collection, slug: body.slug, action: "published", document: doc },
          urlPrefix,
        ).catch(() => ({ ok: false }));
        revalidationDispatched = !!result.ok;
      }

      try {
        const { readSiteConfig } = await import("@/lib/site-config");
        const siteConfig = await readSiteConfig();
        if (siteConfig.deployOnSave) {
          if (revalidationDispatched) {
            console.log("[auto-deploy] Skipped — content pushed via Instant Content Deployment (revalidation webhook)");
          } else {
            const { triggerDeploy } = await import("@/lib/deploy-service");
            console.log("[auto-deploy] No revalidation endpoint — triggering full deploy...");
            triggerDeploy().then(
              (r) => console.log(`[auto-deploy] ${r.status}${r.error ? ` — ${r.error}` : ""}`),
              (e) => console.log(`[auto-deploy] error — ${e instanceof Error ? e.message : String(e)}`),
            );
            deployTriggered = true;
          }
        }
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ ...doc, _deployTriggered: deployTriggered }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  });
  return result instanceof Response ? result : result as Response;
}
