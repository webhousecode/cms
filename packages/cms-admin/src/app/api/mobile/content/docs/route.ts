import { NextResponse, type NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getAdminCmsForSite, getAdminConfigForSite } from "@/lib/cms";
import { readSiteConfigForSite } from "@/lib/site-config";
import { saveRevision } from "@/lib/revisions";
import { signMobileUploadUrl } from "@/app/api/mobile/uploads/route";
import os from "os";

function getLanBaseUrl(reqUrl: URL): string {
  let base = `${reqUrl.protocol}//${reqUrl.host}`;
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(base)) {
    const ifaces = os.networkInterfaces();
    for (const list of Object.values(ifaces)) {
      for (const i of list ?? []) {
        if (i.family === "IPv4" && !i.internal) {
          base = base.replace(/localhost|127\.0\.0\.1|0\.0\.0\.0/, i.address);
          return base;
        }
      }
    }
  }
  return base;
}

/** Rewrite relative /uploads/ URLs in document data to signed absolute URLs */
function signDocumentUrls(data: Record<string, unknown>, baseUrl: string, orgId: string, siteId: string): Record<string, unknown> {
  const result = { ...data };
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string" && value.startsWith("/uploads/")) {
      result[key] = signMobileUploadUrl(baseUrl, orgId, siteId, value);
    }
    // Handle image-gallery arrays: [{url, alt}]
    if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (item && typeof item === "object" && typeof (item as any).url === "string" && (item as any).url.startsWith("/uploads/")) {
          return { ...item, url: signMobileUploadUrl(baseUrl, orgId, siteId, (item as any).url) };
        }
        return item;
      });
    }
  }
  return result;
}

/**
 * Fire-and-forget: trigger deploy for a site after content changes.
 * Calls the deploy API internally with cookies set so it resolves the right site.
 */
function dispatchMobileDeploy(orgId: string, siteId: string) {
  const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
  const serviceToken = process.env.CMS_JWT_SECRET;
  fetch(`${baseUrl}/api/admin/deploy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `cms-active-org=${orgId}; cms-active-site=${siteId}`,
      ...(serviceToken ? { "x-cms-service-token": serviceToken } : {}),
    },
  }).catch((err) => {
    console.error("[mobile/deploy] Fire-and-forget deploy failed:", err);
  });
}

/**
 * Mobile document CRUD — /api/mobile/content/docs
 *
 * All operations take orgId, siteId, collection as query params.
 * No cookies needed — auth via Bearer JWT.
 *
 * GET  ?orgId=...&siteId=...&collection=...           → list documents
 * GET  ?orgId=...&siteId=...&collection=...&slug=...  → single document
 * POST ?orgId=...&siteId=...&collection=...           → create document
 * PATCH ?orgId=...&siteId=...&collection=...&slug=... → update document
 * DELETE ?orgId=...&siteId=...&collection=...&slug=... → trash document
 */

async function resolveContext(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) return null;

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  const collection = req.nextUrl.searchParams.get("collection");
  if (!orgId || !siteId || !collection) return null;

  const [cms, config] = await Promise.all([
    getAdminCmsForSite(orgId, siteId),
    getAdminConfigForSite(orgId, siteId),
  ]);
  if (!cms || !config) return null;

  const colConfig = config.collections.find((c) => c.name === collection);
  if (!colConfig) return null;

  return { session, orgId, siteId, collection, cms, config, colConfig };
}

/** GET — list or single document */
export async function GET(req: NextRequest) {
  const ctx = await resolveContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Invalid request or not authenticated" }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get("slug");

  try {
    const baseUrl = getLanBaseUrl(new URL(req.url));

    if (slug) {
      // Single document — sign upload URLs in data
      const doc = await ctx.cms.content.findBySlug(ctx.collection, slug);
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({
        ...doc,
        data: signDocumentUrls(doc.data, baseUrl, ctx.orgId, ctx.siteId),
      });
    }

    // List all (exclude trashed) — sign upload URLs
    const { documents } = await ctx.cms.content.findMany(ctx.collection, {});
    const filtered = documents
      .filter((d: any) => d.status !== "trashed")
      .map((d: any) => ({
        id: d.id,
        slug: d.slug,
        status: d.status,
        locale: d.locale,
        data: signDocumentUrls(d.data, baseUrl, ctx.orgId, ctx.siteId),
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));
    return NextResponse.json({ documents: filtered });
  } catch (err) {
    console.error("[mobile/content/docs] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** POST — create document */
export async function POST(req: NextRequest) {
  const ctx = await resolveContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Invalid request or not authenticated" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      slug: string;
      data?: Record<string, unknown>;
      locale?: string;
    };

    if (!body.slug?.trim()) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    // Check slug availability
    const existing = await ctx.cms.content.findBySlug(ctx.collection, body.slug);
    if (existing) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }

    const doc = await ctx.cms.content.create(ctx.collection, {
      slug: body.slug.trim(),
      data: body.data ?? {},
      status: "draft",
      ...(body.locale ? { locale: body.locale } : {}),
    });

    // Auto-deploy on create if deployOnSave enabled
    readSiteConfigForSite(ctx.orgId, ctx.siteId)
      .then((siteConfig) => {
        if (siteConfig?.deployOnSave) {
          dispatchMobileDeploy(ctx.orgId, ctx.siteId);
        }
      })
      .catch(() => {});

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    console.error("[mobile/content/docs] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** PATCH — update document */
export async function PATCH(req: NextRequest) {
  const ctx = await resolveContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Invalid request or not authenticated" }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug query param required" }, { status: 400 });
  }

  try {
    const body = (await req.json()) as {
      data?: Record<string, unknown>;
      status?: string;
    };

    const doc = await ctx.cms.content.findBySlug(ctx.collection, slug);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Save revision before overwriting
    await saveRevision(ctx.collection, doc).catch(() => {});

    const nextStatus = (body.status as "draft" | "published" | "archived") ?? doc.status;
    const editedData = {
      ...(body.data ?? doc.data),
      _lastEditedBy: {
        userId: ctx.session.id,
        name: ctx.session.name,
        email: ctx.session.email,
        at: new Date().toISOString(),
        source: "mobile",
      },
    };

    await ctx.cms.content.update(ctx.collection, doc.id, {
      data: editedData,
      status: nextStatus,
    });

    const updated = await ctx.cms.content.findBySlug(ctx.collection, slug);

    // Auto-deploy if site has deployOnSave enabled (fire-and-forget)
    readSiteConfigForSite(ctx.orgId, ctx.siteId)
      .then((siteConfig) => {
        if (siteConfig?.deployOnSave) {
          console.log(`[mobile/deploy] Auto-deploy triggered for ${ctx.orgId}/${ctx.siteId} (content PATCH from mobile)`);
          dispatchMobileDeploy(ctx.orgId, ctx.siteId);
        }
      })
      .catch(() => {});

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[mobile/content/docs] PATCH error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** DELETE — trash document */
export async function DELETE(req: NextRequest) {
  const ctx = await resolveContext(req);
  if (!ctx) {
    return NextResponse.json({ error: "Invalid request or not authenticated" }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug query param required" }, { status: 400 });
  }

  try {
    const doc = await ctx.cms.content.findBySlug(ctx.collection, slug);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Soft delete (trash)
    await ctx.cms.content.update(ctx.collection, doc.id, {
      status: "trashed" as any,
      data: { ...doc.data, _trashedAt: new Date().toISOString() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[mobile/content/docs] DELETE error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
