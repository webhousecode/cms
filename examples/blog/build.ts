/**
 * Simple Blog — Static Site Builder
 *
 * Reads content/posts/*.json and content/pages/*.json,
 * generates static HTML in dist/ (or BUILD_OUT_DIR).
 *
 * Usage: npx tsx build.ts
 * Env:   BASE_PATH=/prefix  BUILD_OUT_DIR=deploy
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { marked } from "marked";

const BASE_PATH = process.env.BASE_PATH ?? "";
const OUT_DIR = process.env.BUILD_OUT_DIR ?? "dist";
const INCLUDE_DRAFTS = process.env.INCLUDE_DRAFTS === "true";
const CONTENT_DIR = join(import.meta.dirname, "content");

interface Doc {
  slug: string;
  data: Record<string, unknown>;
  status?: string;
  locale?: string;
  translationOf?: string;
}

// ── i18n config ────────────────────────────────────────────

const DEFAULT_LOCALE = "da";
const LOCALES = ["da", "en"];
const LOCALE_LABELS: Record<string, string> = { da: "Dansk", en: "English" };
const LOCALE_FLAGS: Record<string, string> = { da: "🇩🇰", en: "🇬🇧" };

// ── Read content ────────────────────────────────────────────

function readCollection(name: string): Doc[] {
  const dir = join(CONTENT_DIR, name);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf-8"));
      return {
        slug: f.replace(/\.json$/, ""),
        data: raw.data ?? raw,
        status: raw.status,
        locale: raw.locale,
        translationOf: raw.translationOf,
      };
    })
    .filter((d) => d.status !== "draft" || INCLUDE_DRAFTS);
}

const allPosts = readCollection("posts");
const allPages = readCollection("pages");

/** Get docs for a specific locale (source docs in that locale + translations into it) */
function getLocalized(docs: Doc[], locale: string): Doc[] {
  return docs.filter((d) => {
    const docLocale = d.locale || DEFAULT_LOCALE;
    return docLocale === locale;
  });
}

/** Find the alternate-locale version of a doc */
function getAlternate(doc: Doc, targetLocale: string, allDocs: Doc[]): Doc | undefined {
  if (doc.translationOf) {
    // This is a translation — find siblings or source
    if (targetLocale === DEFAULT_LOCALE) return allDocs.find(d => d.slug === doc.translationOf);
    return allDocs.find(d => d.translationOf === doc.translationOf && d.locale === targetLocale);
  }
  // This is a source — find translation
  return allDocs.find(d => d.translationOf === doc.slug && d.locale === targetLocale);
}

// ── Shared CSS (extracted from existing dist) ───────────────

