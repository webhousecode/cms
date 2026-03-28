import { NextRequest, NextResponse } from "next/server";
import {
  readKeywordStore,
  addKeyword,
  removeKeyword,
  analyzeKeywords,
  type TrackedKeyword,
} from "@/lib/seo/keywords";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { denyViewers } from "@/lib/require-role";
import type { SeoFields } from "@/lib/seo/score";

/** Strip HTML/markdown to plain text for keyword density analysis */
function stripToText(content: string): string {
  return content
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_~`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * GET /api/admin/seo/keywords
 * Returns tracked keywords with coverage analysis across all documents.
 */
export async function GET() {
  try {
    const store = await readKeywordStore();
    if (store.keywords.length === 0) {
      return NextResponse.json({ keywords: [], analyses: [] });
    }

    // Load all documents for analysis
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const documents: Array<{
      collection: string;
      slug: string;
      title: string;
      content: string;
      seo: SeoFields;
    }> = [];

    for (const col of config.collections) {
      try {
        const { documents: docs } = await cms.content.findMany(col.name, {});
        for (const doc of docs) {
          if ((doc.status as string) === "trashed") continue;
          const data = (doc as { data?: Record<string, unknown> }).data ?? {};
          documents.push({
            collection: col.name,
            slug: doc.slug,
            title: String(data.title ?? data.name ?? doc.slug),
            content: stripToText(String(data.content ?? data.body ?? "")),
            seo: (data._seo as SeoFields) ?? {},
          });
        }
      } catch { /* skip broken collections */ }
    }

    const analyses = analyzeKeywords(store.keywords, documents);
    return NextResponse.json({ keywords: store.keywords, analyses });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/seo/keywords
 * Add or remove a tracked keyword.
 * Body: { action: "add" | "remove", keyword: string, target?: "primary" | "secondary" | "long-tail" }
 */
export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const body = await request.json() as {
      action: "add" | "remove";
      keyword: string;
      target?: TrackedKeyword["target"];
    };

    if (!body.keyword?.trim()) {
      return NextResponse.json({ error: "keyword required" }, { status: 400 });
    }

    let store;
    if (body.action === "remove") {
      store = await removeKeyword(body.keyword);
    } else {
      store = await addKeyword(body.keyword, body.target ?? "primary");
    }

    return NextResponse.json({ keywords: store.keywords });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: err instanceof Error && err.message.includes("already") ? 409 : 500 },
    );
  }
}
