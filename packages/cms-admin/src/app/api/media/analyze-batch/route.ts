import { NextRequest } from "next/server";
import { analyzeImage } from "@/lib/ai/image-analysis";
import { getMediaAdapter } from "@/lib/media";
import { getActiveSitePaths } from "@/lib/site-paths";
import fs from "fs/promises";
import path from "path";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif",
};
const DELAY_MS = 2000;

type StartEvent = { kind: "start"; total: number; skipped: number };
type ResultEvent = { kind: "result"; filename: string; caption: string; alt: string; tags: string[]; provider: string };
type ErrorEvent = { kind: "error"; filename: string; error: string };
type DoneEvent = { kind: "done"; analyzed: number; failed: number };
export type BatchEvent = StartEvent | ResultEvent | ErrorEvent | DoneEvent;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const language = body.language ?? "da";

  const adapter = await getMediaAdapter();
  const allFiles = await adapter.listMedia();

  // Only raster images
  const images = allFiles.filter((f) => {
    const ext = f.name.toLowerCase().split(".").pop() ?? "";
    return f.isImage && IMAGE_EXTS.has(ext);
  });

  // Load existing media-meta to find already-analyzed
  const { dataDir } = await getActiveSitePaths();
  const metaPath = path.join(dataDir, "media-meta.json");
  let meta: Array<Record<string, unknown>> = [];
  try { meta = JSON.parse(await fs.readFile(metaPath, "utf-8")); } catch { /* empty */ }

  const analyzedKeys = new Set(
    meta.filter((m) => m.aiAnalyzedAt).map((m) => m.key as string),
  );

  const toAnalyze = images.filter((f) => {
    const key = f.folder ? `${f.folder}/${f.name}` : f.name;
    return !analyzedKeys.has(key);
  });

  const skipped = images.length - toAnalyze.length;

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(evt: BatchEvent) {
        controller.enqueue(encoder.encode(JSON.stringify(evt) + "\n"));
      }

      send({ kind: "start", total: toAnalyze.length, skipped });

      let analyzed = 0;
      let failed = 0;

      for (let i = 0; i < toAnalyze.length; i++) {
        if (cancelled) break;

        const file = toAnalyze[i];
        const ext = file.name.toLowerCase().split(".").pop() ?? "";
        const mimeType = MIME_MAP[ext] ?? "image/jpeg";
        const key = file.folder ? `${file.folder}/${file.name}` : file.name;

        try {
          const segments = file.folder ? [file.folder, file.name] : [file.name];
          const buffer = await adapter.readFile(segments);
          if (!buffer) {
            send({ kind: "error", filename: key, error: "File not found" });
            failed++;
            continue;
          }

          const result = await analyzeImage(buffer, mimeType, language);

          // Save to media-meta.json
          const aiFields = {
            aiCaption: result.caption,
            aiAlt: result.alt,
            aiTags: result.tags,
            aiAnalyzedAt: new Date().toISOString(),
            aiProvider: result.provider ?? "unknown",
          };

          // Re-read meta for each save to avoid race conditions
          let currentMeta: Array<Record<string, unknown>> = [];
          try { currentMeta = JSON.parse(await fs.readFile(metaPath, "utf-8")); } catch { /* empty */ }
          const idx = currentMeta.findIndex((m) => m.key === key);
          if (idx >= 0) {
            currentMeta[idx] = { ...currentMeta[idx], ...aiFields };
          } else {
            currentMeta.push({ key, name: file.name, folder: file.folder, status: "active", ...aiFields });
          }
          await fs.mkdir(path.dirname(metaPath), { recursive: true });
          await fs.writeFile(metaPath, JSON.stringify(currentMeta, null, 2), "utf-8");

          send({ kind: "result", filename: key, caption: result.caption, alt: result.alt, tags: result.tags, provider: result.provider });
          analyzed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          send({ kind: "error", filename: key, error: msg.slice(0, 200) });
          failed++;
        }

        // Rate-limit delay (skip after last item)
        if (i < toAnalyze.length - 1 && !cancelled) {
          await new Promise((r) => setTimeout(r, DELAY_MS));
        }
      }

      send({ kind: "done", analyzed, failed });
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
