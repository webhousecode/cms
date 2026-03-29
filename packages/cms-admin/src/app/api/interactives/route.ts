import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";
import { denyViewers } from "@/lib/require-role";

/* ─── GET: list all interactives ─────────────────────────────── */
export async function GET() {
  try {
    const adapter = await getMediaAdapter();
    const all = await adapter.listInteractives();
    // Exclude trashed interactives from the list
    const meta = all.filter((i) => i.status !== "trashed");
    return NextResponse.json(meta);
  } catch (err) {
    console.error("[interactives] list error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── POST: upload new interactive ───────────────────────────── */
export async function POST(req: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const adapter = await getMediaAdapter();
    const entry = await adapter.createInteractive(file.name, buffer);

    // Auto-set locale: detect from HTML lang attribute, fallback to site default
    const html = buffer.toString("utf-8");
    const langMatch = html.match(/<html[^>]*\slang=["']([^"']+)["']/i);
    const { readSiteConfig } = await import("@/lib/site-config");
    const siteConfig = await readSiteConfig();
    const locale = langMatch?.[1]?.toLowerCase() || siteConfig.defaultLocale || "en";
    await adapter.updateInteractive(entry.id, { locale });

    return NextResponse.json({ ...entry, locale }, { status: 201 });
  } catch (err) {
    console.error("[interactives] upload error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
