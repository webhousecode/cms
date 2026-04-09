import { NextResponse, type NextRequest } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { getAdminCmsForSite, getAdminConfigForSite } from "@/lib/cms";
import { saveRevision } from "@/lib/revisions";

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
    if (slug) {
      // Single document
      const doc = await ctx.cms.content.findBySlug(ctx.collection, slug);
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(doc);
    }

    // List all (exclude trashed)
    const { documents } = await ctx.cms.content.findMany(ctx.collection, {});
    const filtered = documents
      .filter((d: any) => d.status !== "trashed")
      .map((d: any) => ({
        id: d.id,
        slug: d.slug,
        status: d.status,
        locale: d.locale,
        data: d.data,
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
