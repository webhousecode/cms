import { isDangerousUrl, isSchemeless } from "@broberg/cms-inline-edit";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { readSiteConfig } from "@/lib/site-config";
import { classifyByShape, normalisePath, sitemapPathsFromXml } from "@/lib/link-check-classify";
import { probeUrl } from "@/lib/link-check-probe";
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
  type: "internal" | "external" | "other";
  /**
   * `skipped`     — nothing to fetch (mailto:, tel:, …). NOT a fault.
   * `schemeless`  — no scheme and no leading "/", so a browser reads it as a
   *                 page on THIS site. Valid markup, dead destination.
   * `unverified`  — a link we could not check: no path list, no public URL, or
   *                 the site did not answer. Deliberately neither `ok` nor
   *                 `broken` — a check that could not look must report neither
   *                 a clean result nor a death sentence.
   * `dangerous`   — javascript:/data:/vbscript:. Not a link; a script.
   */
  status: "ok" | "broken" | "redirect" | "error" | "skipped" | "schemeless" | "unverified" | "dangerous";
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
    const text = m[1];
    if (url.startsWith("#")) continue;
    // Skip image-links: [![alt](img)](url) — extractLinks captures the outer link
    // with text starting with "![" and url pointing to the image, not the link target
    if (text.startsWith("![")) continue;
    found.push({ text: text || url, url });
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

