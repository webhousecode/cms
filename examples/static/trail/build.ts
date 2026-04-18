/**
 * trail — Static Site Generator
 *
 * Reads JSON from content/ and writes pure static HTML to dist/.
 * Pixel-matches the Gemini reference: warm off-white, charcoal, amber accent.
 * Canvas knowledge-graph animation embedded as vanilla JS.
 *
 * Run:  npx tsx build.ts
 * Env:  BASE_PATH=/prefix  BUILD_OUT_DIR=deploy
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { marked } from "marked";
import { expandShortcodes } from "@webhouse/cms";

const BASE_PATH = process.env.BASE_PATH ?? "";
const OUT_DIR = process.env.BUILD_OUT_DIR ?? "dist";
const INCLUDE_DRAFTS = process.env.INCLUDE_DRAFTS === "true";
const CONTENT_DIR = join(import.meta.dirname, "content");

// ── Types ───────────────────────────────────────────────────

interface Doc {
  slug: string;
  data: Record<string, unknown>;
  status?: string;
}

interface Block {
  _block: string;
  [key: string]: unknown;
}

// ── Content readers ─────────────────────────────────────────

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

const pages = readCollection("pages");
const posts = readCollection("posts");
const categories = readCollection("categories");
const global = readSingleton("global", "global");

// ── Helpers ─────────────────────────────────────────────────

function bp(p: string): string {
  if (!p) return p;
  if (/^https?:/.test(p)) return p;
  return `${BASE_PATH}${p}`;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Inline SVG icons ────────────────────────────────────────

const ICONS: Record<string, string> = {
  graph: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  sync: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9"/></svg>`,
  search: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="21" x2="16.65" y2="16.65"/><circle cx="11" cy="11" r="8"/><path d="M11 7v4"/><path d="M8 11h6"/></svg>`,
  cube: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  code: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  lock: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  spark: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
  layers: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  atom: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z"/><path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z"/></svg>`,
};

function iconSvg(key: unknown): string {
  return ICONS[String(key)] ?? ICONS.graph;
}

const ARROW_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
const BOOK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`;

// ── Canvas graph animation (pure vanilla JS, inlined) ───────

const CANVAS_SCRIPT = `
(function(){
  const canvas = document.getElementById('trail-graph');
  if (!canvas) return;
  /* Respect reduced-motion — draw one static frame and stop. */
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ctx = canvas.getContext('2d');
  let animationFrameId = 0;
  let running = false;
  let particles = [];
  const mouse = { x: null, y: null };
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* Cache colors at mount; re-read only on theme change. Reading CSS vars
   * with getComputedStyle on every frame forces style recalc and was
   * pegging CPU/GPU on long-running pages. */
  const colors = { node: '#1a1715', accent: '#e8a87c', line: '26, 23, 21', accentLine: '232, 168, 124' };
  function refreshColors(){
    const cs = getComputedStyle(document.documentElement);
    const read = function(n, f){ return (cs.getPropertyValue(n).trim() || f); };
    colors.node = read('--graph-node', colors.node);
    colors.accent = read('--graph-accent', colors.accent);
    colors.line = read('--graph-line', colors.line);
    colors.accentLine = read('--graph-accent-line', colors.accentLine);
  }
  refreshColors();

  /* Re-cache when theme toggles (data-theme attribute changes on <html>). */
  if ('MutationObserver' in window) {
    new MutationObserver(refreshColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  function resize(){
    canvas.width = window.innerWidth * DPR;
    canvas.height = window.innerHeight * DPR;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    initParticles();
  }

  function Particle(){
    this.x = Math.random() * window.innerWidth;
    this.y = Math.random() * window.innerHeight;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = (Math.random() - 0.5) * 0.3;
    this.baseRadius = Math.random() > 0.95 ? 3 : 1.5;
    this.isAccent = Math.random() > 0.98;
  }
  Particle.prototype.update = function(){
    this.x += this.vx;
    this.y += this.vy;
    /* Bound by intent, not by position — a particle that has drifted
     * past an edge should only flip if it's still moving outward. */
    if ((this.x < 0 && this.vx < 0) || (this.x > window.innerWidth && this.vx > 0)) this.vx = -this.vx;
    if ((this.y < 0 && this.vy < 0) || (this.y > window.innerHeight && this.vy > 0)) this.vy = -this.vy;
    if (mouse.x !== null && mouse.y !== null) {
      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < 100) { this.x -= dx * 0.01; this.y -= dy * 0.01; }
    }
  };
  Particle.prototype.draw = function(){
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.baseRadius, 0, Math.PI * 2);
    ctx.fillStyle = this.isAccent ? colors.accent : colors.node;
    ctx.fill();
  };

  function initParticles(){
    particles = [];
    /* Cap at 150 — O(n²) linking loop becomes the bottleneck past that.
     * On 4K screens the old formula produced 400+ particles. */
    const count = Math.min(150, Math.floor((window.innerWidth * window.innerHeight) / 15000));
    for (let i = 0; i < count; i++) particles.push(new Particle());
  }

  const LINK_DIST = 160;
  const LINK_DIST_SQ = LINK_DIST * LINK_DIST;
  function drawLines(){
    for (let i = 0; i < particles.length; i++){
      const pi = particles[i];
      for (let j = i + 1; j < particles.length; j++){
        const pj = particles[j];
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        /* Squared-distance early-bail — skip sqrt for the ~95% of pairs
         * that are too far apart to draw a line between. */
        const d2 = dx*dx + dy*dy;
        if (d2 >= LINK_DIST_SQ) continue;
        const opacity = 1 - (Math.sqrt(d2) / LINK_DIST);
        ctx.beginPath();
        if (pi.isAccent || pj.isAccent) {
          ctx.strokeStyle = 'rgba(' + colors.accentLine + ', ' + (opacity * 0.5) + ')';
        } else {
          ctx.strokeStyle = 'rgba(' + colors.line + ', ' + (opacity * 0.18) + ')';
        }
        ctx.lineWidth = 0.6;
        ctx.moveTo(pi.x, pi.y);
        ctx.lineTo(pj.x, pj.y);
        ctx.stroke();
      }
    }
  }

  function renderOneFrame(){
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles){ p.update(); p.draw(); }
    drawLines();
  }

  function loop(){
    if (!running) return;
    renderOneFrame();
    animationFrameId = requestAnimationFrame(loop);
  }
  function start(){
    if (running || reduceMotion) return;
    running = true;
    loop();
  }
  function stop(){
    running = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
  }

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', function(e){ mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('mouseout', function(){ mouse.x = null; mouse.y = null; });
  /* Pause when the tab is hidden — rAF keeps firing in some browsers for
   * several seconds before throttling, and an invisible tab shouldn't
   * burn GPU. */
  document.addEventListener('visibilitychange', function(){
    if (document.hidden) stop();
    else start();
  });

  resize();
  if (reduceMotion) {
    /* Draw one static starfield so the background isn't empty. */
    renderOneFrame();
  } else {
    start();
  }
})();
`;

// ── CSS (Tailwind-equivalent, inlined) ──────────────────────

const CSS = `
/* Tokens mirror apps/admin/src/index.css in the trail repo so landing + admin
 * share one palette. Light = Bauhaus warm off-white; dark = warm inversion.
 * Graph vars are rgb triplets (consumed as rgba() by the canvas script). */
