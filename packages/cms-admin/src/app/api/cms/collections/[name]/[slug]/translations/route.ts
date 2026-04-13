import { getAdminCms } from "@/lib/cms";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ name: string; slug: string }> };

/**
 * GET /api/cms/collections/[name]/[slug]/translations
 *
 * Returns translation siblings for a document.
 * Uses translationGroup (preferred) or legacy translationOf fallback.
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { name: collection, slug } = await params;
    const cms = await getAdminCms();
    if (!cms) return NextResponse.json({ translations: [], siblingData: [] });

    const doc = await cms.content.findBySlug(collection, slug);
    if (!doc) return NextResponse.json({ translations: [], siblingData: [] });

    const { documents: allDocs } = await cms.content.findMany(collection, {});

    const groupId = doc.translationGroup;
    let siblings: typeof allDocs;

    if (groupId) {
      siblings = (allDocs as any[]).filter(
        (d) => d.translationGroup === groupId && d.id !== doc.id && d.status !== "trashed"
      );
    } else {
      const originalSlug = doc.translationOf ?? doc.slug;
      siblings = (allDocs as any[]).filter(
        (d) =>
          d.slug !== doc.slug &&
          d.status !== "trashed" &&
          (d.translationOf === originalSlug || d.slug === originalSlug)
      );
    }

    const translations = siblings.map((d: any) => ({
      slug: d.slug,
      locale: d.locale ?? null,
      status: d.status,
      updatedAt: d.updatedAt,
    }));

    const siblingData = siblings.map((d: any) => ({
      locale: d.locale ?? "",
      slug: d.slug,
      data: d.data,
    }));

    return NextResponse.json({ translations, siblingData });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