/** Extract the outer link URL from linked-images: [![alt](img)](linkUrl) */
function extractLinkedImageLinks(markdown: string): Array<{ text: string; url: string }> {
  const found: Array<{ text: string; url: string }> = [];
  const re = /\[!\[[^\]]*\]\([^)]+\)\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const url = m[1].trim();
    if (url && !url.startsWith("#")) found.push({ text: "linked image", url });
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

  // The site's OWN list of paths. internalMap above is DERIVED from CMS
  // documents, so it cannot contain a static route — and a page it has never
  // heard of gets reported dead. Measured on sanneandersen: /da/privatliv,
  // /en/privatliv, /da/handelsbetingelser, /en/handelsbetingelser all answer
  // 200 and /da/min-konto, /en/min-konto answer 307, and all six were reported
  // "No matching document found". Same class as that site's own F054.1, where
  // a derived list shipped 47 of 130 pages: a derived list is not partly
  // wrong, it is incomplete, and nothing on it says by how much.
  //
  // F164.5 already settled the answer for the link picker — ask the sitemap.
  let sitemapPaths: Set<string> | null = null;
  let sitemapNote = "";
  let publicBase = "";
  try {
    const siteConfig = await readSiteConfig();
    // Production FIRST. previewSiteUrl is the preview target and is often a
    // staging or localhost origin — checking against it either fails to
    // connect (and condemns every internal link) or reports on a site the
    // editor is not publishing. For a link check the live site is the
    // authority; preview is the fallback when there is no production URL.
    const base = (siteConfig.deployProductionUrl || siteConfig.previewSiteUrl || "").trim();
    if (/^https?:\/\//i.test(base)) publicBase = base.replace(/\/$/, "");
    if (publicBase) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${publicBase}/sitemap.xml`, {
        signal: ctrl.signal,
        headers: { "User-Agent": "webhouse-cms-link-checker/1.0" },
      }).finally(() => clearTimeout(t));
      if (res.ok) {
        sitemapPaths = sitemapPathsFromXml(await res.text());
        if (!sitemapPaths) sitemapNote = "sitemap.xml indeholdt ingen adresser";
      } else {
        sitemapNote = `sitemap.xml svarede ${res.status}`;
      }
    } else {
      sitemapNote = "sitet har ingen offentlig adresse i indstillingerne";
    }
  } catch (err) {
    sitemapNote = (err as Error).message?.slice(0, 80) ?? "sitemap.xml kunne ikke hentes";
  }
  if (!sitemapPaths) {
    // LOUD. Reporting these as ok would be the failure this whole card is
    // about, one level deeper: a check that could not look, reporting clean.
    console.warn(`[check-links] sitemap utilgængeligt (${sitemapNote}) — interne links markeres som IKKE verificeret`);
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
        // Outer links from linked-images: [![alt](img)](url)
        for (const link of extractLinkedImageLinks(content)) {
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

  /** One place that records a result, so the early exits and the main path
   *  cannot drift on what counts as a fault. */
  function push(raw: RawLink, type: LinkResult["type"], fields: Pick<LinkResult, "status" | "httpStatus" | "redirectTo" | "error">): void {
    // `skipped`, `schemeless` and `unverified` are NOT faults for the counter:
    // schemeless gets its own list in the UI, and a link we could not check
    // must not be counted as broken any more than as ok.
    // `dangerous` IS one — and it has to be counted in the SAME place the UI
    // counts it, or the number the API streams and the number on screen are
    // two different claims about one run.
    if (fields.status === "broken" || fields.status === "error" || fields.status === "dangerous") broken++;
    const result: LinkResult = { ...raw, type, ...fields };
    results.push(result);
    onResult?.(result);
  }

  async function processOne(raw: RawLink): Promise<void> {
    const url = raw.url.trim();

    // Everything settled by the address's SHAPE — no network, no path list.
    // Extracted to link-check-classify.ts because this is the part that keeps
    // regressing and the runner cannot be unit-tested (it imports the CMS), so
    // a rule left in here is a rule nothing can go red on.
    const byShape = classifyByShape(raw.kind, url, { isSchemeless, isDangerousUrl });
    if (byShape) {
      push(raw, "other", byShape);
      return;
    }

    const isInternal = url.startsWith("/") && !url.startsWith("//");
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
        const p = normalisePath(url);
        // The site's own list first — it is the only one that knows about
        // static routes. The document map is a fallback that can only ever
        // say "yes"; it is never trusted to say "no" on its own.
        if (sitemapPaths?.has(p) || internalMap.has(p) || internalMap.has(p + "/")) {
          statusFields = { status: "ok" };
        } else if (publicBase) {
          // The sitemap is a FAST PATH, not the authority — the site is. A
          // login-gated page is correctly absent from a sitemap and still
          // exists: /da/min-konto answers 307 and was a false alarm after the
          // sitemap fix. So an internal path in neither list gets the same
          // courtesy an external one already got: ask, then decide.
          //
          // NOT gated on having a sitemap. Requiring one meant a site that
          // simply does not serve sitemap.xml reported every non-document link
          // "unverified" forever — while the authority was reachable the whole
          // time.
          const probeUrlStr = `${publicBase}${p}`;
          if (!externalCache.has(probeUrlStr)) externalCache.set(probeUrlStr, await probeUrl(probeUrlStr));
          const probe = externalCache.get(probeUrlStr)!;
          if (probe.status === "ok" || probe.status === "redirect") {
            statusFields = { status: "ok", httpStatus: probe.httpStatus };
          } else if (probe.status === "error") {
            // The probe could not look. Calling that "broken" is this card's
            // own thesis inverted — a definitive dead verdict from a check that
            // never got an answer. A slow site, a rate-limit or no egress from
            // the container would otherwise condemn every such link.
            statusFields = {
              status: "unverified",
              error: `Ikke verificeret — sitet svarede ikke (${probe.error ?? "ukendt"}). Linket kan sagtens virke.`,
            };
          } else {
            statusFields = { status: "broken", httpStatus: probe.httpStatus, error: "Findes hverken i sitemap, som dokument, eller som en side sitet svarer på" };
          }
        } else {
          // NOT `(${sitemapNote})` here: in this branch the note IS "sitet har
          // ingen offentlig adresse i indstillingerne", so the editor read the
          // same sentence twice inside one line.
          statusFields = {
            status: "unverified",
            error: "Ikke verificeret — sitet har ingen offentlig adresse i indstillingerne, så der er ikke noget at spørge. Linket kan sagtens virke.",
          };
        }
      }
    } else {
      // External link or image: HTTP HEAD check
      if (!externalCache.has(url)) externalCache.set(url, await probeUrl(url));
      statusFields = externalCache.get(url)!;
    }

    push(raw, isInternal ? "internal" : "external", statusFields);
  }

  const CONCURRENCY = 5;
  const queue = [...allLinks];
  while (queue.length > 0) {
    await Promise.all(queue.splice(0, CONCURRENCY).map(processOne));
  }

  return { checkedAt: new Date().toISOString(), total: allLinks.length, broken, results };
}