:root,
html[data-theme="light"] {
  --bg: #FAF9F5;
  --bg-card: #FFFFFF;
  --fg: #1a1715;
  --accent: #e8a87c;
  --accent-tint: rgba(232, 168, 124, 0.06);
  --fg-10: rgba(26, 23, 21, 0.10);
  --fg-20: rgba(26, 23, 21, 0.20);
  --fg-40: rgba(26, 23, 21, 0.40);
  --fg-60: rgba(26, 23, 21, 0.60);
  --fg-70: rgba(26, 23, 21, 0.70);
  --fg-90: rgba(26, 23, 21, 0.90);
  --bg-50: rgba(250, 249, 245, 0.50);
  --bg-80: rgba(250, 249, 245, 0.80);
  --graph-node: #1a1715;
  --graph-accent: #e8a87c;
  --graph-line: 26, 23, 21;
  --graph-accent-line: 232, 168, 124;
  --font-sans: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", "Fira Code", "Courier New", monospace;
}

html[data-theme="dark"] {
  --bg: #17140F;
  --bg-card: #1F1B16;
  --fg: #F5F1EA;
  --accent: #e8a87c;
  --accent-tint: rgba(232, 168, 124, 0.08);
  --fg-10: rgba(245, 241, 234, 0.10);
  --fg-20: rgba(245, 241, 234, 0.20);
  --fg-40: rgba(245, 241, 234, 0.40);
  --fg-60: rgba(245, 241, 234, 0.60);
  --fg-70: rgba(245, 241, 234, 0.70);
  --fg-90: rgba(245, 241, 234, 0.90);
  --bg-50: rgba(23, 20, 15, 0.50);
  --bg-80: rgba(23, 20, 15, 0.80);
  --graph-node: #f5f1ea;
  --graph-accent: #e8a87c;
  --graph-line: 245, 241, 234;
  --graph-accent-line: 232, 168, 124;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: var(--bg);
  transition: background-color 0.15s ease, color 0.15s ease;
}
html, body { overflow-x: hidden; max-width: 100vw; }
body {
  font-family: var(--font-sans);
  background: transparent; /* canvas (fixed, z-index: -1) renders between html and body */
  color: var(--fg);
  line-height: 1.5;
  min-height: 100vh;
}
::selection { background: rgba(232, 168, 124, 0.3); color: var(--fg); }

a { color: inherit; text-decoration: none; }
img { max-width: 100%; display: block; height: auto; }
button { font: inherit; cursor: pointer; border: none; background: none; color: inherit; }
svg { max-width: 100%; height: auto; }

/* Navbar */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  padding: 0.75rem 1rem;
  display: flex; justify-content: space-between; align-items: center;
  background: var(--bg-80);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--fg-10);
}
@media (min-width: 768px) { .nav { padding: 1rem 1.5rem; } }
.nav-brand { display: flex; align-items: center; gap: 0.625rem; min-width: 0; color: var(--fg); }
.nav-brand img, .nav-brand svg { width: 32px; height: 32px; flex-shrink: 0; }
@media (min-width: 768px) { .nav-brand { gap: 0.875rem; } .nav-brand img, .nav-brand svg { width: 40px; height: 40px; } }
.nav-brand .brand-text {
  font-family: var(--font-mono);
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (min-width: 768px) { .nav-brand .brand-text { font-size: 1.375rem; } }
.nav-links { display: none; gap: 2rem; font-size: 0.875rem; font-weight: 500; color: var(--fg-70); }
.nav-links a { transition: color 0.15s; }
.nav-links a:hover { color: var(--fg); }
@media (min-width: 768px) { .nav-links { display: flex; } }

.nav-actions { display: flex; gap: 0.5rem; align-items: center; }
@media (min-width: 768px) { .nav-actions { gap: 1rem; } }
.nav-signin {
  font-size: 0.875rem; font-weight: 500; color: var(--fg);
  transition: color 0.15s;
  display: none;
}
@media (min-width: 768px) { .nav-signin { display: inline; } }
.nav-signin:hover { color: var(--accent); }
.nav-cta {
  padding: 0.45rem 0.85rem;
  background: var(--fg); color: var(--bg);
  font-size: 0.8rem; font-weight: 500;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.2s;
  white-space: nowrap;
}
@media (min-width: 768px) { .nav-cta { padding: 0.5rem 1rem; font-size: 0.875rem; } }
.nav-cta:hover { background: var(--fg-90); border-color: var(--accent); }

/* Theme toggle — sun in dark, moon in light */
.theme-toggle {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--fg-10);
  border-radius: 6px;
  color: var(--fg-70);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.theme-toggle:hover { background: var(--bg-50); color: var(--fg); border-color: var(--fg-20); }
.theme-toggle:active { transform: scale(0.96); }
.theme-toggle svg { width: 18px; height: 18px; }
.theme-toggle .icon-sun { display: none; }
.theme-toggle .icon-moon { display: block; }
html[data-theme="dark"] .theme-toggle .icon-sun { display: block; }
html[data-theme="dark"] .theme-toggle .icon-moon { display: none; }

/* Mobile hamburger toggle */
.nav-toggle {
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 40px; height: 40px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--fg-10);
  border-radius: 6px;
  cursor: pointer;
  gap: 4px;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s;
}
.nav-toggle:hover { background: var(--bg-50); }
.nav-toggle:active { transform: scale(0.96); }
.nav-toggle span {
  display: block;
  width: 18px;
  height: 2px;
  background: var(--fg);
  border-radius: 2px;
  transition: transform 0.2s, opacity 0.2s;
}
@media (min-width: 768px) { .nav-toggle { display: none; } }
body[data-menu-open="true"] .nav-toggle span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
body[data-menu-open="true"] .nav-toggle span:nth-child(2) { opacity: 0; }
body[data-menu-open="true"] .nav-toggle span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

