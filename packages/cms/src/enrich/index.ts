/**
 * F89 — Post-Build Enrichment
 *
 * Runs after build.ts but before push to GitHub Pages.
 * Injects SEO metadata, OG tags, JSON-LD, and generates
 * robots.txt, sitemap.xml, llms.txt, manifest.json, ai-plugin.json.
 *
 * Operates on deploy/ directory (NOT dist/).
 * Never overwrites existing tags — only injects if missing.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { extractContent } from "../build/llms";

// ── Config ──────────────────────────────────────────────────

export interface EnrichmentConfig {
  /** Full base URL, e.g. "https://boutique.webhouse.app" */
  baseUrl: string;
  /** URL path prefix, e.g. "" or "/boutique-site" */
  basePath: string;
  /** Site name from globals/site.json */
  siteName: string;
  /** Site description / tagline */
  siteDescription: string;
  /** Default OG image URL or path */
  siteImage?: string;
  /** Theme color for manifest + meta */
  themeColor?: string;
  /** Language code, default "en" */
  lang?: string;
  /**
   * F206.5 — pages the site builds itself that are not CMS documents (e.g.
   * /demo/), listed in llms.txt under `section` (default "Pages") and added
   * to sitemap.xml when the dist does not already contain them.
   */
  extraPages?: Array<{ path: string; title: string; description: string; section?: string }>;
}

/** F97 _seo fields — optional per-document SEO overrides */
interface SeoOverrides {
  metaTitle?: string;
  metaDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
  robots?: string;
  jsonLd?: Record<string, unknown>;
}

interface PageInfo {
  /** Relative path from distDir, e.g. "blog/my-post/index.html" */
  relativePath: string;
  /** Full filesystem path */
  fullPath: string;
  /** URL path, e.g. "/blog/my-post/" */
  urlPath: string;
  /** Page title extracted from <title> */
  title: string;
  /** Meta description if present */
  description: string;
  /** First <img> src on page */
  firstImage: string;
  /** Page type inferred from path */
  pageType: "homepage" | "article" | "page";
  /** F97 _seo overrides from content JSON (when available) */
  seo: SeoOverrides;
  /** Canonical the page itself declared BEFORE enrichment, if any */
  declaredCanonical?: string | undefined;
  /** The CMS document behind this page, when one was found */
  entry?: ContentEntry | undefined;
}

// ── Main entry ──────────────────────────────────────────────

export async function enrichDist(distDir: string, contentDir: string, config: EnrichmentConfig): Promise<void> {
  if (!existsSync(distDir)) return;

  const lang = config.lang ?? "en";
  const htmlFiles = collectHtmlFiles(distDir, distDir);

  if (htmlFiles.length === 0) return;

  console.log(`[enrich] Processing ${htmlFiles.length} HTML files...`);

  // Build content index from content/ JSON files for per-page descriptions
  const contentIndex = buildContentIndex(contentDir);

  // Parse all pages for sitemap/llms.txt generation
  const pages: PageInfo[] = [];

  for (const file of htmlFiles) {
    let html = readFileSync(file.fullPath, "utf-8");

    const info = extractPageInfo(file.relativePath, html, config, contentIndex);
    pages.push(info);

    // Inject head tags
    html = injectHeadTags(html, info, config, lang);

    // Inject JSON-LD before </body>
    html = injectJsonLd(html, info, config);

    // F44: Upgrade <img> to <picture> with WebP srcset when variants exist
    const uploadsDir = path.join(distDir, "uploads");
    if (existsSync(uploadsDir)) {
      html = upgradeImagesInHtml(html, uploadsDir);
    }

    writeFileSync(file.fullPath, html);
  }

  // Copy favicon from project root if available (and not already in dist)
  copyFavicon(distDir, contentDir, config);

  // Generate auxiliary files
  generateRobotsTxt(distDir, config);
  const listed = listablePages(pages, config);
  generateSitemapXml(distDir, listed, config);
  const hasFull = generateLlmsFullTxt(distDir, listed, config);
  generateLlmsTxt(distDir, listed, config, hasFull);
  generateManifestJson(distDir, config);
  generateAiPluginJson(distDir, config);
  generateJekyllConfig(distDir);

  console.log(`[enrich] Done — ${htmlFiles.length} pages enriched, aux files generated`);
}

