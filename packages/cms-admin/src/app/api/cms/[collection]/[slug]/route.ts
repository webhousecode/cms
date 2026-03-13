import { getAdminCms } from "@/lib/cms";
import { saveRevision } from "@/lib/revisions";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type Ctx = { params: Promise<{ collection: string; slug: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { collection, slug } = await params;
    const body = await req.json() as { action?: string };
    const cms = await getAdminCms();

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
      });
      return NextResponse.json(cloned);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { collection, slug } = await params;
    const body = await req.json() as { data?: Record<string, unknown>; status?: string; locale?: string; translationOf?: string | null; publishAt?: string | null };
    const cms = await getAdminCms();

    const doc = await cms.content.findBySlug(collection, slug);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Save revision snapshot before overwriting
    await saveRevision(collection, doc).catch(() => { /* non-fatal */ });

    const nextStatus = (body.status as "draft" | "published") ?? doc.status;
    // Manually publishing clears any pending schedule
    const publishAt = nextStatus === "published" ? null : body.publishAt;

    await cms.content.update(collection, doc.id, {
      data: body.data ?? doc.data,
      status: nextStatus,
      ...(body.locale !== undefined && { locale: body.locale }),
      ...(body.translationOf !== undefined && { translationOf: body.translationOf ?? undefined }),
      ...("publishAt" in body || nextStatus === "published" ? { publishAt } : {}),
    });

    const updated = await cms.content.findBySlug(collection, slug);
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