/* Mobile menu overlay */
.nav-mobile {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg);
  z-index: 49;
  padding: 5rem 1.5rem 2rem;
  display: flex; flex-direction: column; gap: 1.5rem;
  transform: translateX(100%);
  transition: transform 0.25s ease-out;
  overflow-y: auto;
}
body[data-menu-open="true"] .nav-mobile { transform: translateX(0); }
@media (min-width: 768px) { .nav-mobile { display: none; } }
.nav-mobile a {
  font-size: 1.125rem; font-weight: 500; color: var(--fg);
  padding: 0.625rem 0;
  border-bottom: 1px solid var(--fg-10);
}
.nav-mobile a:last-child { border-bottom: none; }
body[data-menu-open="true"] { overflow: hidden; }

/* Hero */
.hero {
  position: relative;
  min-height: 100vh;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  padding-top: 5rem; overflow: hidden;
}
#trail-graph {
  position: fixed; inset: 0;
  pointer-events: none; opacity: 0.4; z-index: -1;
}
.hero-inner {
  position: relative; z-index: 10;
  max-width: 56rem; margin: 0 auto;
  padding: 0 2rem;
  text-align: center;
  width: 100%;
}
@media (min-width: 640px) { .hero-inner { padding: 0 2.5rem; } }
.eyebrow {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.25rem 0.75rem; margin-bottom: 2rem;
  border: 1px solid var(--fg-20); border-radius: 9999px;
  font-size: 0.75rem; font-family: var(--font-mono);
  background: var(--bg-50); backdrop-filter: blur(4px);
}
.eyebrow .dot {
  width: 0.5rem; height: 0.5rem; border-radius: 9999px;
  background: var(--accent);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.hero h1 {
  font-size: clamp(2.5rem, 7vw, 4.5rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.1;
  margin-bottom: 1.5rem;
}
.hero h1 .accent {
  background: linear-gradient(to right, var(--fg), rgba(232, 168, 124, 0.8));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.hero p.lead {
  font-size: 1.125rem;
  color: var(--fg-70);
  margin: 0 auto 2.5rem; max-width: 40rem;
  line-height: 1.6;
}
@media (min-width: 768px) { .hero p.lead { font-size: 1.25rem; } }

.cta-group {
  display: flex; flex-direction: column; gap: 1rem;
  justify-content: center; align-items: center;
}
@media (min-width: 640px) { .cta-group { flex-direction: row; } }

.btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-weight: 500;
  transition: all 0.2s;
}
.btn-primary {
  background: var(--fg); color: var(--bg);
}
.btn-primary:hover {
  background: var(--fg-90);
  box-shadow: 0 10px 25px -5px rgba(232, 168, 124, 0.2);
}
.btn-secondary {
  background: transparent; border: 1px solid var(--fg-20);
  color: var(--fg);
  font-family: var(--font-mono); font-size: 0.875rem;
}
.btn-secondary:hover { border-color: var(--fg); }

.scroll-indicator {
  position: absolute; bottom: 2rem; left: 50%;
  transform: translateX(-50%);
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--fg-20);
  border-radius: 9999px;
  color: var(--fg-60);
  opacity: 0.7;
  animation: scroll-hint 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  transition: opacity 0.2s, border-color 0.2s;
}
.scroll-indicator:hover { opacity: 1; border-color: var(--fg); color: var(--fg); }
.scroll-indicator svg { width: 14px; height: 14px; }
@keyframes scroll-hint {
  0%, 100% { transform: translate(-50%, 0); }
  50%      { transform: translate(-50%, 6px); }
}

/* Features */
.features {
  padding: 4rem 2rem;
  border-top: 1px solid var(--fg-10);
}
@media (min-width: 768px) { .features { padding: 6rem 1.5rem; } }
.features-inner { max-width: 72rem; margin: 0 auto; }
.features-header { margin-bottom: 4rem; }
.features-header h2 {
  font-size: clamp(1.75rem, 3.5vw, 2rem);
  font-weight: 700; letter-spacing: -0.02em; margin-bottom: 1rem;
}
.features-header p {
  color: var(--fg-60); max-width: 36rem;
}
.features-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.25rem;
}
@media (min-width: 768px) { .features-grid { grid-template-columns: repeat(3, 1fr); } }

.feature-card {
  position: relative; overflow: hidden;
  padding: 1.5rem;
  border: 1px solid var(--fg-10);
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  transition: background 0.2s;
}
.feature-card:hover { background: color-mix(in srgb, var(--bg-card) 90%, transparent); }
.feature-card::before {
  content: "";
  position: absolute; top: 0; left: 0;
  width: 100%; height: 2px;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.3s;
}
.feature-card:hover::before { transform: scaleX(1); }
.feature-card .icon { margin-bottom: 1rem; color: var(--fg); }
.feature-card h3 {
  font-family: var(--font-mono);
  font-size: 1.125rem; font-weight: 600;
  letter-spacing: -0.02em; margin-bottom: 0.5rem;
  color: var(--fg);
}
.feature-card p {
  color: var(--fg-70);
  font-size: 0.875rem; line-height: 1.6;
}

/* Article (long-form pages) */
.container { max-width: 48rem; margin: 0 auto; padding: 0 2rem; }
@media (min-width: 640px) { .container { padding: 0 2.5rem; } }
/* Use padding-block (top/bottom only) so .container's horizontal padding survives. */
.article { padding-top: 6rem; padding-bottom: 3rem; }
@media (min-width: 768px) { .article { padding-top: 7rem; padding-bottom: 4rem; } }
.article-header { margin-bottom: 3rem; border-bottom: 1px solid var(--fg-10); padding-bottom: 2rem; }
.article-eyebrow {
  font-family: var(--font-mono);
  font-size: 0.75rem; letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 1rem;
}
.article-header h1 {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.1;
  margin-bottom: 1rem;
}
.article-lead {
  font-size: 1.125rem;
  color: var(--fg-70);
  line-height: 1.6;
  margin-bottom: 1.25rem;
}
.article-meta {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--fg-60);
}
.article-tags { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 1rem; }
.article-tags .tag {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--fg-10);
  border-radius: 9999px;
  color: var(--fg-60);
}
.article-cover { margin: 2rem 0 0; }
.article-cover img { width: 100%; border-radius: 4px; }

