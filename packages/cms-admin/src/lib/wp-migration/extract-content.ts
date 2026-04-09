/**
 * F03 — WordPress Content Extraction.
 *
 * Paginates the WP REST API to extract all posts, pages, and custom post types.
 * Downloads media files to uploads/, rewrites URLs in content.
 * Transforms Gutenberg blocks to clean HTML.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { WpProbeResult } from "./probe";

export interface WpDocument {
  type: string;
  slug: string;
  title: string;
  content: string;
  excerpt?: string;
  date: string;
  modified: string;
  status: "publish" | "draft" | "private";
  categories?: string[];
  tags?: string[];
  featuredImageUrl?: string;
  featuredImageLocal?: string;
  wpUrl: string;
}

export interface ExtractionProgress {
  phase: string;
  current: number;
  total: number;
  currentItem?: string;
}

/**
 * Extract all content from a WordPress site via REST API.
 * Calls onProgress for each item.
 */
export async function extractAllContent(
  probe: WpProbeResult,
  uploadDir: string,
  onProgress?: (p: ExtractionProgress) => void,
): Promise<{
  documents: WpDocument[];
  redirectMap: Array<{ from: string; to: string }>;
  mediaDownloaded: number;
}> {
  if (!probe.restApiAvailable) {
    throw new Error("REST API not available — cannot extract content");
  }

  const api = probe.restApiUrl;
  const documents: WpDocument[] = [];
  const redirectMap: Array<{ from: string; to: string }> = [];
  const mediaUrlMap = new Map<string, string>(); // WP URL → local path
  let mediaDownloaded = 0;

  // Fetch category + tag names for mapping
  const categoryMap = await fetchTaxonomyMap(`${api}/categories`);
  const tagMap = await fetchTaxonomyMap(`${api}/tags`);

  // ── Posts ──
  const posts = await paginateWpApi(`${api}/posts`);
  onProgress?.({ phase: "posts", current: 0, total: posts.length });
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const doc = wpItemToDocument(p, "post", categoryMap, tagMap, probe.url);
    documents.push(doc);
    redirectMap.push({ from: getWpPermalink(p), to: `/posts/${doc.slug}` });
    onProgress?.({ phase: "posts", current: i + 1, total: posts.length, currentItem: doc.title });
  }

  // ── Pages ──
  const pages = await paginateWpApi(`${api}/pages`);
  onProgress?.({ phase: "pages", current: 0, total: pages.length });
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const doc = wpItemToDocument(p, "page", categoryMap, tagMap, probe.url);
    documents.push(doc);
    redirectMap.push({ from: getWpPermalink(p), to: `/pages/${doc.slug}` });
    onProgress?.({ phase: "pages", current: i + 1, total: pages.length, currentItem: doc.title });
  }

  // ── Custom Post Types ──
  for (const cpt of probe.contentCounts.customPostTypes) {
    const restBase = cpt.slug;
    const items = await paginateWpApi(`${api}/${restBase}`);
    const colName = slugify(cpt.name);
    onProgress?.({ phase: colName, current: 0, total: items.length });
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      const doc = wpItemToDocument(p, cpt.slug, categoryMap, tagMap, probe.url);
      documents.push(doc);
      redirectMap.push({ from: getWpPermalink(p), to: `/${colName}/${doc.slug}` });
      onProgress?.({ phase: colName, current: i + 1, total: items.length, currentItem: doc.title });
    }
  }

  // ── Media download ──
  mkdirSync(uploadDir, { recursive: true });
  const mediaItems = await paginateWpApi(`${api}/media`);
  onProgress?.({ phase: "media", current: 0, total: mediaItems.length });

  for (let i = 0; i < mediaItems.length; i++) {
    const m = mediaItems[i];
    const sourceUrl = m.source_url ?? m.guid?.rendered;
    if (!sourceUrl) continue;

    try {
      const ext = path.extname(new URL(sourceUrl).pathname) || ".jpg";
      const localName = `${slugify(m.slug ?? `media-${i}`)}${ext}`;
      const localPath = path.join(uploadDir, localName);

      if (!existsSync(localPath)) {
        const res = await fetch(sourceUrl);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          writeFileSync(localPath, buf);
          mediaDownloaded++;
        }
      }
      mediaUrlMap.set(sourceUrl, `/uploads/${localName}`);
    } catch { /* skip failed downloads */ }
    onProgress?.({ phase: "media", current: i + 1, total: mediaItems.length, currentItem: sourceUrl.split("/").pop() });
  }

  // ── Rewrite media URLs in content ──
  for (const doc of documents) {
    doc.content = rewriteMediaUrls(doc.content, mediaUrlMap, probe.url);

    // Resolve featured image
    if (doc.featuredImageUrl) {
      doc.featuredImageLocal = mediaUrlMap.get(doc.featuredImageUrl) ?? doc.featuredImageUrl;
    }
  }

  return { documents, redirectMap, mediaDownloaded };
}

