import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { getUploadDir } from "@/lib/upload-dir";
import fs from "fs/promises";
import path from "path";

export type LinkResult = {
  docCollection: string;
  docSlug: string;
  docTitle: string;
  field: string;
  url: string;
  text: string;
  kind: "link" | "image";
  type: "internal" | "external";
  status: "ok" | "broken" | "redirect" | "error";
  httpStatus?: number;
  redirectTo?: string;
  error?: string;
};

export interface LinkCheckResult {
  checkedAt: string;
  total: number;
  broken: number;
  results: LinkResult[];
}

function extractLinks(markdown: string): Array<{ text: string; url: string }> {
  const found: Array<{ text: string; url: string }> = [];
  const re = /(?<!!)\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const url = m[2].trim();
    if (!url.startsWith("#")) found.push({ text: m[1] || url, url });
  }
  return found;
}

/** Extract markdown images: ![alt](url) */
function extractMarkdownImages(markdown: string): Array<{ text: string; url: string }> {
  const found: Array<{ text: string; url: string }> = [];
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const url = m[2].trim();
    if (url) found.push({ text: m[1] || url, url });
  }
  return found;
}

/** Extract HTML img tags: <img src="..."> (TipTap richtext stores images as HTML) */
function extractHtmlImages(html: string): Array<{ text: string; url: string }> {
  const found: Array<{ text: string; url: string }> = [];
  const re = /<img\s[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1].trim();
    if (url) {
      // Try to extract alt text
      const altMatch = m[0].match(/alt=["']([^"']*)["']/i);
      found.push({ text: altMatch?.[1] || url, url });
    }
  }
  return found;
}

async function checkExternal(url: string): Promise<Pick<LinkResult, "status" | "httpStatus" | "redirectTo" | "error">> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      method: "HEAD",
      signal: ctrl.signal,
      redirect: "manual",
      headers: { "User-Agent": "webhouse-cms-link-checker/1.0" },
    }).catch(() =>
      fetch(url, {
        method: "GET",
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "User-Agent": "webhouse-cms-link-checker/1.0", Range: "bytes=0-0" },
      })
    ).finally(() => clearTimeout(timer));

    if (res.status >= 300 && res.status < 400)
      return { status: "redirect", httpStatus: res.status, redirectTo: res.headers.get("location") ?? url };
    if (res.status >= 400) return { status: "broken", httpStatus: res.status };
    return { status: "ok", httpStatus: res.status };
  } catch (err: unknown) {
    const msg = (err as Error).message ?? String(err);
    return { status: "error", error: msg.includes("abort") ? "Timeout (6s)" : msg.slice(0, 120) };
  }
}

/** Core link-check logic. Callbacks drive streaming in the API route. */
export async function runLinkCheck(
  onStart?: (total: number) => void,
  onResult?: (r: LinkResult) => void,
): Promise<LinkCheckResult> {
  const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

  // Build internal URL map
  const internalMap = new Map<string, true>();
  for (const col of config.collections) {
    const { documents } = await cms.content.findMany(col.name, {});
    const prefix = (col.urlPrefix ?? "").replace(/\/$/, "");
    for (const doc of documents) {
      const p = prefix ? `${prefix}/${doc.slug}` : `/${doc.slug}`;
      internalMap.set(p, true);
      internalMap.set(p.replace(/\/$/, ""), true);
    }
  }

  // Resolve upload dir for internal image checks
  let uploadDir: string;
  try {
    uploadDir = await getUploadDir();
  } catch {
    uploadDir = "";
  }

  // Collect all links AND images across richtext + image fields
  type RawLink = { docCollection: string; docSlug: string; docTitle: string; field: string; text: string; url: string; kind: "link" | "image" };
  const allLinks: RawLink[] = [];
  for (const col of config.collections) {
    const { documents } = await cms.content.findMany(col.name, {});
    const richtextFields = col.fields.filter((f) => f.type === "richtext").map((f) => f.name);
    const imageFields = col.fields.filter((f) => f.type === "image").map((f) => f.name);
    for (const doc of documents) {
      const title = String(doc.data?.title ?? doc.data?.name ?? doc.data?.label ?? doc.slug);

      // Links from richtext
      for (const fieldName of richtextFields) {
        const content = String(doc.data?.[fieldName] ?? "");
        for (const link of extractLinks(content)) {
          allLinks.push({ docCollection: col.name, docSlug: doc.slug, docTitle: title, field: fieldName, kind: "link", ...link });
        }
        // Images from richtext — both markdown ![alt](url) and HTML <img src="...">
        for (const img of extractMarkdownImages(content)) {
          allLinks.push({ docCollection: col.name, docSlug: doc.slug, docTitle: title, field: fieldName, kind: "image", ...img });
        }
        for (const img of extractHtmlImages(content)) {
          allLinks.push({ docCollection: col.name, docSlug: doc.slug, docTitle: title, field: fieldName, kind: "image", ...img });
        }
      }

      // Images from image fields (type: "image")
      for (const fieldName of imageFields) {
        const val = doc.data?.[fieldName];
        if (typeof val === "string" && val.trim()) {
          allLinks.push({ docCollection: col.name, docSlug: doc.slug, docTitle: title, field: fieldName, kind: "image", text: fieldName, url: val.trim() });
        }
      }
    }
  }

  onStart?.(allLinks.length);

  const externalCache = new Map<string, Pick<LinkResult, "status" | "httpStatus" | "redirectTo" | "error">>();
  const results: LinkResult[] = [];
  let broken = 0;

  async function processOne(raw: RawLink): Promise<void> {
    const isInternal = raw.url.startsWith("/") && !raw.url.startsWith("//");
    let statusFields: Pick<LinkResult, "status" | "httpStatus" | "redirectTo" | "error">;

    if (isInternal) {
      if (raw.kind === "image") {
        // Internal image: check if file exists on disk
        // Images are typically /uploads/filename.jpg or /api/uploads/filename.jpg
        const urlPath = raw.url.split(/[?#]/)[0];
        const uploadPath = urlPath.replace(/^\/(api\/)?uploads\//, "");
        if (uploadDir && uploadPath !== urlPath) {
          const filePath = path.join(uploadDir, uploadPath);
          try {
            await fs.access(filePath);
            statusFields = { status: "ok" };
          } catch {
            statusFields = { status: "broken", error: "Image file not found on disk" };
          }
        } else {
          // Unknown internal path format — skip (can't verify)
          statusFields = { status: "ok" };
        }
      } else {
        // Internal link: check against document map
        const p = raw.url.split(/[?#]/)[0].replace(/\/$/, "") || "/";
        statusFields = (internalMap.has(p) || internalMap.has(p + "/"))
          ? { status: "ok" }
          : { status: "broken", error: "No matching document found" };
      }
    } else {
      // External link or image: HTTP HEAD check
      if (!externalCache.has(raw.url)) externalCache.set(raw.url, await checkExternal(raw.url));
      statusFields = externalCache.get(raw.url)!;
    }

    if (statusFields.status === "broken" || statusFields.status === "error") broken++;
    const result: LinkResult = { ...raw, type: isInternal ? "internal" : "external", ...statusFields };
    results.push(result);
    onResult?.(result);
  }

  const CONCURRENCY = 5;
  const queue = [...allLinks];
  while (queue.length > 0) {
    await Promise.all(queue.splice(0, CONCURRENCY).map(processOne));
  }

  return { checkedAt: new Date().toISOString(), total: allLinks.length, broken, results };
}
