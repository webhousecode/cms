/**
 * Static Site Boilerplate — Build Script
 *
 * Reads content JSON files and generates static HTML in dist/.
 * Supports: richtext (markdown + HTML), blocks, maps, interactives, file embeds, SEO.
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
const UPLOADS_DIR = join(import.meta.dirname, "public", "uploads");

// ── Types ──────────────────────────────────────────────────

interface Doc {
  slug: string;
  data: Record<string, unknown>;
  status?: string;
}

interface Block {
  _block: string;
  [key: string]: unknown;
}

interface MapValue {
  lat: number;
  lng: number;
  address: string;
  zoom: number;
}

interface SeoFields {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  ogImage?: string;
  jsonLd?: Record<string, unknown>;
}

// ── Read content ───────────────────────────────────────────

function readCollection(name: string): Doc[] {
  const dir = join(CONTENT_DIR, name);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf-8"));
      return { slug: f.replace(/\.json$/, ""), data: raw.data ?? raw, status: raw.status };
    })
    .filter((d) => d.status !== "draft" || INCLUDE_DRAFTS);
}

function readSingleton(collection: string, slug: string): Record<string, unknown> {
  const file = join(CONTENT_DIR, collection, `${slug}.json`);
  if (!existsSync(file)) return {};
  const raw = JSON.parse(readFileSync(file, "utf-8"));
  return raw.data ?? raw;
}

const posts = readCollection("posts").sort((a, b) =>
  String(b.data.date ?? "").localeCompare(String(a.data.date ?? "")),
);
const pages = readCollection("pages");
const global = readSingleton("global", "global");

// ── CSS ────────────────────────────────────────────────────

const CSS = `
:root {
  --color-bg: #ffffff; --color-fg: #111827; --color-primary: #2563eb;
  --color-muted: #6b7280; --color-border: #e5e7eb; --color-card: #f9fafb;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, 'Courier New', monospace;
  --radius: 0.5rem; --max-width: 72rem;
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0f172a; --color-fg: #f1f5f9; --color-primary: #60a5fa;
    --color-muted: #94a3b8; --color-border: #334155; --color-card: #1e293b;
  }
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-sans); background: var(--color-bg); color: var(--color-fg); line-height: 1.7; }
a { color: var(--color-primary); }
img { max-width: 100%; height: auto; }
.container { max-width: var(--max-width); margin: 0 auto; padding: 0 1.5rem; }
header { border-bottom: 1px solid var(--color-border); padding: 1rem 0; }
header nav { display: flex; align-items: center; gap: 2rem; }
header .site-title { font-weight: 700; font-size: 1.25rem; text-decoration: none; color: var(--color-fg); }
header nav a.nav-link { text-decoration: none; color: var(--color-muted); font-size: 0.9375rem; }
header nav a.nav-link:hover { color: var(--color-fg); }
main { padding: 3rem 0; }
footer { border-top: 1px solid var(--color-border); padding: 1.5rem 0; margin-top: 3rem; color: var(--color-muted); font-size: 0.875rem; }
.prose h1 { font-size: clamp(1.75rem, 4vw, 2.25rem); font-weight: 800; line-height: 1.2; margin-bottom: 1rem; }
.prose h2 { font-size: 1.5rem; font-weight: 700; margin: 2rem 0 0.75rem; }
.prose h3 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.5rem; }
.prose p { margin-bottom: 1.25rem; }
.prose pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: var(--radius); overflow-x: auto; margin-bottom: 1.25rem; font-family: var(--font-mono); font-size: 0.875rem; }
.prose code { background: var(--color-card); padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-family: var(--font-mono); font-size: 0.875em; }
.prose pre code { background: none; padding: 0; }
.prose ul, .prose ol { padding-left: 1.5rem; margin-bottom: 1.25rem; overflow: hidden; }
.prose li { margin-bottom: 0.375rem; }
.prose blockquote { border-left: 4px solid var(--color-primary); padding-left: 1rem; margin: 1.5rem 0; color: var(--color-muted); }
.prose img { border-radius: var(--radius); margin: 1.5rem 0; }
.prose img[style*="float:left"] { margin: 0.25rem 1.25rem 1.25rem 0; }
.prose img[style*="float:right"] { margin: 0.25rem 0 1.25rem 1.25rem; }
.prose h2, .prose h3 { clear: both; }
.prose::after { content: ""; display: table; clear: both; }
.prose table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
.prose th, .prose td { padding: 0.5rem 0.75rem; border: 1px solid var(--color-border); text-align: left; }
.prose th { background: var(--color-card); font-weight: 600; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; }
.card { border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1.5rem; background: var(--color-card); }
.card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.card h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem; }
.card h2 a { text-decoration: none; color: var(--color-fg); }
.card h2 a:hover { color: var(--color-primary); }
.card .meta { color: var(--color-muted); font-size: 0.875rem; margin-bottom: 0.75rem; }
.card .excerpt { color: var(--color-muted); font-size: 0.9375rem; }
.post-header { margin-bottom: 2rem; }
.post-header h1 { font-size: clamp(1.75rem, 5vw, 2.5rem); font-weight: 800; line-height: 1.2; margin-bottom: 0.5rem; }
.post-meta { color: var(--color-muted); font-size: 0.875rem; }
.hero { padding: 4rem 0; text-align: center; }
.hero h1 { font-size: clamp(2rem, 5vw, 3rem); font-weight: 800; margin-bottom: 1rem; }
.hero p { font-size: 1.125rem; color: var(--color-muted); max-width: 40rem; margin: 0 auto 2rem; }
.hero .cta-group { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
.hero .cta-group a { display: inline-block; padding: 0.75rem 1.5rem; border-radius: var(--radius); font-weight: 600; text-decoration: none; }
.hero .cta-group a:first-child { background: var(--color-primary); color: #fff; }
.hero .cta-group a:not(:first-child) { border: 1px solid var(--color-border); color: var(--color-fg); }
.features { padding: 3rem 0; }
.features h2 { font-size: 1.5rem; font-weight: 700; text-align: center; margin-bottom: 2rem; }
.features-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1.5rem; }
.feature-card { padding: 1.5rem; border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-card); }
.feature-card .icon { font-size: 2rem; margin-bottom: 0.75rem; }
.feature-card h3 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem; }
.feature-card p { color: var(--color-muted); font-size: 0.9375rem; }
.cta-section { padding: 3rem; text-align: center; background: var(--color-card); border-radius: var(--radius); margin: 2rem 0; }
.cta-section h2 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.75rem; }
.cta-section p { color: var(--color-muted); margin-bottom: 1.5rem; }
.cta-section a { display: inline-block; padding: 0.75rem 1.5rem; background: var(--color-primary); color: #fff; border-radius: var(--radius); text-decoration: none; font-weight: 600; }
.tags { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.75rem; }
.tag { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 9999px; background: var(--color-card); border: 1px solid var(--color-border); color: var(--color-muted); }
`;

// ── Helpers ─────────────────────────────────────────────────

function bp(p: string): string { return `${BASE_PATH}${p}`; }

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(d: unknown): string {
  if (!d) return "";
  try { return new Date(String(d)).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return String(d); }
}

const siteTitle = String(global.siteTitle ?? "My Site");
const siteDescription = String(global.siteDescription ?? "");
const navLinks = (global.navLinks as Array<{ label: string; href: string }>) ?? [];
const footerText = String(global.footerText ?? `Built with webhouse.app`);

// ── Layout ──────────────────────────────────────────────────

function layout(title: string, content: string, seo?: SeoFields): string {
  const metaTitle = seo?.metaTitle ?? title;
  const metaDesc = seo?.metaDescription ?? siteDescription;
  const ogImage = seo?.ogImage ? `<meta property="og:image" content="${bp(seo.ogImage)}">` : "";
  const keywords = seo?.keywords?.length ? `<meta name="keywords" content="${esc(seo.keywords.join(", "))}">` : "";
  const jsonLd = seo?.jsonLd ? `\n<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(metaTitle)} — ${esc(siteTitle)}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <meta property="og:title" content="${esc(metaTitle)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:type" content="website">
  ${ogImage}
  ${keywords}
  <style>${CSS}</style>${jsonLd}
</head>
<body>
  <header>
    <div class="container">
      <nav>
        <a href="${bp("/")}" class="site-title">${esc(siteTitle)}</a>
        ${navLinks.map((l) => `<a href="${bp(l.href)}" class="nav-link">${esc(l.label)}</a>`).join("\n        ")}
      </nav>
    </div>
  </header>
  <main class="container">
    ${content}
  </main>
  <footer>
    <div class="container">
      <p>${footerText} &middot; &copy; ${new Date().getFullYear()}</p>
    </div>
  </footer>
</body>
</html>`;
}

// ── Content rendering ───────────────────────────────────────

function renderContent(raw: unknown): string {
  const s = String(raw ?? "");
  if (!s) return "";
  if (/^\s*</.test(s)) return processEmbeds(s);
  let html = marked.parse(s, { async: false }) as string;
  html = html.replace(
    /<img\s+([^>]*?)title="([^"]*(?:float|width|height|margin)[^"]*)"([^>]*?)>/gi,
    (_match, pre, title, post) => {
      const styles = title.split("|").map((p: string) => p.trim()).join("; ");
      return `<img ${pre}style="${styles}"${post}>`;
    },
  );
  return processEmbeds(html);
}

function processEmbeds(html: string): string {
  // !!INTERACTIVE[id|title|options]
  html = html.replace(/!!INTERACTIVE\[([^\]]+)\]/g, (_match, inner) => {
    const parts = inner.split("|");
    const id = parts[0]?.trim();
    const title = parts[1]?.trim() || id;
    if (!id) return "";
    return `<div class="interactive-embed" style="margin: 1.5rem 0;">
      <iframe src="${bp(`/uploads/interactives/${id}.html`)}" title="${esc(title)}"
        style="width:100%; border:none; border-radius:var(--radius);"
        loading="lazy" sandbox="allow-scripts allow-same-origin"
        onload="this.style.height=this.contentDocument.documentElement.scrollHeight+'px'"></iframe>
    </div>`;
  });

  // !!FILE[filename|label]
  html = html.replace(/!!FILE\[([^\]]+)\]/g, (_match, inner) => {
    const parts = inner.split("|");
    const filename = parts[0]?.trim();
    const label = parts[1]?.trim() || filename;
    if (!filename) return "";
    return `<a href="${bp(`/uploads/${filename}`)}" download style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.5rem 1rem; border:1px solid var(--color-border); border-radius:var(--radius); text-decoration:none; color:var(--color-fg); font-size:0.875rem; margin:0.5rem 0;">
      📎 ${esc(label)}
    </a>`;
  });

  // !!MAP[address|zoom]
  html = html.replace(/!!MAP\[([^\]]+)\]/g, (_match, inner) => {
    const parts = inner.split("|");
    const address = parts[0]?.trim();
    const zoom = parts[1]?.trim() || "14";
    if (!address) return "";
    const mapId = `map-${Math.random().toString(36).slice(2, 8)}`;
    return `<div style="margin:1.5rem 0; border-radius:8px; overflow:hidden; border:1px solid var(--color-border);">
      <div id="${mapId}" style="width:100%; height:350px;"></div>
      <div style="padding:0.5rem 0.75rem; font-size:0.75rem; color:var(--color-muted); background:var(--color-card);">📍 ${esc(address)}</div>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
      <script>(function(){var z=${zoom};fetch('https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(${JSON.stringify(address)})+'&limit=1').then(function(r){return r.json()}).then(function(d){if(!d.length)return;var lat=parseFloat(d[0].lat),lng=parseFloat(d[0].lon);var m=L.map('${mapId}').setView([lat,lng],z);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'\\u00a9 OpenStreetMap',maxZoom:19}).addTo(m);L.marker([lat,lng]).addTo(m);});})();<\/script>
    </div>`;
  });

  return html;
}

// ── Blocks rendering ────────────────────────────────────────

function renderBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  return (blocks as Block[]).map((block) => {
    switch (block._block) {
      case "hero": return renderHero(block);
      case "features": return renderFeatures(block);
      case "cta": return renderCta(block);
      default: return "";
    }
  }).join("\n");
}

function renderHero(b: Block): string {
  const ctas = (b.ctas as Array<{ label: string; href: string }>) ?? [];
  return `<section class="hero">
    <h1>${esc(b.tagline)}</h1>
    ${b.description ? `<p>${esc(b.description)}</p>` : ""}
    ${ctas.length > 0 ? `<div class="cta-group">${ctas.map((c) => `<a href="${bp(c.href)}">${esc(c.label)}</a>`).join("")}</div>` : ""}
  </section>`;
}

function renderFeatures(b: Block): string {
  const items = (b.items as Array<{ icon: string; title: string; description: string }>) ?? [];
  return `<section class="features">
    ${b.title ? `<h2>${esc(b.title)}</h2>` : ""}
    <div class="features-grid">
      ${items.map((item) => `<div class="feature-card">
        <div class="icon">${esc(item.icon)}</div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.description)}</p>
      </div>`).join("\n      ")}
    </div>
  </section>`;
}

function renderCta(b: Block): string {
  return `<section class="cta-section">
    <h2>${esc(b.title)}</h2>
    ${b.description ? `<p>${esc(b.description)}</p>` : ""}
    ${b.buttonUrl ? `<a href="${bp(String(b.buttonUrl))}">${esc(b.buttonText ?? "Learn more")}</a>` : ""}
  </section>`;
}

// ── Map field rendering ─────────────────────────────────────

function renderMap(location: unknown): string {
  if (!location || typeof location !== "object") return "";
  const loc = location as MapValue;
  if (!loc.lat || !loc.lng) return "";
  const mapId = `map-${Math.random().toString(36).slice(2, 8)}`;
  return `<div style="margin:2rem 0; border-radius:8px; overflow:hidden; border:1px solid var(--color-border);">
    <div id="${mapId}" style="width:100%; height:350px;"></div>
    ${loc.address ? `<div style="padding:0.5rem 0.75rem; font-size:0.75rem; color:var(--color-muted); background:var(--color-card);">📍 ${esc(loc.address)}</div>` : ""}
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
    <script>(function(){var m=L.map('${mapId}').setView([${loc.lat},${loc.lng}],${loc.zoom || 14});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'\\u00a9 OpenStreetMap',maxZoom:19}).addTo(m);L.marker([${loc.lat},${loc.lng}]).addTo(m);})();<\/script>
  </div>`;
}

// ── WebP upgrade ────────────────────────────────────────────

const VARIANT_WIDTHS = [400, 800, 1200, 1600];

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
      return `<picture><source srcset="${srcset}" type="image/webp" sizes="(max-width: 800px) 100vw, 800px"><img ${pre}src="${bp(src)}"${post}></picture>`;
    },
  );
}

// ── Write output ────────────────────────────────────────────

function write(relPath: string, html: string): void {
  const upgraded = upgradeImages(html);
  const fullPath = join(import.meta.dirname, OUT_DIR, relPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, upgraded);
  console.log(`  ${relPath}`);
}

// ── Build ───────────────────────────────────────────────────

console.log(`Building ${siteTitle} → ${OUT_DIR}/\n`);

// Homepage
const homePage = pages.find((p) => p.slug === "home");
const homeContent = homePage
  ? `${renderBlocks(homePage.data.sections)}
     ${homePage.data.content ? `<div class="prose">${renderContent(homePage.data.content)}</div>` : ""}
     ${renderMap(homePage.data.location)}`
  : `<div class="prose"><h1>${esc(siteTitle)}</h1><p>${esc(siteDescription)}</p></div>
     <h2 style="font-size:1.25rem; font-weight:700; margin:2rem 0 1rem;">Latest Posts</h2>
     <div class="card-grid">${posts.slice(0, 6).map((p) => postCard(p)).join("")}</div>`;

const homeSeo = (homePage?.data._seo as SeoFields) ?? {};
write("index.html", layout(homePage ? String(homePage.data.title) : siteTitle, homeContent, homeSeo));

// Blog listing
write("blog/index.html", layout("Blog", `
  <div class="prose"><h1>Blog</h1></div>
  <div class="card-grid">${posts.map((p) => postCard(p)).join("")}</div>
`, { metaDescription: `All ${posts.length} blog posts` }));

// Individual posts
for (const post of posts) {
  const seo = (post.data._seo as SeoFields) ?? {};
  const tags = (post.data.tags as string[]) ?? [];
  write(`blog/${post.slug}/index.html`, layout(String(post.data.title), `
    <article>
      <div class="post-header">
        ${post.data.coverImage ? `<img src="${bp(String(post.data.coverImage))}" alt="${esc(post.data.title)}" style="width:100%; height:300px; object-fit:cover; border-radius:var(--radius); margin-bottom:1.5rem;">` : ""}
        <h1>${esc(post.data.title)}</h1>
        <div class="post-meta">${formatDate(post.data.date)}${post.data.author ? ` · ${esc(post.data.author)}` : ""}</div>
        ${tags.length > 0 ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="prose">${renderContent(post.data.content)}</div>
    </article>
    <p style="margin-top:3rem;"><a href="${bp("/blog/")}">← All posts</a></p>
  `, seo));
}

// Pages (except home)
for (const page of pages) {
  if (page.slug === "home") continue;
  const seo = (page.data._seo as SeoFields) ?? {};
  write(`${page.slug}/index.html`, layout(String(page.data.title), `
    <article>
      ${renderBlocks(page.data.sections)}
      ${page.data.content ? `<div class="prose">${renderContent(page.data.content)}</div>` : ""}
      ${renderMap(page.data.location)}
    </article>
  `, seo));
}

// Copy uploads
if (existsSync(join(import.meta.dirname, "public", "uploads"))) {
  cpSync(join(import.meta.dirname, "public", "uploads"), join(import.meta.dirname, OUT_DIR, "uploads"), { recursive: true });
  console.log("  uploads/ copied");
}

console.log(`\nDone! ${posts.length} posts, ${pages.length} pages → ${OUT_DIR}/`);

// ── Helpers ─────────────────────────────────────────────────

function postCard(p: Doc): string {
  return `<div class="card">
    <h2><a href="${bp(`/blog/${p.slug}/`)}">${esc(p.data.title)}</a></h2>
    <div class="meta">${formatDate(p.data.date)}${p.data.author ? ` · ${esc(p.data.author)}` : ""}</div>
    ${p.data.excerpt ? `<div class="excerpt">${esc(p.data.excerpt)}</div>` : ""}
  </div>`;
}