// ── HTML file collection ────────────────────────────────────

function collectHtmlFiles(dir: string, baseDir: string): { fullPath: string; relativePath: string }[] {
  const results: { fullPath: string; relativePath: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectHtmlFiles(full, baseDir));
    } else if (entry.endsWith(".html")) {
      results.push({ fullPath: full, relativePath: path.relative(baseDir, full) });
    }
  }
  return results;
}

// ── Content index ───────────────────────────────────────────

/** Slug → content data from content/ JSON files */
interface ContentEntry {
  description: string;
  title?: string;
  date?: string;
  collection: string;
  image?: string;
  /** F97 _seo overrides — first-class SEO input when available */
  seo: SeoOverrides;
  /** Document's own last-modified time (sitemap lastmod) */
  updatedAt?: string | undefined;
  category?: string | undefined;
  /** Body text for llms-full.txt */
  body: string;
}

/**
 * Scan content/ directory to build a slug→content map.
 *
 * Priority chain for descriptions (F97 coordination):
 *   _seo.metaDescription > excerpt > metaDescription > description > content snippet
 *
 * Priority chain for titles:
 *   _seo.metaTitle > title field
 *
 * Priority chain for images:
 *   _seo.ogImage > featured_image > heroImage > image
 */
function buildContentIndex(contentDir: string): Map<string, ContentEntry> {
  const index = new Map<string, ContentEntry>();
  if (!existsSync(contentDir)) return index;

  for (const collection of readdirSync(contentDir)) {
    const collDir = path.join(contentDir, collection);
    if (!statSync(collDir).isDirectory()) continue;
    if (collection === "globals") continue; // handled separately

    for (const file of readdirSync(collDir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(readFileSync(path.join(collDir, file), "utf-8"));
        const data = raw?.data ?? raw;
        const slug = raw?.slug ?? file.replace(/\.json$/, "");
        const seo: SeoOverrides = data._seo ?? {};

        // Description priority: _seo.metaDescription > excerpt > metaDescription > description > content snippet
        let desc = "";
        if (seo.metaDescription) desc = seo.metaDescription;
        else if (data.excerpt) desc = data.excerpt;
        else if (data.metaDescription) desc = data.metaDescription;
        else if (data.description) desc = data.description;
        else if (data.content && typeof data.content === "string") {
          desc = data.content
            .replace(/#{1,6}\s+/g, "")
            .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .replace(/\n+/g, " ")
            .trim()
            .slice(0, 160);
          if (desc.length === 160) desc += "...";
        }

        // Title priority: _seo.metaTitle > title field
        const title = seo.metaTitle ?? data.title;

        // Image priority: _seo.ogImage > featured_image > heroImage > image
        const image = seo.ogImage ?? data.featured_image ?? data.heroImage ?? data.image;

        const entry: ContentEntry = {
          description: desc,
          title,
          date: data.date,
          collection,
          image,
          seo,
          updatedAt: raw?.updatedAt,
          category: typeof data.category === "string" ? data.category : undefined,
          body: extractContent(data),
        };

        index.set(`${collection}/${slug}`, entry);
        if (!index.has(slug)) {
          index.set(slug, entry);
        }
      } catch { /* skip malformed JSON */ }
    }
  }

  return index;
}

// ── Page info extraction ────────────────────────────────────

function extractPageInfo(relativePath: string, html: string, config: EnrichmentConfig, contentIndex: Map<string, ContentEntry>): PageInfo {
  // Extract title from HTML
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const htmlTitle = titleMatch?.[1] ?? config.siteName;

  // Extract meta description from HTML
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  const htmlDesc = descMatch?.[1] ?? "";

  // Extract first image from HTML
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  const htmlImage = imgMatch?.[1] ?? "";

  // Build URL path from relative file path
  let urlPath = "/" + relativePath.replace(/\\/g, "/");
  if (urlPath.endsWith("/index.html")) urlPath = urlPath.slice(0, -"index.html".length);
  else if (urlPath.endsWith(".html")) urlPath = urlPath.slice(0, -".html".length) + "/";

  // Determine page type
  let pageType: PageInfo["pageType"] = "page";
  if (urlPath === "/" || urlPath === "/index.html") {
    pageType = "homepage";
  } else if (urlPath.match(/\/blog\/[^/]+\//) || urlPath.match(/\/posts\/[^/]+\//)) {
    pageType = "article";
  }

  // Look up content entry by URL path for _seo fields + fallback descriptions
  let contentEntry: ContentEntry | undefined;
  const segments = urlPath.replace(/^\/|\/$/g, "").split("/");
  // F206.8: a tag/category page is never a CMS document. Looking it up by its
  // last segment let /tags/research-lab/ inherit the post `research-lab`.
  if (TAXONOMY_SEGMENTS.has(segments[0] ?? "")) {
    // no content entry
  } else if (segments.length >= 2) {
    const slug = segments[segments.length - 1]!;
    const collection = segments[segments.length - 2]!;
    contentEntry = contentIndex.get(`${collection}/${slug}`)
      ?? contentIndex.get(`posts/${slug}`)
      ?? contentIndex.get(`pages/${slug}`)
      ?? contentIndex.get(`products/${slug}`)
      ?? contentIndex.get(`projects/${slug}`)
      ?? contentIndex.get(slug);
  } else if (segments.length === 1 && segments[0]) {
    contentEntry = contentIndex.get(`pages/${segments[0]}`) ?? contentIndex.get(segments[0]);
  }

  const seo = contentEntry?.seo ?? {};
  const canonMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0].match(/href=["']([^"']+)["']/i);
  const declaredCanonical = canonMatch?.[1];

  // ── Priority chains (F97 coordination) ──
  //
  // Title:       _seo.metaTitle > content data.title > <title> tag in HTML
  // Description: _seo.metaDescription > data.excerpt/metaDescription/description > <meta description> in HTML > siteDescription
  // Image:       _seo.ogImage > data.featured_image/heroImage > first <img> in HTML > config.siteImage
  //
  // When F97 lands, _seo fields will be populated by the SEO panel / AI agent.
  // Until then, they're undefined and the chain falls through to content data.

  const title = seo.metaTitle ?? contentEntry?.title ?? htmlTitle;
  const description = seo.metaDescription ?? contentEntry?.description ?? (htmlDesc || config.siteDescription);
  const firstImage = seo.ogImage ?? contentEntry?.image ?? htmlImage;

  return {
    relativePath,
    fullPath: "",
    urlPath,
    title,
    description,
    firstImage,
    pageType,
    seo,
    declaredCanonical,
    entry: contentEntry,
  };
}

// ── Head tag injection ──────────────────────────────────────

function injectHeadTags(html: string, info: PageInfo, config: EnrichmentConfig, lang: string): string {
  const seo = info.seo;
  // Canonical: _seo.canonical > auto-generated from URL
  const canonicalUrl = seo.canonical ?? (config.baseUrl + config.basePath + info.urlPath);
  const ogImage = resolveImage(info.firstImage, config);

  // OG title/desc: _seo.ogTitle > _seo.metaTitle > page title (already resolved in extractPageInfo)
  const ogTitle = seo.ogTitle ?? info.title;
  const ogDesc = seo.ogDescription ?? info.description;

  const tags: string[] = [];

  // Generator
  if (!hasTag(html, "generator")) {
    tags.push(`<meta name="generator" content="webhouse.app" />`);
  }

  // Canonical
  if (!html.includes('rel="canonical"') && !html.includes("rel='canonical'")) {
    tags.push(`<link rel="canonical" href="${canonicalUrl}" />`);
  }

  // Robots — only if _seo.robots is set (default: let search engines decide)
  if (seo.robots && !hasTag(html, "robots")) {
    tags.push(`<meta name="robots" content="${escAttr(seo.robots)}" />`);
  }

  // OpenGraph
  if (!hasOgTag(html, "og:title")) {
    tags.push(`<meta property="og:title" content="${escAttr(ogTitle)}" />`);
  }
  if (!hasOgTag(html, "og:description")) {
    tags.push(`<meta property="og:description" content="${escAttr(ogDesc)}" />`);
  }
  if (!hasOgTag(html, "og:url")) {
    tags.push(`<meta property="og:url" content="${canonicalUrl}" />`);
  }
  if (!hasOgTag(html, "og:type")) {
    tags.push(`<meta property="og:type" content="${info.pageType === "article" ? "article" : "website"}" />`);
  }
  if (!hasOgTag(html, "og:site_name")) {
    tags.push(`<meta property="og:site_name" content="${escAttr(config.siteName)}" />`);
  }
  if (ogImage && !hasOgTag(html, "og:image")) {
    tags.push(`<meta property="og:image" content="${ogImage}" />`);
  }

  // Twitter Card
  if (!hasTag(html, "twitter:card")) {
    tags.push(`<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />`);
  }
  if (!hasTag(html, "twitter:title")) {
    tags.push(`<meta name="twitter:title" content="${escAttr(ogTitle)}" />`);
  }
  if (!hasTag(html, "twitter:description")) {
    tags.push(`<meta name="twitter:description" content="${escAttr(ogDesc)}" />`);
  }
  if (ogImage && !hasTag(html, "twitter:image")) {
    tags.push(`<meta name="twitter:image" content="${ogImage}" />`);
  }

  // Favicon
  if (!html.includes('rel="icon"') && !html.includes("rel='icon'")) {
    tags.push(`<link rel="icon" href="${config.basePath}/favicon.ico" />`);
  }
  if (!html.includes('rel="apple-touch-icon"') && !html.includes("rel='apple-touch-icon'")) {
    tags.push(`<link rel="apple-touch-icon" href="${config.basePath}/apple-touch-icon.png" />`);
  }

  // Manifest
  if (!html.includes('rel="manifest"') && !html.includes("rel='manifest'")) {
    tags.push(`<link rel="manifest" href="${config.basePath}/manifest.json" />`);
  }

  // Theme color
  if (config.themeColor && !hasTag(html, "theme-color")) {
    tags.push(`<meta name="theme-color" content="${config.themeColor}" />`);
  }

  // Language on html tag
  if (!html.includes('lang="') && !html.includes("lang='")) {
    html = html.replace(/<html/i, `<html lang="${lang}"`);
  }

  if (tags.length === 0) return html;

  // Insert before </head>
  const injection = "\n  <!-- webhouse.app enrichment -->\n  " + tags.join("\n  ") + "\n";
  return html.replace(/<\/head>/i, injection + "</head>");
}

// ── JSON-LD injection ───────────────────────────────────────

function injectJsonLd(html: string, info: PageInfo, config: EnrichmentConfig): string {
  // Skip if JSON-LD already exists in HTML
  if (html.includes("application/ld+json")) return html;

  const canonicalUrl = info.seo.canonical ?? (config.baseUrl + config.basePath + info.urlPath);
  let schema: Record<string, unknown>;

  // Priority: _seo.jsonLd > auto-generated from page type
  if (info.seo.jsonLd && Object.keys(info.seo.jsonLd).length > 0) {
    // Use custom JSON-LD from F97 SEO module, ensure @context is set
    schema = { "@context": "https://schema.org", ...info.seo.jsonLd };
  } else {
    switch (info.pageType) {
      case "homepage":
        schema = {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: config.siteName,
          url: config.baseUrl + config.basePath + "/",
          description: config.siteDescription,
          inLanguage: config.lang ?? "en",
        };
        break;

      case "article":
        schema = {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: info.title,
          description: info.description,
          url: canonicalUrl,
          inLanguage: config.lang ?? "en",
          publisher: {
            "@type": "Organization",
            name: config.siteName,
          },
        };
        if (info.firstImage) {
          schema.image = resolveImage(info.firstImage, config);
        }
        break;

      default:
        schema = {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: info.title,
          url: canonicalUrl,
          description: info.description,
          inLanguage: config.lang ?? "en",
          isPartOf: {
            "@type": "WebSite",
            name: config.siteName,
            url: config.baseUrl + config.basePath + "/",
          },
        };
    }
  }

  const script = `\n<script type="application/ld+json">${JSON.stringify(schema)}</script>\n`;
  return html.replace(/<\/body>/i, script + "</body>");
}

// ── Favicon copy ────────────────────────────────────────────

function copyFavicon(distDir: string, contentDir: string, _config: EnrichmentConfig): void {
  const faviconDest = path.join(distDir, "favicon.ico");
  if (existsSync(faviconDest)) return;

  // Look for favicon in project root (sibling of content/)
  const projectDir = path.dirname(contentDir);
  const candidates = [
    path.join(projectDir, "favicon.ico"),
    path.join(projectDir, "public", "favicon.ico"),
    path.join(projectDir, "static", "favicon.ico"),
  ];
  for (const src of candidates) {
    if (existsSync(src)) {
      const { copyFileSync } = require("node:fs") as typeof import("node:fs");
      copyFileSync(src, faviconDest);
      console.log(`  -> favicon.ico (copied from ${path.relative(projectDir, src)})`);
      return;
    }
  }
  // No favicon found — enrichment still adds the <link> tag.
  // Users can add a favicon field in Site Settings (globals/site) to provide one.
}

// ── File generators ─────────────────────────────────────────

function generateRobotsTxt(distDir: string, config: EnrichmentConfig): void {
  const robotsPath = path.join(distDir, "robots.txt");
  if (existsSync(robotsPath)) return;

  const sitemapUrl = config.baseUrl + config.basePath + "/sitemap.xml";
  const content = `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
  writeFileSync(robotsPath, content);
  console.log("  -> robots.txt");
}

// ── F206.5: which pages to list, and how ──────────────────

const TAXONOMY_SEGMENTS = new Set(["tags", "tag", "categories", "category"]);

function isTaxonomy(p: PageInfo): boolean {
  return TAXONOMY_SEGMENTS.has(p.urlPath.split("/").filter(Boolean)[0] ?? "");
}

/** Canonical URL normalised so www/apex and trailing slashes compare equal. */
function normUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.host.replace(/^www\./, "") + url.pathname.replace(/\/?$/, "/");
  } catch {
    return u;
  }
}

/**
 * Drop pages that should not be listed as their own entry: a page whose own
 * canonical points at another URL, and a second URL with the same title AND
 * description as one already kept (the same document reachable twice).
 */
function listablePages(pages: PageInfo[], config: EnrichmentConfig): PageInfo[] {
  const seen = new Set<string>();
  const out: PageInfo[] = [];
  for (const p of pages) {
    const self = config.baseUrl + config.basePath + p.urlPath;
    if (p.declaredCanonical && normUrl(p.declaredCanonical) !== normUrl(self)) continue;
    // F206.8: taxonomy pages never claim a title+description — they are folded
    // away later, so letting one win the dedup made the real page vanish.
    if (isTaxonomy(p)) {
      out.push(p);
      continue;
    }
    const key = `${p.title}\u0000${p.description}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function lastmodOf(p: PageInfo): string | undefined {
  const raw = p.entry?.updatedAt ?? p.entry?.date;
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function titleCase(s: string): string {
  return s.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function generateSitemapXml(distDir: string, pages: PageInfo[], config: EnrichmentConfig): void {
  const sitemapPath = path.join(distDir, "sitemap.xml");

  const entries = pages.map((p) => {
    const loc = config.baseUrl + config.basePath + p.urlPath;
    const priority = p.pageType === "homepage" ? "1.0" : p.pageType === "article" ? "0.7" : "0.5";
    const lastmod = lastmodOf(p);
    return `  <url>\n    <loc>${escXml(loc)}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ""}    <priority>${priority}</priority>\n  </url>`;
  });
  const known = new Set(pages.map((p) => p.urlPath));
  for (const x of config.extraPages ?? []) {
    if (known.has(x.path)) continue;
    entries.push(`  <url>\n    <loc>${escXml(config.baseUrl + config.basePath + x.path)}</loc>\n    <priority>0.5</priority>\n  </url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  writeFileSync(sitemapPath, xml);
  console.log(`  -> sitemap.xml (${entries.length} URLs)`);
}

function generateLlmsTxt(distDir: string, pages: PageInfo[], config: EnrichmentConfig, hasFull: boolean): void {
  const llmsPath = path.join(distDir, "llms.txt");
  const url = (p: string) => config.baseUrl + config.basePath + p;
  const line = (title: string, href: string, desc: string) => `- [${title}](${href})${desc ? `: ${desc}` : ""}`;

  // Section name → lines. "Pages" (home + collection "pages" + pages without a
  // document) always comes first; other sections follow in first-seen order.
  const sections = new Map<string, string[]>([["Pages", []]]);
  const grouped = new Map<string, Map<string, string[]>>(); // section → category → lines
  const push = (section: string, l: string) => {
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section)!.push(l);
  };

  let taxonomyCount = 0;
  const taxonomyRoots = new Set<string>();
  for (const p of pages) {
    if (isTaxonomy(p)) {
      taxonomyCount++;
      taxonomyRoots.add("/" + p.urlPath.split("/").filter(Boolean)[0] + "/");
      continue;
    }
    const l = line(p.title, url(p.urlPath), p.description);
    const collection = p.entry?.collection;
    if (p.pageType === "homepage" || !collection || collection === "pages") {
      const seg = p.urlPath.split("/").filter(Boolean);
      // A page without a document that sits under a folder (e.g. /docs/x/) is
      // grouped by that folder rather than mixed into the top-level pages.
      push(!collection && seg.length > 1 ? titleCase(seg[0]!) : "Pages", l);
      continue;
    }
    const section = titleCase(collection);
    if (p.entry?.category) {
      if (!sections.has(section)) sections.set(section, []);
      if (!grouped.has(section)) grouped.set(section, new Map());
      const cats = grouped.get(section)!;
      if (!cats.has(p.entry.category)) cats.set(p.entry.category, []);
      cats.get(p.entry.category)!.push(l);
    } else {
      push(section, l);
    }
  }
  for (const x of config.extraPages ?? []) push(x.section ?? "Pages", line(x.title, url(x.path), x.description));

  const out = [`# ${config.siteName}`, "", `> ${config.siteDescription}`, ""];
  for (const [name, ls] of sections) {
    const cats = grouped.get(name);
    if (ls.length === 0 && !cats) continue;
    out.push(`## ${name}`, "", ...ls);
    if (ls.length > 0) out.push("");
    for (const [cat, cl] of cats ?? []) out.push(`### ${cat}`, "", ...cl, "");
  }
  if (taxonomyCount > 0) {
    out.push("## Topics", "", `- ${taxonomyCount} tag and category pages under ${[...taxonomyRoots].map((r) => url(r)).join(", ")}`, "");
  }
  if (hasFull) out.push(`Full content: ${url("/llms-full.txt")}`, "");
  out.push(`Built with [webhouse.app](https://webhouse.app)`, "");

  writeFileSync(llmsPath, out.join("\n"));
  console.log("  -> llms.txt");
}

/**
 * F206.5 — body text of every CMS document that has a page on the site.
 * Returns whether a llms-full.txt exists afterwards (the site's own counts);
 * nothing is written when no document has a body, so llms.txt never links an
 * empty export.
 */
function generateLlmsFullTxt(distDir: string, pages: PageInfo[], config: EnrichmentConfig): boolean {
  const fullPath = path.join(distDir, "llms-full.txt");
  if (existsSync(fullPath)) return true; // the site ships its own

  const out = [`# ${config.siteName}`, "", `> ${config.siteDescription}`, "", `> Full content export. Index: ${config.baseUrl + config.basePath}/llms.txt`, ""];
  let count = 0;
  for (const p of pages) {
    if (!p.entry || isTaxonomy(p) || !p.entry.body) continue;
    count++;
    out.push(`## ${p.title}`, "", `URL: ${config.baseUrl + config.basePath + p.urlPath}`);
    const lm = lastmodOf(p);
    if (lm) out.push(`Updated: ${lm}`);
    out.push("", p.entry.body, "", "---", "");
  }
  if (count === 0) return false;
  writeFileSync(fullPath, out.join("\n"));
  console.log(`  -> llms-full.txt (${count} documents)`);
  return true;
}

function generateManifestJson(distDir: string, config: EnrichmentConfig): void {
  const manifestPath = path.join(distDir, "manifest.json");
  if (existsSync(manifestPath)) return;

  const manifest = {
    name: config.siteName,
    short_name: config.siteName,
    description: config.siteDescription,
    start_url: config.basePath + "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: config.themeColor ?? "#000000",
    icons: [
      { src: config.basePath + "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log("  -> manifest.json");
}

function generateAiPluginJson(distDir: string, config: EnrichmentConfig): void {
  const wellKnown = path.join(distDir, ".well-known");
  const pluginPath = path.join(wellKnown, "ai-plugin.json");
  if (existsSync(pluginPath)) return;

  mkdirSync(wellKnown, { recursive: true });

  const plugin = {
    schema_version: "v1",
    name_for_human: config.siteName,
    name_for_model: config.siteName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    description_for_human: config.siteDescription,
    description_for_model: config.siteDescription,
    auth: { type: "none" },
    api: { type: "openapi", url: config.baseUrl + config.basePath + "/openapi.yaml" },
    logo_url: config.baseUrl + config.basePath + "/favicon.ico",
    contact_email: "",
    legal_info_url: config.baseUrl + config.basePath + "/",
  };

  writeFileSync(pluginPath, JSON.stringify(plugin, null, 2));
  console.log("  -> .well-known/ai-plugin.json");
}

/** GitHub Pages _config.yml — tells Jekyll to include dotfile directories like .well-known */
function generateJekyllConfig(distDir: string): void {
  const configPath = path.join(distDir, "_config.yml");
  if (existsSync(configPath)) return;

  writeFileSync(configPath, 'include: [".well-known"]\n');
  console.log("  -> _config.yml (include .well-known)");
}

// ── Helpers ─────────────────────────────────────────────────

function hasTag(html: string, name: string): boolean {
  // Check for <meta name="X" or <meta property="X"
  const re = new RegExp(`<meta\\s+(?:name|property)=["']${name}["']`, "i");
  return re.test(html);
}

function hasOgTag(html: string, property: string): boolean {
  const re = new RegExp(`<meta\\s+property=["']${property}["']`, "i");
  return re.test(html);
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function resolveImage(src: string, config: EnrichmentConfig): string {
  if (!src) return config.siteImage ?? "";
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  // Relative path → absolute URL
  const abs = src.startsWith("/") ? src : "/" + src;
  return config.baseUrl + config.basePath + abs;
}

// ── F44: Image → Picture upgrade ─────────────────────────────

/** Discover variant widths by scanning for existing *-Nw.webp files */
function discoverVariantWidths(uploadsDir: string, basePath: string): { path: string; w: number }[] {
  const base = basePath.replace(/\.[^.]+$/, "");
  const results: { path: string; w: number }[] = [];
  // Check common widths + any that exist on disk
  for (const w of [400, 600, 800, 1000, 1200, 1400, 1600, 1920, 2400]) {
    const variantPath = `${base}-${w}w.webp`;
    if (existsSync(path.join(uploadsDir, "..", variantPath.slice(1)))) {
      results.push({ path: variantPath, w });
    }
  }
  return results;
}

/** Upgrade <img src="/uploads/x.jpg"> → <picture> with WebP srcset */
function upgradeImagesInHtml(html: string, uploadsDir: string): string {
  return html.replace(
    /<img\s+([^>]*?)src="(\/uploads\/[^"]+\.(jpg|jpeg|png))"([^>]*?)>/gi,
    (match, pre, src, _ext, post) => {
      const srcsetParts = discoverVariantWidths(uploadsDir, src);
      if (srcsetParts.length === 0) return match;
      const srcset = srcsetParts.map((v) => `${v.path} ${v.w}w`).join(", ");
      return `<picture>` +
        `<source srcset="${srcset}" type="image/webp" sizes="(max-width: 800px) 100vw, 800px">` +
        `<img ${pre}src="${src}"${post}>` +
        `</picture>`;
    },
  );
}
