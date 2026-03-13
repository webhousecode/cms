import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";

export type LinkResult = {
  docCollection: string;
  docSlug: string;
  docTitle: string;
  field: string;
  url: string;
  text: string;
  type: "internal" | "external";
  status: "ok" | "broken" | "redirect" | "error";
  httpStatus?: number;
  redirectTo?: string;
  error?: string;
};

export type ProgressEvent =
  | { kind: "start"; totalLinks: number }
  | { kind: "result"; result: LinkResult }
  | { kind: "done"; checkedAt: string; total: number; broken: number };

// Extract [text](url) links from markdown — skip images
const LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)\s]+)\)/g;

function extractLinks(markdown: string): Array<{ text: string; url: string }> {
  const found: Array<{ text: string; url: string }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(LINK_RE.source, "g");
  while ((m = re.exec(markdown)) !== null) {
    const url = m[2].trim();
    if (url.startsWith("#")) continue; // anchor-only — skip
    found.push({ text: m[1] || url, url });
  }
  return found;
}

async function checkExternal(url: string): Promise<Pick<LinkResult, "status" | "httpStatus" | "redirectTo" | "error">> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    let finalUrl = url;
    const res = await fetch(url, {
      method: "HEAD",
      signal: ctrl.signal,
      redirect: "manual",
      headers: { "User-Agent": "webhouse-cms-link-checker/1.0" },
    }).catch(() =>
      // Some servers reject HEAD — fall back to GET with small range
      fetch(url, {
        method: "GET",
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "User-Agent": "webhouse-cms-link-checker/1.0", Range: "bytes=0-0" },
      })
    ).finally(() => clearTimeout(timer));

    if (res.status >= 300 && res.status < 400) {
      finalUrl = res.headers.get("location") ?? url;
      return { status: "redirect", httpStatus: res.status, redirectTo: finalUrl };
    }
    if (res.status >= 400) return { status: "broken", httpStatus: res.status };
    return { status: "ok", httpStatus: res.status };
  } catch (err: unknown) {
    const msg = (err as Error).message ?? String(err);
    if (msg.includes("abort")) return { status: "error", error: "Timeout (6s)" };
    return { status: "error", error: msg.slice(0, 120) };
  }
}

/** GET /api/check-links — streams NDJSON (one JSON object per line) */
export async function GET() {
  const encoder = new TextEncoder();

  function line(obj: ProgressEvent): Uint8Array {
    return encoder.encode(JSON.stringify(obj) + "\n");
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

        // Build internal URL map: path → { collection, slug }
        const internalMap = new Map<string, { collection: string; slug: string }>();
        for (const col of config.collections) {
          const { documents } = await cms.content.findMany(col.name, {});
          const prefix = (col.urlPrefix ?? "").replace(/\/$/, "");
          for (const doc of documents) {
            const path = prefix ? `${prefix}/${doc.slug}` : `/${doc.slug}`;
            internalMap.set(path, { collection: col.name, slug: doc.slug });
            // Also without trailing slash
            internalMap.set(path.replace(/\/$/, ""), { collection: col.name, slug: doc.slug });
          }
        }

        // Collect all links across all richtext fields
        type RawLink = { docCollection: string; docSlug: string; docTitle: string; field: string; text: string; url: string };
        const allLinks: RawLink[] = [];

        for (const col of config.collections) {
          const { documents } = await cms.content.findMany(col.name, {});
          const richtextFields = col.fields
            .filter((f) => f.type === "richtext")
            .map((f) => f.name);

          for (const doc of documents) {
            const title = String(doc.data?.title ?? doc.data?.name ?? doc.data?.label ?? doc.slug);
            for (const fieldName of richtextFields) {
              const content = String(doc.data?.[fieldName] ?? "");
              const links = extractLinks(content);
              for (const link of links) {
                allLinks.push({
                  docCollection: col.name,
                  docSlug: doc.slug,
                  docTitle: title,
                  field: fieldName,
                  text: link.text,
                  url: link.url,
                });
              }
            }
          }
        }

        controller.enqueue(line({ kind: "start", totalLinks: allLinks.length }));

        // De-duplicate external URLs to avoid redundant fetches
        const externalCache = new Map<string, Pick<LinkResult, "status" | "httpStatus" | "redirectTo" | "error">>();

        // Process links with concurrency limit of 5
        const CONCURRENCY = 5;
        let broken = 0;
        const queue = [...allLinks];

        async function processOne(raw: RawLink): Promise<void> {
          const isInternal = raw.url.startsWith("/") && !raw.url.startsWith("//");
          let statusFields: Pick<LinkResult, "status" | "httpStatus" | "redirectTo" | "error">;

          if (isInternal) {
            // Normalize: strip query/hash for lookup
            const path = raw.url.split(/[?#]/)[0].replace(/\/$/, "") || "/";
            const found = internalMap.has(path) || internalMap.has(path + "/");
            statusFields = found
              ? { status: "ok" }
              : { status: "broken", error: "No matching document found" };
          } else {
            // External
            if (externalCache.has(raw.url)) {
              statusFields = externalCache.get(raw.url)!;
            } else {
              statusFields = await checkExternal(raw.url);
              externalCache.set(raw.url, statusFields);
            }
          }

          if (statusFields.status === "broken" || statusFields.status === "error") broken++;

          const result: LinkResult = {
            ...raw,
            type: isInternal ? "internal" : "external",
            ...statusFields,
          };
          controller.enqueue(line({ kind: "result", result }));
        }

        // Process in batches of CONCURRENCY
        while (queue.length > 0) {
          const batch = queue.splice(0, CONCURRENCY);
          await Promise.all(batch.map(processOne));
        }

        controller.enqueue(line({ kind: "done", checkedAt: new Date().toISOString(), total: allLinks.length, broken }));
      } catch (err) {
        console.error("[check-links]", err);
        controller.enqueue(encoder.encode(JSON.stringify({ kind: "error", error: String(err) }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