// ── REST API Paginator ──

async function paginateWpApi(endpoint: string, auth?: string): Promise<any[]> {
  const all: any[] = [];
  let page = 1;

  while (true) {
    try {
      const res = await fetch(`${endpoint}?per_page=100&page=${page}&_embed=1`, {
        headers: {
          "User-Agent": "webhouse.app-cms/1.0 (WordPress Migration)",
          ...(auth ? { Authorization: `Basic ${btoa(auth)}` } : {}),
        },
      });
      if (!res.ok) break;
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) break;
      all.push(...items);

      const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1");
      if (page >= totalPages) break;
      page++;
    } catch {
      break;
    }
  }

  return all;
}

// ── WP Item → Document ──

function wpItemToDocument(
  item: any,
  type: string,
  categoryMap: Map<number, string>,
  tagMap: Map<number, string>,
  siteUrl: string,
): WpDocument {
  const title = decodeHtmlEntities(item.title?.rendered ?? item.title ?? "Untitled");
  const slug = item.slug ?? slugify(title);
  const content = item.content?.rendered ?? "";
  const excerpt = item.excerpt?.rendered
    ? decodeHtmlEntities(stripHtml(item.excerpt.rendered).trim())
    : undefined;

  // Featured image from _embedded
  let featuredImageUrl: string | undefined;
  if (item._embedded?.["wp:featuredmedia"]?.[0]?.source_url) {
    featuredImageUrl = item._embedded["wp:featuredmedia"][0].source_url;
  }

  return {
    type,
    slug,
    title,
    content,
    excerpt,
    date: item.date ?? new Date().toISOString(),
    modified: item.modified ?? item.date ?? new Date().toISOString(),
    status: item.status === "publish" ? "publish" : "draft",
    categories: (item.categories ?? []).map((id: number) => categoryMap.get(id)).filter(Boolean) as string[],
    tags: (item.tags ?? []).map((id: number) => tagMap.get(id)).filter(Boolean) as string[],
    featuredImageUrl,
    wpUrl: item.link ?? `${siteUrl}/${slug}/`,
  };
}

// ── Taxonomy Map ──

async function fetchTaxonomyMap(endpoint: string): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const items = await paginateWpApi(endpoint);
    for (const item of items) {
      if (item.id && item.name) {
        map.set(item.id, decodeHtmlEntities(item.name));
      }
    }
  } catch { /* taxonomy fetch failed */ }
  return map;
}

// ── URL rewriting ──

function rewriteMediaUrls(html: string, urlMap: Map<string, string>, siteUrl: string): string {
  let result = html;
  for (const [wpUrl, localPath] of urlMap) {
    result = result.split(wpUrl).join(localPath);
  }
  // Also catch relative wp-content paths
  const wpContentPattern = new RegExp(`${escapeRegex(siteUrl)}/wp-content/uploads/[^"'\\s]+`, "g");
  result = result.replace(wpContentPattern, (match) => {
    return urlMap.get(match) ?? match;
  });
  return result;
}

// ── Helpers ──

function getWpPermalink(item: any): string {
  if (item.link) {
    try {
      return new URL(item.link).pathname;
    } catch { /* fall through */ }
  }
  return `/${item.slug}/`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[æ]/g, "ae").replace(/[ø]/g, "oe").replace(/[å]/g, "aa").replace(/[ü]/g, "u")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&nbsp;/g, " ");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