.prose { font-size: 1.0625rem; line-height: 1.75; color: var(--fg); word-wrap: break-word; overflow-wrap: break-word; }
.prose h1, .prose h2, .prose h3 { letter-spacing: -0.02em; }
.prose h2 { font-size: 1.625rem; font-weight: 700; margin: 3rem 0 1rem; }
.prose h3 { font-size: 1.25rem; font-weight: 600; margin: 2rem 0 0.75rem; }
.prose p { margin-bottom: 1.25rem; }
.prose strong { font-weight: 600; }
.prose em { font-style: italic; }
.prose a { color: var(--fg); border-bottom: 1px solid var(--accent); transition: color 0.15s; }
.prose a:hover { color: var(--accent); }
.prose blockquote {
  border-left: 3px solid var(--accent);
  padding: 0.5rem 0 0.5rem 1.25rem;
  margin: 1.75rem 0;
  color: var(--fg-70);
  font-style: italic;
}
.prose blockquote p:last-child { margin-bottom: 0; }
.prose ul, .prose ol { padding-left: 1.5rem; margin-bottom: 1.25rem; }
.prose li { margin-bottom: 0.5rem; }
.prose code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  background: var(--fg-10);
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}
.prose pre {
  background: var(--fg); color: var(--bg);
  padding: 1rem 1.25rem;
  border-radius: 4px;
  overflow-x: auto;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
}
.prose pre code { background: none; padding: 0; color: inherit; }
.prose hr { border: none; border-top: 1px solid var(--fg-10); margin: 3rem 0; }
.prose figure {
  margin: 1rem 0 1.5rem;
  text-align: center;
  color: var(--fg); /* inline SVGs use currentColor so strokes/text swap with theme */
}
.prose figure svg { width: 100%; height: auto; display: block; }

/* Fullscreen view for SVG figures — click to zoom, Escape to close */
.prose .cms-svg { cursor: zoom-in; transition: opacity 0.15s; }
.prose .cms-svg:hover { opacity: 0.85; }
.svg-fullscreen {
  position: fixed; inset: 0; z-index: 100;
  background: color-mix(in srgb, var(--bg) 96%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: none;
  padding: 4rem 2rem 2rem;
  cursor: zoom-out;
  overflow-y: auto;
}
.svg-fullscreen[data-open="true"] {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1.25rem;
}
.svg-fullscreen-content {
  max-width: 96vw; max-height: 82vh;
  display: flex; align-items: center; justify-content: center;
}
.svg-fullscreen-content svg {
  width: auto; height: auto;
  max-width: 96vw; max-height: 82vh;
}
.svg-fullscreen-caption {
  font-family: var(--font-mono); font-size: 0.85rem;
  color: var(--fg-70); max-width: 48rem; text-align: center; line-height: 1.5;
  padding: 0 1rem;
}
.svg-fullscreen-close {
  position: fixed; top: 1.25rem; right: 1.25rem;
  width: 40px; height: 40px;
  padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--bg-80);
  border: 1px solid var(--fg-20);
  border-radius: 50%;
  color: var(--fg);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
}
.svg-fullscreen-close svg { display: block; }
.svg-fullscreen-close:hover { background: var(--fg-10); border-color: var(--accent); }
.svg-fullscreen-close:active { transform: scale(0.95); }
.prose figcaption {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--fg-60);
  margin-top: 0.75rem;
  line-height: 1.5;
}
.prose img { max-width: 100%; border-radius: 4px; margin: 1.5rem auto; }

/* Footer */
.footer {
  border-top: 1px solid var(--fg-10);
  padding: 2.5rem 2rem;
  background: var(--bg);
}
@media (min-width: 768px) { .footer { padding: 3rem 1.5rem; } }
.footer-inner {
  max-width: 72rem; margin: 0 auto;
  display: flex; flex-direction: column;
  gap: 1.5rem; align-items: center;
  justify-content: space-between;
}
@media (min-width: 768px) { .footer-inner { flex-direction: row; } }
.footer-brand { display: flex; align-items: center; gap: 0.625rem; color: var(--fg); }
.footer-brand img, .footer-brand svg { width: 32px; height: 32px; }
.footer-brand span {
  font-family: var(--font-mono);
  font-size: 1rem; font-weight: 600;
}
.footer-links { display: flex; gap: 1.5rem; font-family: var(--font-mono); font-size: 0.875rem; color: var(--fg-60); }
.footer-links a { transition: color 0.15s; }
.footer-links a:hover { color: var(--accent); }
.footer-copy { font-family: var(--font-mono); font-size: 0.75rem; color: var(--fg-40); }
.footer-copy a { color: var(--fg-60); border-bottom: 1px dotted var(--fg-20); transition: color 0.15s, border-color 0.15s; }
.footer-copy a:hover { color: var(--accent); border-bottom-color: var(--accent); }

/* Clickable article tags (reused by pages) */
.article-tags .tag { transition: color 0.15s, border-color 0.15s; }
.article-tags .tag:hover { color: var(--accent); border-color: var(--accent); }

/* Trails index + category pages */
.trails-section { margin: 3rem 0; }
.trails-section-header {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 1rem; margin-bottom: 1.25rem;
  border-bottom: 1px solid var(--fg-10); padding-bottom: 0.5rem;
}
.trails-section-header h2 {
  font-size: 1.375rem; font-weight: 700; letter-spacing: -0.02em;
}
.trails-section-link {
  font-family: var(--font-mono); font-size: 0.75rem;
  color: var(--fg-60); letter-spacing: 0.06em;
  transition: color 0.15s;
}
.trails-section-link:hover { color: var(--accent); }
.post-empty { color: var(--fg-60); font-style: italic; margin: 2rem 0; }

.post-grid {
  display: grid; grid-template-columns: 1fr;
  gap: 0.25rem;
}
@media (min-width: 640px) { .post-grid { grid-template-columns: repeat(2, 1fr); } }
.post-card {
  display: flex; flex-direction: column; gap: 0.5rem;
  padding: 1.25rem;
  border: 1px solid var(--fg-10);
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  transition: background 0.2s, border-color 0.2s;
  position: relative; overflow: hidden;
}
.post-card::before {
  content: "";
  position: absolute; top: 0; left: 0;
  width: 100%; height: 2px; background: var(--accent);
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.3s;
}
.post-card:hover { background: var(--bg-card); border-color: var(--fg-20); }
.post-card:hover::before { transform: scaleX(1); }
.post-card-eyebrow {
  font-family: var(--font-mono); font-size: 0.7rem;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--accent);
}
.post-card h3 {
  font-size: 1.125rem; font-weight: 600;
  letter-spacing: -0.02em; line-height: 1.3;
}
.post-card p {
  color: var(--fg-70); font-size: 0.9rem; line-height: 1.55;
  margin: 0;
}
.post-card-meta {
  font-family: var(--font-mono); font-size: 0.7rem;
  color: var(--fg-60); margin-top: auto; padding-top: 0.25rem;
}

