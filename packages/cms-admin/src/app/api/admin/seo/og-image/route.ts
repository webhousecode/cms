import { NextRequest, NextResponse } from "next/server";
import { getAdminCms } from "@/lib/cms";
import { generateOgImage } from "@/lib/seo/og-image";
import { denyViewers } from "@/lib/require-role";

/**
 * POST /api/admin/seo/og-image
 *
 * Auto-generates an OG image for a document.
 * Finds the first image in content, overlays title + gradient.
 * Body: { collection: string, slug: string }
 * Returns: { url: string } or { error: string }
 */
export async function POST(req: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const { collection, slug } = (await req.json()) as { collection?: string; slug?: string };
    if (!collection || !slug) {
      return NextResponse.json({ error: "collection and slug required" }, { status: 400 });
    }

    const cms = await getAdminCms();
    const doc = await cms.content.findBySlug(collection, slug);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const data = (doc as { data?: Record<string, unknown> }).data ?? {};
    const title = String(data.title ?? data.name ?? slug);

    // Find source image: dedicated field → first markdown image → first HTML image
    const rawContent = String(data.content ?? data.body ?? "");
    const fieldImg = String(data.heroImage ?? data.coverImage ?? data.image ?? "");
    let sourceImage = "";

    if (fieldImg && fieldImg.startsWith("/uploads/")) {
      sourceImage = fieldImg;
    } else {
      const mdMatch = rawContent.match(/!\[[^\]]*\]\((\/uploads\/[^\s"]+)/);
      if (mdMatch) sourceImage = mdMatch[1];
      else {
        const htmlMatch = rawContent.match(/<img[^>]+src="(\/uploads\/[^"]+)"/);
        if (htmlMatch) sourceImage = htmlMatch[1];
      }
    }

    if (!sourceImage) {
      return NextResponse.json({ error: "No image found in document to use as OG base" }, { status: 404 });
    }

    const url = await generateOgImage(sourceImage, title, slug);
    if (!url) {
      return NextResponse.json({ error: "OG image generation failed" }, { status: 500 });
    }

    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
