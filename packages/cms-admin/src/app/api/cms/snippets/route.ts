/**
 * GET /api/cms/snippets — List all snippets from the snippets collection.
 *
 * Returns snippet metadata for the editor picker.
 * Falls back gracefully if no "snippets" collection exists.
 */
import { NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";

export async function GET() {
  try {
    const config = await getAdminConfig();
    const hasSnippets = config.collections.some((c) => c.name === "snippets");
    if (!hasSnippets) {
      return NextResponse.json({ snippets: [], hasCollection: false });
    }

    const cms = await getAdminCms();
    const { documents } = await cms.content.findMany("snippets", {});
    const snippets = documents.map((doc: any) => ({
      slug: doc.slug,
      title: doc.data?.title ?? doc.slug,
      lang: doc.data?.lang ?? "",
      code: doc.data?.code ?? "",
    }));

    return NextResponse.json({ snippets, hasCollection: true });
  } catch {
    return NextResponse.json({ snippets: [], hasCollection: false });
  }
}