const CSS = `
:root {
  --color-bg: #ffffff; --color-fg: #111827; --color-primary: #2563eb;
  --color-muted: #6b7280; --color-border: #e5e7eb;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'Courier New', monospace; --radius: 0.5rem;
  --spacing-section: clamp(2rem, 5vw, 4rem); --max-width: 72rem;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-sans); background: var(--color-bg); color: var(--color-fg); line-height: 1.7; }
a { color: var(--color-primary); }
img { max-width: 100%; height: auto; }
.container { max-width: var(--max-width); margin: 0 auto; padding: 0 1rem; }
header { border-bottom: 1px solid var(--color-border); padding: 1rem 0; margin-bottom: 2rem; }
header nav { display: flex; align-items: center; gap: 2rem; }
header .site-title { font-weight: 700; font-size: 1.25rem; text-decoration: none; color: var(--color-fg); }
header nav a.nav-link { text-decoration: none; color: var(--color-muted); font-size: 0.9375rem; }
header nav a.nav-link:hover { color: var(--color-fg); }
main { padding: var(--spacing-section) 0; }
footer { border-top: 1px solid var(--color-border); padding: 1.5rem 0; margin-top: var(--spacing-section); color: var(--color-muted); font-size: 0.875rem; }
.prose h1 { font-size: clamp(1.75rem, 4vw, 2.25rem); font-weight: 800; line-height: 1.2; margin-bottom: 1rem; }
.prose h2 { font-size: 1.5rem; font-weight: 700; margin: 2rem 0 0.75rem; }
.prose h3 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.5rem; }
.prose p { margin-bottom: 1.25rem; }
.prose pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: var(--radius); overflow-x: auto; margin-bottom: 1.25rem; font-family: var(--font-mono); font-size: 0.875rem; }
.prose code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-family: var(--font-mono); font-size: 0.875em; }
.prose pre code { background: none; padding: 0; }
.prose ul, .prose ol { padding-left: 1.5rem; margin-bottom: 1.25rem; overflow: hidden; }
.prose li { margin-bottom: 0.375rem; }
.prose blockquote { border-left: 4px solid var(--color-primary); padding-left: 1rem; margin: 1.5rem 0; color: var(--color-muted); }
.prose img { border-radius: var(--radius); margin: 1.5rem 0; }
.prose img[style*="float:left"] { margin: 0.25rem 1.25rem 1.25rem 0; }
.prose img[style*="float:right"] { margin: 0.25rem 0 1.25rem 1.25rem; }
.prose h2, .prose h3 { clear: both; }
.prose .interactive-embed iframe { background: #fff; }
.prose::after { content: ""; display: table; clear: both; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
.card { border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1.5rem; transition: box-shadow 0.2s; }
.card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.card h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem; }
.card h2 a { text-decoration: none; color: var(--color-fg); }
.card h2 a:hover { color: var(--color-primary); }
.card .meta { color: var(--color-muted); font-size: 0.875rem; margin-bottom: 0.75rem; }
.card .excerpt { color: var(--color-muted); font-size: 0.9375rem; }
.post-header { margin-bottom: 2rem; }
.post-header h1 { font-size: clamp(1.75rem, 5vw, 2.5rem); font-weight: 800; line-height: 1.2; margin-bottom: 0.5rem; }
.post-meta { color: var(--color-muted); font-size: 0.875rem; }
`;

// ── HTML helpers ─────────────────────────────────────────────

const DRAFT_BANNER = `<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#F7BB2E;color:#0D0D0D;text-align:center;padding:0.5rem 1rem;font-weight:700;font-size:0.875rem;font-family:system-ui,sans-serif;">DRAFT — not published</div><div style="height:2.5rem"></div>`;
const DRAFT_BADGE = `<span style="display:inline-block;background:#F7BB2E;color:#0D0D0D;font-size:0.7rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:3px;margin-left:0.5rem;vertical-align:middle;">DRAFT</span>`;

function bp(p: string): string { return `${BASE_PATH}${p}`; }

/** Get the URL prefix for a locale (default locale = no prefix) */
function localePrefix(locale: string): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

