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
  generateSitemapXml(distDir, pages, config);
  generateLlmsTxt(distDir, pages, config);
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
  if (segments.length >= 2) {
    const slug = segments[segments.length - 1];
    const collection = segments[segments.length - 2];
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
        };
        break;

      case "article":
        schema = {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: info.title,
          description: info.description,
          url: canonicalUrl,
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

function generateSitemapXml(distDir: string, pages: PageInfo[], config: EnrichmentConfig): void {
  const sitemapPath = path.join(distDir, "sitemap.xml");

  const today = new Date().toISOString().split("T")[0];
  const urls = pages
    .map((p) => {
      const loc = config.baseUrl + config.basePath + p.urlPath;
      const priority = p.pageType === "homepage" ? "1.0" : p.pageType === "article" ? "0.7" : "0.5";
      return `  <url>\n    <loc>${escXml(loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  writeFileSync(sitemapPath, xml);
  console.log(`  -> sitemap.xml (${pages.length} URLs)`);
}

function generateLlmsTxt(distDir: string, pages: PageInfo[], config: EnrichmentConfig): void {
  const llmsPath = path.join(distDir, "llms.txt");

  const lines = [
    `# ${config.siteName}`,
    "",
    `> ${config.siteDescription}`,
    "",
    "## Pages",
    "",
  ];

  for (const p of pages) {
    const url = config.baseUrl + config.basePath + p.urlPath;
    lines.push(`- [${p.title}](${url}): ${p.description}`);
  }

  lines.push("");
  lines.push(`Built with [webhouse.app](https://webhouse.app)`);
  lines.push("");

  writeFileSync(llmsPath, lines.join("\n"));
  console.log("  -> llms.txt");
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

const VARIANT_WIDTHS = [400, 800, 1200, 1600];

/** Upgrade <img src="/uploads/x.jpg"> → <picture> with WebP srcset */
function upgradeImagesInHtml(html: string, uploadsDir: string): string {
  return html.replace(
    /<img\s+([^>]*?)src="(\/uploads\/[^"]+\.(jpg|jpeg|png))"([^>]*?)>/gi,
    (match, pre, src, _ext, post) => {
      const base = src.replace(/\.[^.]+$/, "");
      const srcsetParts = VARIANT_WIDTHS
        .map((w) => ({ path: `${base}-${w}w.webp`, w }))
        .filter((v) => existsSync(path.join(uploadsDir, "..", v.path.slice(1))));
      if (srcsetParts.length === 0) return match;
      const srcset = srcsetParts.map((v) => `${v.path} ${v.w}w`).join(", ");
      return `<picture>` +
        `<source srcset="${srcset}" type="image/webp" sizes="(max-width: 800px) 100vw, 800px">` +
        `<img ${pre}src="${src}"${post}>` +
        `</picture>`;
    },
  );
}
