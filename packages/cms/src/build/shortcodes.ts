/**
 * Shortcode expander for richtext content.
 *
 * Five shortcodes are supported — all survive the TipTap ↔ markdown roundtrip
 * because they're plain text, not raw HTML:
 *
 *   !!INTERACTIVE[id|title|align:x|width:y|height:z]
 *   !!FILE[filename|label]
 *   !!MAP[address|zoom]
 *   {{snippet:slug}}
 *   {{svg:slug}}                  — inline SVG wrapped in <figure>
 *   {{svg:slug|caption text}}     — inline SVG with <figcaption>
 *
 * Each consumer site (static-boilerplate, blog, trail, …) can call
 * `expandShortcodes(html, options)` from its build.ts to expand shortcodes
 * into HTML in a single pass. The expander is pure — no I/O unless the SVG
 * renderer is asked to read a file (see svgDir option).
 *
 * Custom renderers can be passed via options to match per-site styling.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface InteractiveParams {
  id: string;
  title: string;
  align?: string;
  width?: string;
  height?: string;
}

export interface ShortcodeOptions {
  /** Prefix applied to /uploads/... URLs (for base-path deployments). */
  basePath?: string;
  /** Absolute path to the site's uploads directory. Required if you want
   *  the default {{svg:slug}} expander to read and inline the SVG file. */
  uploadsDir?: string;
  /** Directory (relative to uploadsDir) where SVG files live. Default: "svg". */
  svgDir?: string;
  /** Fallback captions by slug when shortcode has no explicit caption. */
  svgCaptions?: Record<string, string>;
  /** Pre-resolved snippet content by slug. */
  snippets?: Record<string, string>;

  /** Override renderers (given raw matches, return HTML). */
  renderInteractive?: (p: InteractiveParams, bp: (p: string) => string) => string;
  renderFile?: (filename: string, label: string, bp: (p: string) => string) => string;
  renderMap?: (address: string, zoom: string) => string;
  renderSvg?: (slug: string, caption: string, bp: (p: string) => string) => string;
  renderSnippet?: (slug: string) => string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function defaultBp(basePath: string): (p: string) => string {
  return (p: string) => (p.startsWith("http") ? p : `${basePath}${p}`);
}

/* ── Default renderers ────────────────────────────────────── */

function defaultInteractive(p: InteractiveParams, bp: (p: string) => string): string {
  const align = p.align && p.align !== "center" ? ` data-align="${esc(p.align)}"` : "";
  const width = p.width ? ` width: ${esc(p.width)};` : "";
  const height = p.height ? ` height: ${esc(p.height)};` : "height: 300px;";
  return `<div class="interactive-embed" style="margin: 1.5rem 0;${width}"${align}>
  <iframe src="${esc(bp(`/uploads/interactives/${p.id}.html`))}" title="${esc(p.title)}"
    style="width:100%; border:none;${height}"
    loading="lazy" sandbox="allow-scripts allow-same-origin"
    onload="this.style.height=this.contentDocument.documentElement.scrollHeight+'px'"></iframe>
</div>`;
}

function defaultFile(filename: string, label: string, bp: (p: string) => string): string {
  return `<a href="${esc(bp(`/uploads/${filename}`))}" download class="cms-file-attachment" style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.5rem 1rem; border:1px solid currentColor; text-decoration:none; font-size:0.875rem; margin:0.5rem 0;">📎 ${esc(label)}</a>`;
}

function defaultMap(address: string, zoom: string): string {
  const mapId = `map-${Math.random().toString(36).slice(2, 8)}`;
  return `<div class="cms-map" style="margin:1.5rem 0; overflow:hidden;">
  <div id="${mapId}" style="width:100%; height:350px;"></div>
  <div style="padding:0.5rem 0.75rem; font-size:0.75rem;">📍 ${esc(address)}</div>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <script>(function(){var z=${Number(zoom) || 14};fetch('https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(${JSON.stringify(address)})+'&limit=1').then(function(r){return r.json()}).then(function(d){if(!d.length)return;var lat=parseFloat(d[0].lat),lng=parseFloat(d[0].lon);var m=L.map('${mapId}').setView([lat,lng],z);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'\\u00a9 OpenStreetMap',maxZoom:19}).addTo(m);L.marker([lat,lng]).addTo(m);});})();<\/script>
</div>`;
}