/* Post footer (below prose): bottom tag pills + "more from category" */
.post-footer {
  margin: 3rem 0 0;
  padding-top: 2rem;
  border-top: 1px solid var(--fg-10);
}
.post-tags {
  display: flex; flex-wrap: wrap; gap: 0.5rem;
  margin-bottom: 1.5rem;
}
.post-tag {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  padding: 0.3rem 0.75rem;
  border: 1px solid var(--fg-20);
  border-radius: 9999px;
  color: var(--fg-70);
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.post-tag:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-tint);
}
.post-more {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  letter-spacing: 0.06em;
  color: var(--fg-60);
  transition: color 0.15s;
}
.post-more:hover { color: var(--accent); }

.post-related {
  margin-bottom: 1.75rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--fg-10);
}
.post-related-label {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--fg-60);
  margin-bottom: 0.75rem;
}
.post-related ul { list-style: none; padding: 0; margin: 0; }
.post-related li { margin: 0.4rem 0; }
.post-related a {
  font-size: 1rem;
  color: var(--fg);
  border-bottom: 1px solid var(--fg-10);
  padding-bottom: 0.15rem;
  transition: color 0.15s, border-color 0.15s;
}
.post-related a:hover { color: var(--accent); border-bottom-color: var(--accent); }
.post-related-arrow {
  color: var(--fg-60);
  margin-left: 0.25rem;
  transition: color 0.15s, transform 0.15s;
  display: inline-block;
}
.post-related a:hover .post-related-arrow { color: var(--accent); transform: translateX(3px); }
`;

// ── Rendering ───────────────────────────────────────────────

function renderHero(b: Block): string {
  const ctas = (b.ctas as Array<{ label: string; href: string; variant?: string }>) ?? [];
  const showScroll = b.showScrollIndicator !== false;

  const titleLine1 = esc(b.titleLine1);
  const titleLine2 = b.titleLine2 ? `<br/><span class="accent">${esc(b.titleLine2)}</span>` : "";

  const ctaHtml = ctas
    .map((c, i) => {
      const isPrimary = (c.variant ?? (i === 0 ? "primary" : "secondary")) === "primary";
      const iconSvgStr = isPrimary ? ARROW_SVG : BOOK_SVG;
      const cls = isPrimary ? "btn btn-primary" : "btn btn-secondary";
      return `<a href="${esc(bp(c.href || "#"))}" class="${cls}">${esc(c.label)}${iconSvgStr}</a>`;
    })
    .join("");

  return `<main class="hero">
    <div class="hero-inner">
      ${
        b.eyebrow
          ? `<div class="eyebrow"><span class="dot"></span><span>${esc(b.eyebrow)}</span></div>`
          : ""
      }
      <h1>${titleLine1}${titleLine2}</h1>
      ${b.description ? `<p class="lead">${esc(b.description)}</p>` : ""}
      ${ctaHtml ? `<div class="cta-group">${ctaHtml}</div>` : ""}
    </div>
    ${showScroll ? `<a class="scroll-indicator" href="#features" aria-label="Scroll to content"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg></a>` : ""}
  </main>`;
}

function renderFeatures(b: Block): string {
  const items = (b.items as Array<{ icon: string; title: string; description: string }>) ?? [];
  return `<section id="features" class="features">
    <div class="features-inner">
      <div class="features-header">
        ${b.title ? `<h2>${esc(b.title)}</h2>` : ""}
        ${b.description ? `<p>${esc(b.description)}</p>` : ""}
      </div>
      <div class="features-grid">
        ${items
          .map(
            (item) => `<div class="feature-card">
          <div class="icon">${iconSvg(item.icon)}</div>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.description)}</p>
        </div>`,
          )
          .join("")}
      </div>
    </div>
  </section>`;
}

function renderBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  return (blocks as Block[])
    .map((block) => {
      switch (block._block) {
        case "hero":
          return renderHero(block);
        case "features":
          return renderFeatures(block);
        default:
          return "";
      }
    })
    .join("\n");
}

// Shortcodes ({{svg:slug}}, {{snippet:slug}}, !!INTERACTIVE[...], !!FILE[...],
// !!MAP[...]) are expanded via @webhouse/cms's shared helper. SVG figures
// live in public/uploads/svg/ so the CMS admin Shapes picker can browse them.
const UPLOADS_DIR = join(import.meta.dirname, "public", "uploads");
const SVG_CAPTIONS: Record<string, string> = existsSync(join(UPLOADS_DIR, "svg", "captions.json"))
  ? JSON.parse(readFileSync(join(UPLOADS_DIR, "svg", "captions.json"), "utf-8"))
  : {};

function renderContent(raw: unknown): string {
  const s = String(raw ?? "");
  if (!s) return "";
  const html = /^\s*</.test(s) ? s : (marked.parse(s, { async: false }) as string);
  return expandShortcodes(html, {
    basePath: BASE_PATH,
    uploadsDir: UPLOADS_DIR,
    svgDir: "svg",
    svgCaptions: SVG_CAPTIONS,
  });
}

interface ArticleMeta {
  title?: unknown;
  excerpt?: unknown;
  date?: unknown;
  author?: unknown;
  category?: unknown;
  tags?: unknown;
  coverImage?: unknown;
}

function renderArticle(data: ArticleMeta, slug: string): string {
  const title = String(data.title ?? "");
  const excerpt = String(data.excerpt ?? "");
  const date = String(data.date ?? "");
  const author = String(data.author ?? "");
  const category = String(data.category ?? "");
  const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
  const coverImage = String(data.coverImage ?? "");
  const cover = coverImage
    ? `<figure class="article-cover"><img src="${esc(bp(coverImage))}" alt="${esc(title)}" /></figure>`
    : "";
  const dateStr = date
    ? new Date(date).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const metaLine = [category, author, dateStr].filter(Boolean).map(esc).join(" · ");
  void tags; // tags render at bottom via renderPostFooter
  return `<header class="article-header">
      ${category ? `<div class="article-eyebrow">${esc(category)}</div>` : ""}
      <h1>${esc(title)}</h1>
      ${excerpt ? `<p class="article-lead">${esc(excerpt)}</p>` : ""}
      ${metaLine ? `<div class="article-meta">${metaLine}</div>` : ""}
      ${cover}
    </header>`;
}

// ── Post + category helpers ─────────────────────────────────

interface CategoryData {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  order?: unknown;
}

