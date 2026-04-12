import { NextRequest, NextResponse } from "next/server";
import os from "os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { getMobileSession } from "@/lib/mobile-auth";
import { getSitePathsFor } from "@/lib/site-paths";
import { readSiteConfigForSite } from "@/lib/site-config";
import { FilesystemMediaAdapter } from "@/lib/media/filesystem";
import { generateVariants, isProcessableImage, extractExif } from "@/lib/media/image-processor";

/** Write media-meta.json directly (no cookies needed) */
async function appendMetaDirect(dataDir: string, key: string, data: Record<string, unknown>) {
  const metaPath = join(dataDir, "media-meta.json");
  let entries: any[] = [];
  try { entries = JSON.parse(await readFile(metaPath, "utf-8")); } catch { /* new file */ }
  const folder = key.includes("/") ? key.split("/").slice(0, -1).join("/") : "";
  const name = key.includes("/") ? key.split("/").pop()! : key;
  const existing = entries.find((e: any) => e.key === key);
  if (existing) { Object.assign(existing, data); }
  else { entries.push({ key, name, folder, status: "active", ...data }); }
  await mkdir(dataDir, { recursive: true });
  await writeFile(metaPath, JSON.stringify(entries, null, 2));
}

function findLanHost(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

/**
 * POST /api/mobile/upload?orgId=...&siteId=...
 *
 * Mobile image upload — accepts multipart FormData with a `file` field.
 * Returns { url, name } on success.
 *
 * Uses explicit orgId/siteId (no cookies needed).
 * Currently only supports filesystem adapter sites.
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

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  try {
    const paths = await getSitePathsFor(orgId, siteId);
    if (!paths) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Sanitize filename, add short hash to avoid collisions
    const hash = Math.random().toString(36).slice(2, 6);
    const originalName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
    const dotIdx = originalName.lastIndexOf(".");
    const filename = dotIdx > 0
      ? `${originalName.slice(0, dotIdx)}-${hash}${originalName.slice(dotIdx)}`
      : `${originalName}-${hash}`;

    const adapter = new FilesystemMediaAdapter(paths.uploadDir, paths.dataDir);
    const result = await adapter.uploadFile(filename, buffer);

    // Post-processing: WebP variants + EXIF + AI analysis (same as desktop upload)
    if (isProcessableImage(filename)) {
      const siteConfig = await readSiteConfigForSite(orgId, siteId).catch(() => null);
      const uploadDir = paths.uploadDir;
      const metaKey = filename;

      // WebP variants (fire-and-forget)
      if (siteConfig?.mediaAutoOptimize !== false) {
        const variantConfigs = (siteConfig?.mediaVariantWidths ?? [400, 800, 1200, 1600]).map(
          (w: number) => ({ suffix: `${w}w`, width: w }),
        );
        generateVariants(buffer, filename, variantConfigs, siteConfig?.mediaWebpQuality ?? 80)
          .then(async (variants) => {
            for (const v of variants) {
              await writeFile(join(uploadDir, v.filename), v.buffer);
            }
            if (variants.length > 0) console.log(`[mobile/upload] Generated ${variants.length} WebP variants for ${filename}`);
          })
          .catch((err) => console.error("[mobile/upload] Variant generation failed:", err));
      }

      // EXIF extraction (fire-and-forget)
      extractExif(buffer)
        .then(async (exif) => {
          if (exif) {
            await appendMetaDirect(paths.dataDir, metaKey, { exif });
          }
        })
        .catch(() => {});

      // AI analysis — caption, alt-text, tags (fire-and-forget)
      try {
        const ext = filename.split(".").pop()?.toLowerCase() ?? "jpeg";
        const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        const siteLocales = siteConfig?.locales?.length ? siteConfig.locales : [];

        if (siteLocales.length > 1) {
          import("@/lib/ai/image-analysis").then(({ analyzeImageMultiLocale }) => {
            analyzeImageMultiLocale(buffer, mimeType, siteLocales).then(async (r) => {
              const firstLocale = siteLocales[0];
              await appendMetaDirect(paths.dataDir, metaKey, {
                aiCaption: r.captions[firstLocale] ?? Object.values(r.captions)[0] ?? "",
                aiAlt: r.alts[firstLocale] ?? Object.values(r.alts)[0] ?? "",
                aiTags: r.tags,
                aiAnalyzedAt: new Date().toISOString(),
                aiCaptions: r.captions,
                aiAlts: r.alts,
              } as any);
              console.log(`[mobile/upload] AI analyzed ${filename} (${siteLocales.join("+")})`);
            }).catch((err) => console.error(`[mobile/upload] AI multi-locale failed:`, err));
          });
        } else {
          import("@/lib/ai/image-analysis").then(({ analyzeImage }) => {
            analyzeImage(buffer, mimeType).then(async (analysis) => {
              if (analysis) {
                await appendMetaDirect(paths.dataDir, metaKey, {
                  aiCaption: analysis.caption,
                  aiAlt: analysis.alt,
                  aiTags: analysis.tags,
                  aiAnalyzedAt: new Date().toISOString(),
                });
                console.log(`[mobile/upload] AI analyzed ${filename}: "${analysis.alt}"`);
              }
            }).catch((err) => console.error(`[mobile/upload] AI analysis failed:`, err));
          });
        }
      } catch (aiErr) {
        console.error("[mobile/upload] AI setup failed:", aiErr);
      }
    }

    // result.url is relative ("/uploads/photo.jpg") — mobile needs absolute URL
    // so the phone can load it from the CMS server via LAN IP
    let baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(baseUrl)) {
      const lan = process.env.CMS_LAN_HOST || findLanHost();
      if (lan) baseUrl = baseUrl.replace(/localhost|127\.0\.0\.1|0\.0\.0\.0/, lan);
    }
    const absoluteUrl = result.url.startsWith("http") ? result.url : `${baseUrl}${result.url}`;

    return NextResponse.json({
      url: absoluteUrl,
      name: filename,
    });
  } catch (err) {
    console.error("[mobile/upload] Error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