function layout(title: string, content: string, locale: string, alternateUrl?: string, description?: string): string {
  const prefix = localePrefix(locale);
  const altLocale = locale === "da" ? "en" : "da";
  const altFlag = LOCALE_FLAGS[altLocale] ?? altLocale.toUpperCase();
  const altLabel = LOCALE_LABELS[altLocale] ?? altLocale;
  const altHref = alternateUrl ?? `${bp(localePrefix(altLocale))}/`;
  const navLabels = locale === "da"
    ? { posts: "Blog Posts", about: "Om os" }
    : { posts: "Blog Posts", about: "About" };
  const dateLocale = locale === "da" ? "da-DK" : "en-US";

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — Simple Blog</title>
  ${description ? `<meta name="description" content="${esc(description)}">` : ""}
  <meta property="og:title" content="${esc(title)} — Simple Blog">
  ${description ? `<meta property="og:description" content="${esc(description)}">` : ""}
  <meta property="og:type" content="website">
  ${alternateUrl ? `<link rel="alternate" hreflang="${altLocale}" href="${altHref}">` : ""}
  <link rel="alternate" hreflang="${locale}" href="${bp(prefix)}/">
  <style>${CSS}</style>
</head>
<body>
  <header>
    <div class="container">
      <nav>
        <a href="${bp(prefix)}/" class="site-title">Simple Blog</a>
        <a href="${bp(prefix)}/posts/" class="nav-link">${navLabels.posts}</a>
        <a href="${bp(`${prefix}/${locale === "da" ? "om-os" : "about"}/`)}" class="nav-link">${navLabels.about}</a>
        <a href="${altHref}" class="nav-link" style="margin-left:auto; font-size:0.8rem; border:1px solid var(--color-border); padding:0.2rem 0.6rem; border-radius:4px;" title="${altLabel}">
          ${altFlag} ${altLocale.toUpperCase()}
        </a>
      </nav>
    </div>
  </header>
  <main class="container">
    ${content}
  </main>
  <footer>
    <div class="container">
      <p>&copy; ${new Date().getFullYear()} Simple Blog — built with <a href="https://webhouse.app">webhouse.app</a></p>
    </div>
  </footer>
</body>
</html>`;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(d: unknown, locale = "da"): string {
  if (!d) return "";
  const loc = locale === "da" ? "da-DK" : locale === "en" ? "en-US" : `${locale}-${locale.toUpperCase()}`;
  try { return new Date(String(d)).toLocaleDateString(loc, { year: "numeric", month: "long", day: "numeric" }); }
  catch { return String(d); }
}

/** Render content — parse markdown if needed, pass HTML through */
function renderContent(raw: unknown): string {
  const s = String(raw ?? "");
  if (!s) return "";
  // If it starts with HTML tags, it's already HTML (from richtext editor)
  if (/^\s*</.test(s)) return s;
  // Otherwise treat as markdown
  let html = marked.parse(s, { async: false }) as string;
  // Convert image title attributes to inline styles (float:left|width:303px)
  html = html.replace(
    /<img\s+([^>]*?)title="([^"]*(?:float|width|height|margin)[^"]*)"([^>]*?)>/gi,
    (_match, pre, title, post) => {
      const styles = title.split("|").map((p: string) => p.trim()).join("; ");
      return `<img ${pre}style="${styles}"${post}>`;
    },
  );
  // Render !!INTERACTIVE[id|title|options] embeds as iframes
  html = html.replace(
    /!!INTERACTIVE\[([^\]]+)\]/g,
    (_match, inner) => {
      const parts = inner.split("|");
      const id = parts[0]?.trim();
      const title = parts[1]?.trim() || id;
      const options = parts[2]?.trim() || "";
      if (!id) return "";
      // Parse alignment from options (e.g. "align:left")
      const alignMatch = options.match(/align:(\w+)/);
      const align = alignMatch?.[1] || "center";
      const floatStyle = align === "left" ? "float:left; margin: 0.25rem 1.25rem 1.25rem 0; width: 50%;"
        : align === "right" ? "float:right; margin: 0.25rem 0 1.25rem 1.25rem; width: 50%;"
        : "margin: 1.5rem auto; width: 100%;";
      return `<div class="interactive-embed" style="${floatStyle}">
        <iframe src="${bp(`/uploads/interactives/${id}.html`)}" title="${esc(title)}"
          style="width:100%; border:none; border-radius:var(--radius); overflow:hidden;"
          loading="lazy" sandbox="allow-scripts allow-same-origin"
          onload="this.style.height=this.contentDocument.documentElement.scrollHeight+'px'"></iframe>
      </div>`;
    },
  );
  // Render !!FILE[filename|label] embeds as download links
  html = html.replace(
    /!!FILE\[([^\]]+)\]/g,
    (_match, inner) => {
      const parts = inner.split("|");
      const filename = parts[0]?.trim();
      const label = parts[1]?.trim() || filename;
      if (!filename) return "";
      return `<a href="${bp(`/uploads/${filename}`)}" download class="file-download"
        style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.5rem 1rem; border:1px solid var(--color-border); border-radius:var(--radius); text-decoration:none; color:var(--color-fg); font-size:0.875rem; margin:0.5rem 0;">
        📎 ${esc(label)}
      </a>`;
    },
  );
  // Render !!MAP[address|zoom|style] embeds as Leaflet OSM maps
  html = html.replace(
    /!!MAP\[([^\]]+)\]/g,
    (_match, inner) => {
      const parts = inner.split("|");
      const address = parts[0]?.trim();
      const zoom = parts[1]?.trim() || "14";
      if (!address) return "";
      const mapId = `map-${Math.random().toString(36).slice(2, 8)}`;
      return `<div class="map-embed" style="margin: 1.5rem 0; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
        <div id="${mapId}" style="width:100%; height:350px;"></div>
        <div style="padding: 0.5rem 0.75rem; font-size: 0.75rem; color: #666; background: #f9fafb;">
          📍 ${esc(address)}
        </div>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
        <script>
          (function(){
            var z=${zoom};
            fetch('https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(${JSON.stringify(address)})+'&limit=1')
              .then(function(r){return r.json()})
              .then(function(d){
                if(!d.length)return;
                var lat=parseFloat(d[0].lat),lng=parseFloat(d[0].lon);
                var m=L.map('${mapId}').setView([lat,lng],z);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
                  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19
                }).addTo(m);
                L.marker([lat,lng]).addTo(m);
              });
          })();
        <\/script>
      </div>`;
    },
  );
  return html;
}


const UPLOADS_DIR = join(import.meta.dirname, "public", "uploads");
const VARIANT_WIDTHS = [400, 800, 1200, 1600];

/** Upgrade <img> to <picture> with WebP srcset when variants exist */
function upgradeImages(html: string): string {
  return html.replace(
    /<img\s+([^>]*?)src="(\/uploads\/[^"]+\.(jpg|jpeg|png))"([^>]*?)>/gi,
    (match, pre, src, _ext, post) => {
      const base = src.replace(/\.[^.]+$/, "");
      const srcsetParts = VARIANT_WIDTHS
        .map((w) => ({ path: `${base}-${w}w.webp`, w }))
        .filter((v) => existsSync(join(UPLOADS_DIR, v.path.replace(/^\/uploads\//, ""))));
      if (srcsetParts.length === 0) return match;
      const srcset = srcsetParts.map((v) => `${bp(v.path)} ${v.w}w`).join(", ");
      return `<picture>` +
        `<source srcset="${srcset}" type="image/webp" sizes="(max-width: 800px) 100vw, 800px">` +
        `<img ${pre}src="${bp(src)}"${post}>` +
        `</picture>`;
    },
  );
}

function write(relPath: string, html: string): void {
  const upgraded = upgradeImages(html);
  const fullPath = join(import.meta.dirname, OUT_DIR, relPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, upgraded);
  console.log(`  ${relPath}`);
}

// ── Build pages (per locale) ────────────────────────────────

console.log(`Building Simple Blog → ${OUT_DIR}/\n`);
console.log(`Locales: ${LOCALES.map(l => `${LOCALE_FLAGS[l]} ${l.toUpperCase()}`).join(" · ")}\n`);

for (const locale of LOCALES) {
  const prefix = localePrefix(locale);
  const outPrefix = prefix ? prefix.slice(1) + "/" : ""; // "en/" or ""
  const posts = getLocalized(allPosts, locale).sort((a, b) =>
    String(b.data.date ?? "").localeCompare(String(a.data.date ?? ""))
  );
  const pages = getLocalized(allPages, locale);
  const altLocale = locale === "da" ? "en" : "da";

  console.log(`  ${LOCALE_FLAGS[locale]} ${locale.toUpperCase()}: ${posts.length} posts, ${pages.length} pages`);

  // Homepage — latest posts
  const homeAlt = `${bp(localePrefix(altLocale))}/`;
  const homeTitle = locale === "da" ? "Hjem" : "Home";
  const postsLabel = locale === "da" ? "Seneste indlæg" : "Latest Posts";
  write(`${outPrefix}index.html`, layout(homeTitle, `
    <div class="prose">
      <h1>Simple Blog</h1>
      <p>${locale === "da"
        ? `Et testsite for webhouse.app med ${posts.length} indlæg og ${pages.length} sider.`
        : `A test site for webhouse.app with ${posts.length} posts and ${pages.length} pages.`}</p>
    </div>
    <h2 style="font-size: 1.25rem; font-weight: 700; margin: 2rem 0 1rem;">${postsLabel}</h2>
    <div class="card-grid">
      ${posts.slice(0, 12).map((p) => `
        <div class="card">
          <h2><a href="${bp(`${prefix}/posts/${p.slug}/`)}">${esc(p.data.title)}</a>${p.status === "draft" ? DRAFT_BADGE : ""}</h2>
          <div class="meta">${formatDate(p.data.date, locale)}${p.data.author ? ` · ${esc(p.data.author)}` : ""}</div>
          ${p.data.excerpt ? `<div class="excerpt">${esc(p.data.excerpt)}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `, locale, homeAlt, `Simple Blog — ${posts.length} posts`));

  // Posts index
  const allPostsTitle = locale === "da" ? "Alle indlæg" : "All Posts";
  write(`${outPrefix}posts/index.html`, layout(allPostsTitle, `
    <div class="prose"><h1>${allPostsTitle}</h1></div>
    <div class="card-grid">
      ${posts.map((p) => `
        <div class="card">
          <h2><a href="${bp(`${prefix}/posts/${p.slug}/`)}">${esc(p.data.title)}</a>${p.status === "draft" ? DRAFT_BADGE : ""}</h2>
          <div class="meta">${formatDate(p.data.date, locale)}${p.data.author ? ` · ${esc(p.data.author)}` : ""}</div>
          ${p.data.excerpt ? `<div class="excerpt">${esc(p.data.excerpt)}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `, locale, `${bp(localePrefix(altLocale))}/posts/`, `${allPostsTitle} — ${posts.length}`));

  // Individual posts
  for (const post of posts) {
    const isDraft = post.status === "draft";
    const alt = getAlternate(post, altLocale, allPosts);
    const altUrl = alt ? `${bp(localePrefix(altLocale))}/posts/${alt.slug}/` : undefined;
    const backLabel = locale === "da" ? "← Alle indlæg" : "← All posts";
    write(`${outPrefix}posts/${post.slug}/index.html`, layout(String(post.data.title), `
      ${isDraft ? DRAFT_BANNER : ""}
      <article>
        <div class="post-header">
          <h1>${esc(post.data.title)}</h1>
          <div class="post-meta">${formatDate(post.data.date, locale)}${post.data.author ? ` · ${esc(post.data.author)}` : ""}</div>
        </div>
        <div class="prose">${renderContent(post.data.content)}</div>
      </article>
      <p style="margin-top: 3rem;"><a href="${bp(`${prefix}/posts/`)}">${backLabel}</a></p>
    `, locale, altUrl, String(post.data.excerpt ?? "")));
  }

  // Pages
  for (const page of pages) {
    const isDraft = page.status === "draft";
    // Use source slug for path (strip locale suffix, find canonical name)
    const sourceSlug = page.translationOf ?? page.slug;
    const cleanSlug = sourceSlug === "home" ? "" : sourceSlug;
    // For about pages: use "about" as the path regardless of slug (om-os → about for EN, om-os for DA)
    const pageDir = cleanSlug === "om-os" && locale !== "da" ? "about" : (cleanSlug || "about");
    const path = `${outPrefix}${pageDir}/index.html`;
    const alt = getAlternate(page, altLocale, allPages);
    const altSlug = alt?.translationOf ?? alt?.slug;
    const altDir = altSlug === "om-os" && altLocale !== "da" ? "about" : (altSlug === "home" ? "about" : altSlug);
    const altUrl = alt ? `${bp(localePrefix(altLocale))}/${altDir}/` : undefined;
    write(path, layout(String(page.data.title), `
      ${isDraft ? DRAFT_BANNER : ""}
      <article class="prose">
        <h1>${esc(page.data.title)}</h1>
        ${renderContent(page.data.content)}
      </article>
    `, locale, altUrl));
  }
}

// Copy uploads to dist (so images work in built site)
const uploadsDir = join(import.meta.dirname, "public", "uploads");
const distUploads = join(import.meta.dirname, OUT_DIR, "uploads");
if (existsSync(uploadsDir)) {
  cpSync(uploadsDir, distUploads, { recursive: true });
  const count = readdirSync(uploadsDir).length;
  console.log(`  uploads/ (${count} files copied)`);
}

console.log(`\nDone! ${LOCALES.length} locales × content → ${OUT_DIR}/`);
