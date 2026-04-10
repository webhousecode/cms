import { NextRequest, NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { getSitePathsFor } from "@/lib/site-paths";
import { readSiteConfigForSite } from "@/lib/site-config";
import { FilesystemMediaAdapter } from "@/lib/media/filesystem";

/** Read/write media-meta.json directly from a known dataDir (no cookies) */
async function appendMetaDirect(dataDir: string, key: string, data: Record<string, unknown>) {
  const metaPath = join(dataDir, "media-meta.json");
  let entries: any[] = [];
  try { entries = JSON.parse(await readFile(metaPath, "utf-8")); } catch { /* new file */ }

  const folder = key.includes("/") ? key.split("/").slice(0, -1).join("/") : "";
  const name = key.includes("/") ? key.split("/").pop()! : key;
  const existing = entries.find((e: any) => e.key === key);
  if (existing) {
    Object.assign(existing, data);
  } else {
    entries.push({ key, name, folder, status: "active", ...data });
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(metaPath, JSON.stringify(entries, null, 2));
}

/**
 * POST /api/mobile/media/analyze?orgId=...&siteId=...
 *
 * Trigger AI analysis for a media file directly (no proxy, no cookies).
 * Reads the file from the site's upload dir, runs AI analysis, saves metadata.
 */
export async function POST(req: NextRequest) {
  const session = await getMobileSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!orgId || !siteId) {
    return NextResponse.json({ error: "orgId and siteId required" }, { status: 400 });
  }

  try {
    const body = (await req.json()) as { filename: string; folder?: string };
    if (!body.filename) {
      return NextResponse.json({ error: "filename required" }, { status: 400 });
    }

    const paths = await getSitePathsFor(orgId, siteId);
    if (!paths) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Read the file
    const adapter = new FilesystemMediaAdapter(paths.uploadDir, paths.dataDir);
    const segments = body.folder ? [body.folder, body.filename] : [body.filename];
    const data = await adapter.readFile(segments);
    if (!data) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = Buffer.from(data);
    const ext = body.filename.split(".").pop()?.toLowerCase() ?? "jpeg";
    const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const metaKey = body.folder ? `${body.folder}/${body.filename}` : body.filename;

    // Check site locales for multi-locale analysis
    const siteConfig = await readSiteConfigForSite(orgId, siteId).catch(() => null);
    const siteLocales = siteConfig?.locales?.length ? siteConfig.locales : [];

    const dataDir = paths.dataDir;

    if (siteLocales.length > 1) {
      const { analyzeImageMultiLocale } = await import("@/lib/ai/image-analysis");
      const result = await analyzeImageMultiLocale(buffer, mimeType, siteLocales);
      const firstLocale = siteLocales[0];

      await appendMetaDirect(dataDir, metaKey, {
        aiCaption: result.captions[firstLocale] ?? Object.values(result.captions)[0] ?? "",
        aiAlt: result.alts[firstLocale] ?? Object.values(result.alts)[0] ?? "",
        aiTags: result.tags,
        aiAnalyzedAt: new Date().toISOString(),
        aiCaptions: result.captions,
        aiAlts: result.alts,
      } as any);

      return NextResponse.json({
        caption: result.captions[firstLocale] ?? Object.values(result.captions)[0],
        alt: result.alts[firstLocale] ?? Object.values(result.alts)[0],
        tags: result.tags,
        provider: result.provider,
      });
    } else {
      const { analyzeImage } = await import("@/lib/ai/image-analysis");
      const analysis = await analyzeImage(buffer, mimeType);
      if (!analysis) {
        return NextResponse.json({ error: "Analysis returned no results" }, { status: 500 });
      }

      await appendMetaDirect(dataDir, metaKey, {
        aiCaption: analysis.caption,
        aiAlt: analysis.alt,
        aiTags: analysis.tags,
        aiAnalyzedAt: new Date().toISOString(),
      } as any);

      return NextResponse.json({
        caption: analysis.caption,
        alt: analysis.alt,
        tags: analysis.tags,
        provider: analysis.provider,
      });
    }
  } catch (err) {
    console.error("[mobile/media/analyze] Error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