function categoryOf(post: Doc): Doc | undefined {
  const ref = String(post.data.category ?? "");
  if (!ref) return undefined;
  return categories.find((c) => c.slug === ref || String(c.data.slug ?? "") === ref);
}

function postUrl(post: Doc): string {
  const cat = categoryOf(post);
  const catSlug = cat ? String(cat.data.slug ?? cat.slug) : "uncategorized";
  return bp(`/trails/${catSlug}/${post.slug}/`);
}

function sortedCategories(): Doc[] {
  return [...categories].sort((a, b) => {
    const oa = Number(a.data.order ?? 999);
    const ob = Number(b.data.order ?? 999);
    if (oa !== ob) return oa - ob;
    return String(a.data.name ?? a.slug).localeCompare(String(b.data.name ?? b.slug));
  });
}

function postsInCategory(catSlug: string): Doc[] {
  return posts
    .filter((p) => {
      const ref = String(p.data.category ?? "");
      return ref === catSlug;
    })
    .sort((a, b) => String(b.data.date ?? "").localeCompare(String(a.data.date ?? "")));
}

function sortedPosts(): Doc[] {
  return [...posts].sort((a, b) => String(b.data.date ?? "").localeCompare(String(a.data.date ?? "")));
}

function collectTags(postList: Doc[]): Map<string, Doc[]> {
  const map = new Map<string, Doc[]>();
  for (const p of postList) {
    const tags = Array.isArray(p.data.tags) ? (p.data.tags as string[]) : [];
    for (const t of tags) {
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(p);
    }
  }
  return map;
}

function isPost(doc: Doc): boolean {
  return posts.includes(doc);
}

function docUrl(doc: Doc): string {
  return isPost(doc) ? postUrl(doc) : bp(`/${doc.slug}/`);
}

function docCategoryLabel(doc: Doc): string {
  if (isPost(doc)) {
    const cat = categoryOf(doc);
    return cat ? String(cat.data.name ?? cat.slug) : "";
  }
  return String(doc.data.category ?? "");
}

function renderPostCard(doc: Doc): string {
  const title = String(doc.data.title ?? doc.slug);
  const excerpt = String(doc.data.excerpt ?? "");
  const date = String(doc.data.date ?? "");
  const readTime = String(doc.data.readTime ?? "");
  const catLabel = docCategoryLabel(doc);
  const dateStr = date
    ? new Date(date).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const meta = [catLabel, dateStr, readTime].filter(Boolean).map(esc).join(" · ");
  return `<a class="post-card" href="${esc(docUrl(doc))}">
    ${catLabel ? `<div class="post-card-eyebrow">${esc(catLabel)}</div>` : ""}
    <h3>${esc(title)}</h3>
    ${excerpt ? `<p>${esc(excerpt)}</p>` : ""}
    ${meta ? `<div class="post-card-meta">${meta}</div>` : ""}
  </a>`;
}

function normalizeRefs(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  const s = String(raw);
  return s ? [s] : [];
}

function renderRelatedLinks(post: Doc): string {
  const pageRefs = normalizeRefs(post.data.relatedPages);
  const postRefs = normalizeRefs(post.data.relatedPosts);
  const items: string[] = [];
  for (const ref of pageRefs) {
    const p = pages.find((x) => x.slug === ref || String(x.data.id ?? "") === ref);
    if (!p) continue;
    const title = String(p.data.title ?? p.slug);
    items.push(`<li><a href="${esc(bp(`/${p.slug}/`))}">${esc(title)} <span class="post-related-arrow">→</span></a></li>`);
  }
  for (const ref of postRefs) {
    const p = posts.find((x) => x.slug === ref || String(x.data.id ?? "") === ref);
    if (!p) continue;
    const title = String(p.data.title ?? p.slug);
    items.push(`<li><a href="${esc(postUrl(p))}">${esc(title)} <span class="post-related-arrow">→</span></a></li>`);
  }
  if (!items.length) return "";
  return `<div class="post-related">
    <div class="post-related-label">Related</div>
    <ul>${items.join("")}</ul>
  </div>`;
}