function makeDefaultSvg(uploadsDir: string | undefined, svgDir: string, captions: Record<string, string>): (slug: string, caption: string, bp: (p: string) => string) => string {
  return (slug, caption, bp) => {
    const cap = caption || captions[slug] || "";
    // Try to inline the SVG file so it's CSS-stylable
    if (uploadsDir) {
      const file = join(uploadsDir, svgDir, `${slug}.svg`);
      if (existsSync(file)) {
        const svgContent = readFileSync(file, "utf-8");
        return `<figure class="cms-svg cms-svg--${esc(slug)}">${svgContent}${cap ? `<figcaption>${esc(cap)}</figcaption>` : ""}</figure>`;
      }
    }
    // Fallback: reference as <img> if no uploadsDir or file missing
    return `<figure class="cms-svg cms-svg--${esc(slug)}"><img src="${esc(bp(`/uploads/${svgDir}/${slug}.svg`))}" alt="${esc(cap || slug)}" />${cap ? `<figcaption>${esc(cap)}</figcaption>` : ""}</figure>`;
  };
}

function makeDefaultSnippet(snippets: Record<string, string>): (slug: string) => string {
  return (slug) => snippets[slug] ?? "";
}

/* ── Main expander ────────────────────────────────────────── */

export function expandShortcodes(html: string, options: ShortcodeOptions = {}): string {
  const bp = defaultBp(options.basePath ?? "");
  const svgDir = options.svgDir ?? "svg";
  const renderInteractive = options.renderInteractive ?? defaultInteractive;
  const renderFile = options.renderFile ?? defaultFile;
  const renderMap = options.renderMap ?? defaultMap;
  const renderSvg = options.renderSvg ?? makeDefaultSvg(options.uploadsDir, svgDir, options.svgCaptions ?? {});
  const renderSnippet = options.renderSnippet ?? makeDefaultSnippet(options.snippets ?? {});

  // !!INTERACTIVE[id|title|align:x|width:y|height:z]
  html = html.replace(/!!INTERACTIVE\[([^\]]+)\]/g, (_m, inner: string) => {
    const parts = inner.split("|").map((p) => p.trim());
    const id = parts[0];
    if (!id) return "";
    let title = "", align = "", width = "", height = "";
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i] ?? "";
      if (part.startsWith("align:")) align = part.slice(6);
      else if (part.startsWith("width:")) width = part.slice(6);
      else if (part.startsWith("height:")) height = part.slice(7);
      else if (!title) title = part;
    }
    return renderInteractive({ id, title: title || id, align, width, height }, bp);
  });

  // !!FILE[filename|label]
  html = html.replace(/!!FILE\[([^\]]+)\]/g, (_m, inner: string) => {
    const parts = inner.split("|").map((p) => p.trim());
    const filename = parts[0] ?? "";
    const label = parts[1] ?? "";
    if (!filename) return "";
    return renderFile(filename, label || filename, bp);
  });

  // !!MAP[address|zoom]
  html = html.replace(/!!MAP\[([^\]]+)\]/g, (_m, inner: string) => {
    const parts = inner.split("|").map((p) => p.trim());
    const address = parts[0] ?? "";
    const zoom = parts[1] ?? "";
    if (!address) return "";
    return renderMap(address, zoom || "14");
  });

  // {{svg:slug}} or {{svg:slug|caption}} — slug accepts [A-Za-z0-9_-] to match filesystem slugs
  html = html.replace(/\{\{svg:([\w-]+)(?:\|([^}]*))?\}\}/g, (_m, slug: string, caption: string | undefined) => {
    return renderSvg(slug, (caption ?? "").trim(), bp);
  });

  // {{snippet:slug}}
  html = html.replace(/\{\{snippet:([a-z0-9-]+)\}\}/g, (_m, slug: string) => {
    return renderSnippet(slug);
  });

  return html;
}

/* ── Convenience exports for consumer build.ts ────────────── */

export { defaultInteractive, defaultFile, defaultMap, makeDefaultSvg, makeDefaultSnippet };