function renderTagPills(doc: Doc): string {
  const tags = Array.isArray(doc.data.tags) ? (doc.data.tags as string[]) : [];
  if (!tags.length) return "";
  return `<div class="post-tags">${tags
    .map((t) => `<a class="post-tag" href="${esc(bp(`/tags/${t}/`))}">#${esc(t)}</a>`)
    .join("")}</div>`;
}

function renderPostFooter(post: Doc): string {
  const cat = categoryOf(post);
  const more = cat
    ? `<a class="post-more" href="${esc(bp(`/trails/${String(cat.data.slug ?? cat.slug)}/`))}">← MORE FROM ${esc(String(cat.data.name ?? cat.slug).toUpperCase())}</a>`
    : `<a class="post-more" href="${esc(bp("/trails/"))}">← MORE FROM TRAILS</a>`;
  return `<div class="post-footer">${renderRelatedLinks(post)}${renderTagPills(post)}${more}</div>`;
}

function renderPageFooter(page: Doc): string {
  const related = renderRelatedLinks(page);
  const tagPills = renderTagPills(page);
  if (!related && !tagPills) return "";
  return `<div class="post-footer">${related}${tagPills}</div>`;
}

function renderCategoryHeader(cat: Doc): string {
  const name = String(cat.data.name ?? cat.slug);
  const desc = String(cat.data.description ?? "");
  return `<header class="article-header">
    <div class="article-eyebrow">Trails</div>
    <h1>${esc(name)}</h1>
    ${desc ? `<p class="article-lead">${esc(desc)}</p>` : ""}
  </header>`;
}

function renderPostGrid(postList: Doc[]): string {
  if (!postList.length) return `<p class="post-empty">No posts yet.</p>`;
  return `<div class="post-grid">${postList.map(renderPostCard).join("")}</div>`;
}

function renderTrailsIndex(): string {
  const cats = sortedCategories();
  const sections = cats
    .map((c) => {
      const list = postsInCategory(String(c.data.slug ?? c.slug));
      if (!list.length) return "";
      return `<section class="trails-section">
        <div class="trails-section-header">
          <h2>${esc(String(c.data.name ?? c.slug))}</h2>
          <a class="trails-section-link" href="${esc(bp(`/trails/${String(c.data.slug ?? c.slug)}/`))}">All ${esc(String(c.data.name ?? c.slug))} →</a>
        </div>
        ${renderPostGrid(list)}
      </section>`;
    })
    .filter(Boolean)
    .join("");
  const header = `<header class="article-header">
    <div class="article-eyebrow">Trails</div>
    <h1>Trails</h1>
    <p class="article-lead">Essays, field notes, and dispatches from inside a knowledge engine that compiles instead of retrieves.</p>
  </header>`;
  const body = sections || `<p class="post-empty">No posts published yet.</p>`;
  return `<article class="article container">${header}${body}</article>`;
}

// ── Global data ─────────────────────────────────────────────

const siteTitle = String(global.siteTitle ?? "trail");
const siteDescription = String(global.siteDescription ?? "");
const logo = String(global.logo ?? "/uploads/memx-logo.svg");

// If the logo is a local SVG, inline it so currentColor inherits from the
// parent (theme-aware). External URLs or non-SVG assets fall back to <img>.
function renderLogo(size: number, label: string): string {
  const isLocalSvg = logo.startsWith("/uploads/") && logo.endsWith(".svg");
  if (isLocalSvg) {
    const file = join(import.meta.dirname, "public", logo);
    if (existsSync(file)) {
      let raw = readFileSync(file, "utf-8").trim();
      // Defense-in-depth: swap any surviving hardcoded #1a1715 strokes/fills
      // with currentColor so the inlined copy is always theme-aware.
      raw = raw.replace(/#1a1715/gi, "currentColor");
      // Rewrite the root <svg> tag: keep only viewBox from the original,
      // strip all other attrs, then inject size + a11y attrs cleanly.
      raw = raw.replace(/<svg[^>]*>/, (match) => {
        const vbMatch = match.match(/viewBox="[^"]*"/i);
        const viewBox = vbMatch ? vbMatch[0] : 'viewBox="0 0 32 32"';
        return `<svg xmlns="http://www.w3.org/2000/svg" ${viewBox} width="${size}" height="${size}" role="img" aria-label="${esc(label)}">`;
      });
      return raw;
    }
  }
  return `<img src="${esc(bp(logo))}" alt="${esc(label)}" width="${size}" height="${size}">`;
}
const navLinks = (global.navLinks as Array<{ label: string; href: string }>) ?? [];
const signInLabel = String(global.signInLabel ?? "Sign In");
const signInHref = String(global.signInHref ?? "#");
const navCtaLabel = String(global.navCtaLabel ?? "Initialize Node");
const navCtaHref = String(global.navCtaHref ?? "#");
const footerLinks = (global.footerLinks as Array<{ label: string; href: string }>) ?? [];
const footerCopyright = String(global.footerCopyright ?? `© ${new Date().getFullYear()} ${siteTitle}.`);
const footerTagline = String(global.footerTagline ?? "");

// ── Layout ──────────────────────────────────────────────────

function layout(title: string, content: string, metaDesc?: string): string {
  const desc = metaDesc ?? siteDescription;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — ${esc(siteTitle)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <link rel="icon" type="image/svg+xml" href="${esc(bp("/uploads/favicon.svg"))}">
  <link rel="apple-touch-icon" href="${esc(bp(logo))}">
  <meta name="theme-color" content="#FAF9F5">
  <script>
    /* Apply theme before first paint to avoid flash. Mirrors admin's
     * theme store (localStorage key 'trail.theme'), default light. */
    (function(){try{var t=localStorage.getItem('trail.theme');document.documentElement.setAttribute('data-theme', t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();
  </script>
  <style>${CSS}</style>
</head>
<body>
  <canvas id="trail-graph" aria-hidden="true"></canvas>
  <nav class="nav">
    <a href="${esc(bp("/"))}" class="nav-brand">
      ${renderLogo(40, siteTitle)}
      <span class="brand-text">${esc(siteTitle)}</span>
    </a>
    <div class="nav-links">
      ${navLinks
        .map((l) => `<a href="${esc(bp(l.href))}">${esc(l.label)}</a>`)
        .join("\n      ")}
    </div>
    <div class="nav-actions">
      <button type="button" class="theme-toggle" aria-label="Toggle theme">
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      </button>
      <a href="${esc(bp(signInHref))}" class="nav-signin">${esc(signInLabel)}</a>
      <a href="${esc(bp(navCtaHref))}" class="nav-cta">${esc(navCtaLabel)}</a>
      <button type="button" class="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>
  <div id="mobile-menu" class="nav-mobile" role="navigation" aria-label="Mobile menu" aria-hidden="true">
    ${navLinks
      .map((l) => `<a href="${esc(bp(l.href))}">${esc(l.label)}</a>`)
      .join("\n    ")}
    <a href="${esc(bp(signInHref))}">${esc(signInLabel)}</a>
  </div>
  <script>
    (function () {
      var btn = document.querySelector('.nav-toggle');
      var menu = document.getElementById('mobile-menu');
      var body = document.body;
      if (!btn || !menu) return;
      function setOpen(open) {
        body.dataset.menuOpen = open ? 'true' : 'false';
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      }
      btn.addEventListener('click', function () { setOpen(body.dataset.menuOpen !== 'true'); });
      menu.addEventListener('click', function (e) {
        if (e.target instanceof HTMLAnchorElement) setOpen(false);
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    })();

    (function () {
      var tbtn = document.querySelector('.theme-toggle');
      if (!tbtn) return;
      tbtn.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        var next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('trail.theme', next); } catch (e) {}
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', next === 'dark' ? '#17140F' : '#FAF9F5');
      });
    })();

    function initSvgFullscreen() {
      var figures = document.querySelectorAll('.prose .cms-svg');
      if (!figures.length) return;
      var overlay = document.createElement('div');
      overlay.className = 'svg-fullscreen';
      overlay.setAttribute('data-open', 'false');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Enlarged figure');
      overlay.innerHTML = '<button type="button" class="svg-fullscreen-close" aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg></button><div class="svg-fullscreen-content"></div><div class="svg-fullscreen-caption"></div>';
      document.body.appendChild(overlay);
      var contentEl = overlay.querySelector('.svg-fullscreen-content');
      var captionEl = overlay.querySelector('.svg-fullscreen-caption');
      var closeBtn = overlay.querySelector('.svg-fullscreen-close');
      function close() {
        overlay.setAttribute('data-open', 'false');
        contentEl.innerHTML = '';
        captionEl.textContent = '';
        document.body.style.overflow = '';
      }
      function open(fig) {
        var svg = fig.querySelector('svg');
        var caption = fig.querySelector('figcaption');
        if (!svg) return;
        contentEl.innerHTML = svg.outerHTML;
        var placed = contentEl.querySelector('svg');
        var vb = placed.getAttribute('viewBox');
        if (vb) {
          var parts = vb.split(/\s+|,/).map(Number);
          var ratio = parts[2] / parts[3];
          var vw = window.innerWidth;
          var vh = window.innerHeight - 140; /* room for caption + close */
          var maxW = vw * 0.96;
          var maxH = vh * 0.90;
          var w, h;
          if (maxW / ratio <= maxH) { w = maxW; h = maxW / ratio; }
          else { h = maxH; w = maxH * ratio; }
          placed.style.width = w + 'px';
          placed.style.height = h + 'px';
        }
        captionEl.textContent = caption ? caption.textContent : '';
        overlay.setAttribute('data-open', 'true');
        document.body.style.overflow = 'hidden';
      }
      figures.forEach(function (fig) {
        fig.setAttribute('role', 'button');
        fig.setAttribute('tabindex', '0');
        fig.setAttribute('aria-label', 'View figure in fullscreen');
        fig.addEventListener('click', function () { open(fig); });
        fig.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(fig); }
        });
      });
      closeBtn.addEventListener('click', function (e) { e.stopPropagation(); close(); });
      overlay.addEventListener('click', function () { close(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay.getAttribute('data-open') === 'true') close();
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSvgFullscreen);
    } else {
      initSvgFullscreen();
    }
  </script>
  ${content}
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        ${renderLogo(32, siteTitle)}
        <span>${esc(siteTitle)}</span>
      </div>
      <div class="footer-links">
        ${footerLinks
          .map((l) => `<a href="${esc(bp(l.href))}">${esc(l.label)}</a>`)
          .join("\n        ")}
      </div>
      <div class="footer-copy">${esc(footerCopyright)}${footerTagline ? ` ${esc(footerTagline)}` : ""} Site built by <a href="https://webhouse.app" target="_blank" rel="noopener">@webhouse/cms</a></div>
    </div>
  </footer>
  <script>${CANVAS_SCRIPT}</script>
</body>
</html>`;
}

// ── Write ───────────────────────────────────────────────────

function write(relPath: string, html: string): void {
  const fullPath = join(import.meta.dirname, OUT_DIR, relPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, html);
  console.log(`  ${relPath}`);
}

// ── Build ───────────────────────────────────────────────────

console.log(`Building ${siteTitle} → ${OUT_DIR}/\n`);

const home = pages.find((p) => p.slug === "home");
const homeHtml = home
  ? renderBlocks(home.data.sections)
  : `<main class="hero"><div class="hero-inner"><h1>${esc(siteTitle)}</h1><p class="lead">${esc(siteDescription)}</p></div></main>`;

const homeTitle = home ? String(home.data.title ?? siteTitle) : siteTitle;
const homeDesc = home ? String(home.data.metaDescription ?? siteDescription) : siteDescription;
write("index.html", layout(homeTitle, homeHtml, homeDesc));

// Other pages (non-home)
for (const page of pages) {
  if (page.slug === "home") continue;
  const blocksHtml = renderBlocks(page.data.sections);
  const bodyHtml = renderContent(page.data.content);
  const hasLongForm = !!bodyHtml;
  const header = hasLongForm ? renderArticle(page.data, page.slug) : "";
  const footer = hasLongForm ? renderPageFooter(page) : "";
  const inner = hasLongForm
    ? `<article class="article container">${header}<div class="prose">${bodyHtml}</div>${footer}</article>`
    : blocksHtml;
  const fullContent = blocksHtml && hasLongForm ? `${blocksHtml}${inner}` : inner || blocksHtml;
  const desc = String(page.data.metaDescription ?? page.data.excerpt ?? siteDescription);
  write(`${page.slug}/index.html`, layout(String(page.data.title), fullContent, desc));
}

// Trails index (/trails/)
const trailsIndexHtml = renderTrailsIndex();
write(
  `trails/index.html`,
  layout(
    `Trails`,
    trailsIndexHtml,
    `Essays, field notes, and dispatches from the trail knowledge engine.`,
  ),
);

// Category index pages (/trails/<category-slug>/)
for (const cat of sortedCategories()) {
  const catSlug = String(cat.data.slug ?? cat.slug);
  const list = postsInCategory(catSlug);
  const header = renderCategoryHeader(cat);
  const body = renderPostGrid(list);
  const html = `<article class="article container">${header}${body}</article>`;
  const catName = String(cat.data.name ?? cat.slug);
  const desc = String(cat.data.description ?? `Posts in ${catName}.`);
  write(`trails/${catSlug}/index.html`, layout(catName, html, desc));
}

// Individual posts (/trails/<category-slug>/<post-slug>/)
for (const post of posts) {
  const cat = categoryOf(post);
  const catSlug = cat ? String(cat.data.slug ?? cat.slug) : "uncategorized";
  const catName = cat ? String(cat.data.name ?? cat.slug) : "";
  const header = renderArticle({ ...post.data, category: catName }, post.slug);
  const bodyHtml = renderContent(post.data.content);
  const footer = renderPostFooter(post);
  const inner = `<article class="article container">${header}<div class="prose">${bodyHtml}</div>${footer}</article>`;
  const desc = String(post.data.excerpt ?? siteDescription);
  write(
    `trails/${catSlug}/${post.slug}/index.html`,
    layout(String(post.data.title ?? post.slug), inner, desc),
  );
}

// Tag index pages (/tags/<tag>/) — across both posts AND pages, so tag pills
// on long-form pages (e.g. the-1945-concept essay) resolve instead of 404.
const tagMap = collectTags([...posts, ...pages]);
for (const [tag, list] of tagMap) {
  const header = `<header class="article-header">
    <div class="article-eyebrow">Tag</div>
    <h1>#${esc(tag)}</h1>
    <p class="article-lead">${list.length} item${list.length === 1 ? "" : "s"} tagged <code>${esc(tag)}</code>.</p>
  </header>`;
  const body = renderPostGrid(list.sort((a, b) => String(b.data.date ?? "").localeCompare(String(a.data.date ?? ""))));
  const html = `<article class="article container">${header}${body}</article>`;
  write(`tags/${tag}/index.html`, layout(`#${tag}`, html, `Content tagged ${tag}.`));
}

// Copy uploads
if (existsSync(join(import.meta.dirname, "public", "uploads"))) {
  cpSync(
    join(import.meta.dirname, "public", "uploads"),
    join(import.meta.dirname, OUT_DIR, "uploads"),
    { recursive: true },
  );
  console.log("  uploads/ copied");
}

const totalPages = pages.length + 1 + categories.length + posts.length + tagMap.size;
console.log(`\nDone! ${totalPages} page(s) → ${OUT_DIR}/ (${pages.length} pages, 1 trails index, ${categories.length} categories, ${posts.length} posts, ${tagMap.size} tags)`);
