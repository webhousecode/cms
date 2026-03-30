import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
const BASE = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
const DIST = path.join(ROOT, process.env.BUILD_OUT_DIR ?? 'dist');
const CONTENT = path.join(ROOT, 'content');

interface Doc<T = Record<string, unknown>> {
  slug: string;
  status: string;
  locale?: string;
  translationGroup?: string;
  data: T;
}

interface GlobalData {
  siteTitle: string;
  tagline: string;
  metaDescription: string;
  heroHeadline: string;
  heroSubline: string;
  ctaPrimary: string;
  ctaSecondary: string;
  footerText: string;
  navItems: string;
}

interface PageData {
  title: string;
  description: string;
  sections: Block[];
}

interface PostData {
  title: string;
  excerpt: string;
  content: string;
  date: string;
  tags: string[];
  author: string;
  readTime: string;
}

interface Block {
  _block: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function readJsonDir<T>(dir: string): Doc<T>[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Doc<T>);
}

function ensureDir(dir: string) { fs.mkdirSync(dir, { recursive: true }); }

function writeFile(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Markdown → HTML
// ---------------------------------------------------------------------------

function markdownToHtml(md: string): string {
  if (!md) return '';
  let html = md;
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre class="code-block" data-lang="${lang}"><code>${escapeHtml(code.trim())}</code></pre>`);
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="content-h2">$1</h2>');
  // Lists
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="ol-item" value="$1">$2</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="content-link">$1</a>');
  // Paragraphs
  const lines = html.split('\n');
  const out: string[] = [];
  let inP = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { if (inP) { out.push('</p>'); inP = false; } continue; }
    if (trimmed.startsWith('<h') || trimmed.startsWith('<pre') || trimmed.startsWith('<li') ||
        trimmed.startsWith('<blockquote') || trimmed.startsWith('</')) {
      if (inP) { out.push('</p>'); inP = false; }
      out.push(trimmed);
    } else {
      if (!inP) { out.push('<p>'); inP = true; }
      else out.push('<br>');
      out.push(trimmed);
    }
  }
  if (inP) out.push('</p>');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale === 'da' ? 'da-DK' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

// ---------------------------------------------------------------------------
// i18n helpers
// ---------------------------------------------------------------------------

function getLocalePath(locale: string, slug: string): string {
  if (locale === 'en') return `${BASE}/${slug}/`;
  return `${BASE}/${locale}/${slug}/`;
}

function findTranslation<T>(docs: Doc<T>[], doc: Doc<T>): Doc<T> | undefined {
  if (!doc.translationGroup) return undefined;
  return docs.find(d => d.translationGroup === doc.translationGroup && d.locale !== doc.locale && d.status === 'published');
}

const t = (locale: string, en: string, da: string) => locale === 'da' ? da : en;

function tagUrl(tag: string, locale: string): string {
  const prefix = locale === 'da' ? '/da' : '';
  return `${BASE}${prefix}/tags/${tag}/`;
}

function renderTagLink(tag: string, locale: string): string {
  return `<a href="${tagUrl(tag, locale)}" class="post-tag">#${escapeHtml(tag)}</a>`;
}

function collectAllTags(posts: Doc<PostData>[]): Map<string, Doc<PostData>[]> {
  const map = new Map<string, Doc<PostData>[]>();
  for (const post of posts) {
    for (const tag of post.data.tags || []) {
      const list = map.get(tag) || [];
      list.push(post);
      map.set(tag, list);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// CSS — the entire design system
// ---------------------------------------------------------------------------

const CSS = `
/* ═══════════════════════════════════════════════════════════════════
   @webhouse/cms — CMS Demo
   Dark SaaS theme · #F7BB2E gold on #0D0D0D
   ═══════════════════════════════════════════════════════════════════ */

@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --gold: #F7BB2E;
  --gold-dim: #D9A11A;
  --gold-glow: rgba(247, 187, 46, 0.15);
  --gold-glow-strong: rgba(247, 187, 46, 0.3);
  --dark: #0D0D0D;
  --dark-card: #141414;
  --dark-card-hover: #1a1a1a;
  --dark-border: #222;
  --dark-border-hover: #333;
  --text: #e8e8e8;
  --text-dim: #888;
  --text-dimmer: #555;
  --white: #fafafa;
  --danger: #ff4444;
  --font-body: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
  --max-w: 1200px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}

html { scroll-behavior: smooth; }

body {
  font-family: var(--font-body);
  background: var(--dark);
  color: var(--text);
  line-height: 1.7;
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
}

a { color: var(--gold); text-decoration: none; transition: color 0.2s; }
a:hover { color: var(--white); }

/* ── Noise overlay ──────────────────────────────────────────────── */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.03;
  pointer-events: none;
  z-index: 9999;
}

/* ── Scroll reveal ──────────────────────────────────────────────── */
.reveal {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.8s var(--ease-out), transform 0.8s var(--ease-out);
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

/* ── Navigation ─────────────────────────────────────────────────── */
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 0 2rem;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(13, 13, 13, 0.8);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.nav-brand {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--gold);
  letter-spacing: -0.02em;
}
.nav-links {
  display: flex;
  align-items: center;
  gap: 2rem;
  list-style: none;
}
.nav-links a {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-dim);
  transition: color 0.2s;
  letter-spacing: 0.01em;
}
.nav-links a:hover { color: var(--white); }
.locale-switch {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--dark-border);
  border-radius: 6px;
  color: var(--text-dim);
  background: transparent;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.locale-switch:hover {
  border-color: var(--gold);
  color: var(--gold);
}

/* ── Hero ───────────────────────────────────────────────────────── */
.hero {
  min-height: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7rem 2rem 4rem;
  position: relative;
  overflow: hidden;
}
.hero::before {
  content: '';
  position: absolute;
  top: -40%;
  left: 50%;
  transform: translateX(-50%);
  width: 800px;
  height: 800px;
  background: radial-gradient(circle, var(--gold-glow) 0%, transparent 70%);
  pointer-events: none;
  animation: heroGlow 6s ease-in-out infinite alternate;
}
@keyframes heroGlow {
  0% { opacity: 0.4; transform: translateX(-50%) scale(1); }
  100% { opacity: 0.7; transform: translateX(-50%) scale(1.15); }
}
.hero-inner {
  max-width: var(--max-w);
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  align-items: center;
  position: relative;
  z-index: 1;
}
.hero-content { animation: fadeUp 1s var(--ease-out) both; }
.hero-terminal { animation: fadeUp 1s var(--ease-out) 0.2s both; }

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(40px); }
  to { opacity: 1; transform: translateY(0); }
}

.hero-badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--gold);
  background: var(--gold-glow);
  border: 1px solid rgba(247, 187, 46, 0.2);
  padding: 0.35rem 0.9rem;
  border-radius: 100px;
  margin-bottom: 1.5rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.hero h1 {
  font-size: clamp(2.8rem, 5vw, 4.2rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--white);
  margin-bottom: 1.5rem;
}
.hero h1 span { color: var(--gold); }
.hero-sub {
  font-size: 1.15rem;
  color: var(--text-dim);
  line-height: 1.7;
  max-width: 480px;
  margin-bottom: 2.5rem;
}
.hero-ctas { display: flex; gap: 1rem; flex-wrap: wrap; }
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.8rem 1.8rem;
  background: var(--gold);
  color: var(--dark);
  font-weight: 600;
  font-size: 0.9rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
  letter-spacing: -0.01em;
}
.btn-primary:hover {
  background: var(--white);
  color: var(--dark);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(247, 187, 46, 0.3);
}
.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.8rem 1.8rem;
  background: transparent;
  color: var(--text);
  font-weight: 500;
  font-size: 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--dark-border);
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
}
.btn-secondary:hover {
  border-color: var(--gold);
  color: var(--gold);
  transform: translateY(-2px);
}

/* ── Terminal mockup ────────────────────────────────────────────── */
.terminal {
  background: #111;
  border: 1px solid var(--dark-border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03);
}
.terminal-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  background: #0a0a0a;
  border-bottom: 1px solid var(--dark-border);
}
.terminal-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.terminal-dot.r { background: #ff5f57; }
.terminal-dot.y { background: #febc2e; }
.terminal-dot.g { background: #28c840; }
.terminal-title {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-dimmer);
  margin-left: auto;
  margin-right: auto;
}
.terminal pre {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.8;
  padding: 1.5rem;
  color: var(--text-dim);
  overflow-x: auto;
}
.terminal .cmd { color: var(--white); }
.terminal .ok { color: #28c840; }
.terminal .info { color: var(--gold); }
.terminal .arrow { color: var(--gold); }

/* ── Stats row ──────────────────────────────────────────────────── */
.stats {
  padding: 4rem 2rem;
  border-top: 1px solid var(--dark-border);
  border-bottom: 1px solid var(--dark-border);
}
.stats-inner {
  max-width: var(--max-w);
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2rem;
}
.stat {
  text-align: center;
  padding: 1.5rem;
}
.stat-value {
  font-family: var(--font-mono);
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--gold);
  letter-spacing: -0.03em;
  text-shadow: 0 0 40px var(--gold-glow-strong);
  line-height: 1;
  margin-bottom: 0.5rem;
}
.stat-label {
  font-size: 0.8rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 500;
}

/* ── Section containers ─────────────────────────────────────────── */
.section {
  padding: 6rem 2rem;
  max-width: var(--max-w);
  margin: 0 auto;
}
.section-header {
  text-align: center;
  margin-bottom: 4rem;
}
.section-header h2 {
  font-size: clamp(1.8rem, 3vw, 2.5rem);
  font-weight: 700;
  color: var(--white);
  letter-spacing: -0.03em;
  margin-bottom: 1rem;
}
.section-header p {
  font-size: 1.05rem;
  color: var(--text-dim);
  max-width: 600px;
  margin: 0 auto;
}

/* ── Features grid ──────────────────────────────────────────────── */
.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--dark-border);
  border: 1px solid var(--dark-border);
  border-radius: 16px;
  overflow: hidden;
}
.feature-card {
  background: var(--dark-card);
  padding: 2.5rem;
  transition: all 0.35s var(--ease-out);
  position: relative;
}
.feature-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
  opacity: 0;
  transition: opacity 0.35s;
}
.feature-card:hover {
  background: var(--dark-card-hover);
}
.feature-card:hover::before {
  opacity: 1;
}
.feature-icon {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  display: block;
}
.feature-card h3 {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--white);
  margin-bottom: 0.7rem;
  letter-spacing: -0.01em;
}
.feature-card p {
  font-size: 0.88rem;
  color: var(--text-dim);
  line-height: 1.65;
}
.feature-tag {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--gold);
  background: var(--gold-glow);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  margin-top: 1rem;
  letter-spacing: 0.03em;
}

/* ── Code showcase ──────────────────────────────────────────────── */
.code-showcase {
  padding: 6rem 2rem;
  max-width: var(--max-w);
  margin: 0 auto;
}
.code-showcase-inner {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 4rem;
  align-items: center;
}
.code-showcase h2 {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--white);
  letter-spacing: -0.03em;
  margin-bottom: 1rem;
}
.code-showcase .desc {
  font-size: 1rem;
  color: var(--text-dim);
  line-height: 1.7;
}
.code-block-container {
  background: #111;
  border: 1px solid var(--dark-border);
  border-radius: 12px;
  overflow: hidden;
}
.code-block-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: #0a0a0a;
  border-bottom: 1px solid var(--dark-border);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-dimmer);
}
.code-block-body {
  padding: 1.5rem;
  overflow-x: auto;
}
.code-block-body pre {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.8;
  color: var(--text);
}
/* Syntax colors */
.syn-kw { color: #c792ea; }
.syn-fn { color: #82aaff; }
.syn-str { color: #c3e88d; }
.syn-num { color: #f78c6c; }
.syn-cmt { color: #546e7a; }
.syn-type { color: #ffcb6b; }
.syn-prop { color: #f07178; }
.syn-bool { color: #ff5370; }

/* ── MCP section ────────────────────────────────────────────────── */
.mcp-section {
  padding: 6rem 2rem;
  background: linear-gradient(180deg, transparent, rgba(247, 187, 46, 0.02), transparent);
}
.mcp-inner {
  max-width: var(--max-w);
  margin: 0 auto;
}
.mcp-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-top: 3rem;
}
.mcp-card {
  background: var(--dark-card);
  border: 1px solid var(--dark-border);
  border-radius: 16px;
  padding: 2.5rem;
  position: relative;
  overflow: hidden;
  transition: all 0.35s var(--ease-out);
}
.mcp-card:hover {
  border-color: var(--dark-border-hover);
  transform: translateY(-4px);
  box-shadow: 0 16px 48px rgba(0,0,0,0.3);
}
.mcp-card-badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  padding: 0.3rem 0.7rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}
.mcp-card-badge.public {
  color: #28c840;
  background: rgba(40, 200, 64, 0.1);
  border: 1px solid rgba(40, 200, 64, 0.2);
}
.mcp-card-badge.auth {
  color: var(--gold);
  background: var(--gold-glow);
  border: 1px solid rgba(247, 187, 46, 0.2);
}
.mcp-card h3 {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--white);
  margin-bottom: 0.8rem;
}
.mcp-card p {
  font-size: 0.9rem;
  color: var(--text-dim);
  line-height: 1.65;
  margin-bottom: 1.5rem;
}
.mcp-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.mcp-tool {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--text-dim);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

/* ── Timeline ───────────────────────────────────────────────────── */
.timeline {
  position: relative;
  padding-left: 3rem;
  margin-top: 3rem;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(180deg, var(--gold), var(--dark-border));
}
.timeline-item {
  position: relative;
  padding: 0 0 2.5rem 0;
}
.timeline-item::before {
  content: '';
  position: absolute;
  left: -3rem;
  top: 0.35rem;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--gold);
  border: 2px solid var(--dark);
  box-shadow: 0 0 12px var(--gold-glow-strong);
  transform: translateX(-4px);
}
.timeline-year {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--gold);
  font-weight: 600;
  margin-bottom: 0.3rem;
  letter-spacing: 0.05em;
}
.timeline-text {
  font-size: 0.95rem;
  color: var(--text-dim);
  line-height: 1.6;
}

/* ── CTA section ────────────────────────────────────────────────── */
.cta-section {
  padding: 6rem 2rem;
  text-align: center;
}
.cta-box {
  max-width: 700px;
  margin: 0 auto;
  padding: 4rem;
  border-radius: 20px;
  background: var(--dark-card);
  border: 1px solid var(--dark-border);
  position: relative;
  overflow: hidden;
}
.cta-box::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 20%;
  right: 20%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
}
.cta-box h2 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--white);
  letter-spacing: -0.03em;
  margin-bottom: 0.7rem;
}
.cta-box p {
  font-size: 1rem;
  color: var(--text-dim);
  margin-bottom: 2rem;
}
.cta-buttons { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }

/* ── Text section ───────────────────────────────────────────────── */
.text-section {
  padding: 6rem 2rem;
  max-width: 800px;
  margin: 0 auto;
}
.text-section h2 {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--white);
  letter-spacing: -0.03em;
  margin-bottom: 1.5rem;
}
.text-section .body-text {
  font-size: 1rem;
  color: var(--text-dim);
  line-height: 1.8;
}
.text-section .body-text strong { color: var(--text); }

/* ── Blog ───────────────────────────────────────────────────────── */
.blog-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}
.post-card {
  background: var(--dark-card);
  border: 1px solid var(--dark-border);
  border-radius: 12px;
  padding: 2rem;
  transition: all 0.35s var(--ease-out);
  display: flex;
  flex-direction: column;
}
.post-card:hover {
  border-color: var(--dark-border-hover);
  transform: translateY(-4px);
  box-shadow: 0 16px 48px rgba(0,0,0,0.3);
}
.post-card:hover h3 { color: var(--gold); }
.post-meta {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--text-dimmer);
  font-family: var(--font-mono);
  margin-bottom: 0.8rem;
}
.post-card h3 {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--white);
  letter-spacing: -0.01em;
  margin-bottom: 0.6rem;
  line-height: 1.35;
  transition: color 0.2s;
}
.post-card p {
  font-size: 0.88rem;
  color: var(--text-dim);
  line-height: 1.6;
  flex: 1;
}
.post-tags {
  display: flex;
  gap: 0.5rem;
  margin-top: 1.2rem;
  flex-wrap: wrap;
}
.post-tag {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-dim);
  background: transparent;
  padding: 0.35rem 0.8rem;
  border-radius: 100px;
  border: 1px solid var(--dark-border);
  text-decoration: none;
  transition: all 0.2s;
  display: inline-block;
}
a.post-tag:hover {
  color: var(--gold);
  border-color: rgba(247, 187, 46, 0.4);
  background: var(--gold-glow);
}

/* ── Tags pages ─────────────────────────────────────────────────── */
.tags-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.tag-pill {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-dim);
  background: var(--dark-card);
  border: 1px solid var(--dark-border);
  padding: 0.5rem 1.2rem;
  border-radius: 100px;
  text-decoration: none;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.tag-pill:hover {
  color: var(--gold);
  border-color: rgba(247, 187, 46, 0.3);
  background: var(--gold-glow);
}
.tag-count {
  font-size: 0.65rem;
  color: var(--text-dimmer);
  background: rgba(255,255,255,0.06);
  padding: 0.1rem 0.4rem;
  border-radius: 100px;
}

/* ── Blog detail ────────────────────────────────────────────────── */
.article {
  max-width: 740px;
  margin: 0 auto;
  padding: 8rem 2rem 4rem;
}
.article-header { margin-bottom: 3rem; }
.article-header h1 {
  font-size: clamp(2rem, 4vw, 2.8rem);
  font-weight: 700;
  color: var(--white);
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin-bottom: 1rem;
}
.article-meta {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  font-size: 0.85rem;
  color: var(--text-dim);
}
.article-meta .sep { color: var(--text-dimmer); }
.article-body h2 { margin: 2.5rem 0 1rem; }
.article-body h3 { font-size: 1.2rem; font-weight: 600; color: var(--white); margin: 2rem 0 0.8rem; }
.article-body p { color: var(--text-dim); margin-bottom: 1.2rem; }
.article-body strong { color: var(--text); }
.article-body li { color: var(--text-dim); margin-bottom: 0.5rem; margin-left: 1.5rem; }
.article-body .code-block {
  background: #111;
  border: 1px solid var(--dark-border);
  border-radius: 8px;
  padding: 1.2rem 1.5rem;
  overflow-x: auto;
  margin: 1.5rem 0;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.7;
}
.article-body .inline-code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: rgba(255,255,255,0.06);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  color: var(--gold);
}
.content-h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--white);
  letter-spacing: -0.02em;
}
.content-link { border-bottom: 1px solid rgba(247, 187, 46, 0.3); }
.content-link:hover { border-bottom-color: var(--gold); }

/* ── Footer ─────────────────────────────────────────────────────── */
.footer {
  padding: 3rem 2rem;
  border-top: 1px solid var(--dark-border);
  text-align: center;
}
.footer-inner {
  max-width: var(--max-w);
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.footer-text {
  font-size: 0.8rem;
  color: var(--text-dimmer);
}
.footer-links {
  display: flex;
  gap: 1.5rem;
}
.footer-links a {
  font-size: 0.8rem;
  color: var(--text-dimmer);
}
.footer-links a:hover { color: var(--gold); }
.footer-powered {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--text-dimmer);
  margin-top: 1rem;
}

/* ── Page hero (smaller) ────────────────────────────────────────── */
.page-hero {
  padding: 10rem 2rem 4rem;
  text-align: center;
  position: relative;
}
.page-hero::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 400px;
  background: radial-gradient(circle, var(--gold-glow) 0%, transparent 70%);
  opacity: 0.3;
  pointer-events: none;
}
.page-hero h1 {
  font-size: clamp(2.2rem, 4vw, 3.2rem);
  font-weight: 800;
  color: var(--white);
  letter-spacing: -0.03em;
  margin-bottom: 1rem;
  position: relative;
}
.page-hero p {
  font-size: 1.15rem;
  color: var(--text-dim);
  max-width: 600px;
  margin: 0 auto;
  position: relative;
}

/* ── Responsive ─────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .hero-inner { grid-template-columns: 1fr; gap: 2rem; }
  .hero-terminal { order: -1; }
  .features-grid { grid-template-columns: 1fr; }
  .code-showcase-inner { grid-template-columns: 1fr; }
  .mcp-cards { grid-template-columns: 1fr; }
  .stats-inner { grid-template-columns: repeat(2, 1fr); }
  .blog-grid { grid-template-columns: 1fr; }
  .nav-links { display: none; }
  .footer-inner { flex-direction: column; gap: 1rem; }
}
`;

// ---------------------------------------------------------------------------
// JS for scroll reveal
// ---------------------------------------------------------------------------

const JS = `
document.addEventListener('DOMContentLoaded', () => {
  const els = document.querySelectorAll('.reveal');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
  els.forEach(el => obs.observe(el));
});`;

// ---------------------------------------------------------------------------
// Syntax highlight (basic)
// ---------------------------------------------------------------------------

function highlightCode(code: string, lang: string): string {
  let h = escapeHtml(code);
  if (lang === 'typescript' || lang === 'ts' || lang === 'javascript' || lang === 'js') {
    h = h.replace(/\/\/(.*)$/gm, '<span class="syn-cmt">//$1</span>');
    h = h.replace(/&#x27;([^&#]*?)&#x27;/g, '<span class="syn-str">&#x27;$1&#x27;</span>');
    h = h.replace(/'([^']*?)'/g, `<span class="syn-str">'$1'</span>`);
    h = h.replace(/\b(import|from|export|default|const|let|function|return|if|else|new|true|false|null|undefined|async|await)\b/g,
      '<span class="syn-kw">$1</span>');
    h = h.replace(/\b(defineConfig|defineCollection|defineBlock|require)\b/g, '<span class="syn-fn">$1</span>');
    h = h.replace(/\b(\d+)\b/g, '<span class="syn-num">$1</span>');
    h = h.replace(/\b(string|number|boolean|Record|Promise)\b/g, '<span class="syn-type">$1</span>');
  }
  return h;
}

// ---------------------------------------------------------------------------
// Terminal code formatting
// ---------------------------------------------------------------------------

function formatTerminal(code: string): string {
  return code.split('\n').map(line => {
    if (line.startsWith('$')) return `<span class="cmd">${escapeHtml(line)}</span>`;
    if (line.startsWith('✓')) return `<span class="ok">${escapeHtml(line)}</span>`;
    if (line.startsWith('→')) return `<span class="arrow">${escapeHtml(line)}</span>`;
    return escapeHtml(line);
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function layout(opts: {
  title: string;
  description: string;
  locale: string;
  body: string;
  globals: GlobalData;
  altUrl?: string;
  altLocale?: string;
}): string {
  const { title, description, locale, body, globals, altUrl, altLocale } = opts;
  const navItems = globals.navItems.split(',').map(s => s.trim());
  const navSlugs = locale === 'da'
    ? { 'Features': '/da/features/', 'Om os': '/da/om-os/', 'Kom i gang': '/da/kom-i-gang/', 'Blog': '/da/blog/' }
    : { 'Features': '/features/', 'About': '/about/', 'Quick Start': '/quick-start/', 'Blog': '/blog/' };

  const altLabel = locale === 'da' ? 'EN' : 'DA';
  const hreflang = altUrl && altLocale
    ? `<link rel="alternate" hreflang="${altLocale}" href="${BASE}${altUrl}">\n    <link rel="alternate" hreflang="${locale}" href="">`
    : '';

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — ${escapeHtml(globals.siteTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='64' height='64'%3E%3Cpath fill='%232a2a3e' d='M32,0C16.8,0,1.5,9.1,1.5,27.3s9.1,32.2,21.3,36.5c6.1,1.8,9.1-1.8,9.1-7.9'/%3E%3Cpath fill='%23212135' d='M1.5,27.3c-3,9.1-1.2,22.5,4.9,29.8,4.9,4.9,12.2,7.3,16.4,6.7'/%3E%3Cpath fill='%23f7bb2e' d='M32,0c15.2,0,30.4,9.1,30.4,27.3s-9.1,32.2-21.3,36.5c-6.1,1.8-9.1-1.8-9.1-7.9'/%3E%3Cpath fill='%23d9a11a' d='M62.3,27.3c3,9.1,1.2,22.5-4.9,29.8-4.9,4.9-12.2,7.3-16.4,6.7'/%3E%3Cpath fill='%23fff' d='M10,30.4c7.3-11.3,14.6-17,21.9-17s14.6,5.7,21.9,17c-7.3,11.3-14.6,17-21.9,17s-14.6-5.7-21.9-17Z'/%3E%3Ccircle fill='%23f7bb2e' cx='32' cy='30.4' r='9.1'/%3E%3Ccircle fill='%230d0d0d' cx='32' cy='30.4' r='4'/%3E%3Ccircle fill='%23fff' opacity='.9' cx='34.4' cy='27.9' r='1.7'/%3E%3Ccircle fill='%23fff' opacity='.3' cx='30' cy='32.5' r='.8'/%3E%3C/svg%3E">
  ${hreflang}
  <style>${CSS}</style>
</head>
<body>
  <nav class="nav">
    <a href="${locale === 'da' ? BASE + '/da/' : BASE + '/'}" class="nav-brand">${escapeHtml(globals.siteTitle)}</a>
    <ul class="nav-links">
      ${navItems.map(item => {
        const href = (navSlugs as Record<string, string>)[item] || '/';
        return `<li><a href="${BASE}${href}">${escapeHtml(item)}</a></li>`;
      }).join('\n      ')}
      ${altUrl ? `<li><a href="${BASE}${altUrl}" class="locale-switch">${altLabel}</a></li>` : ''}
    </ul>
  </nav>

  ${body}

  <footer class="footer">
    <div class="footer-inner">
      <span class="footer-text">${escapeHtml(globals.footerText)}</span>
      <div class="footer-links">
        <a href="https://github.com/webhousecode/cms">GitHub</a>
        <a href="https://www.npmjs.com/package/@webhouse/cms">npm</a>
        <a href="https://docs.webhouse.app">Docs</a>
      </div>
    </div>
    <div class="footer-powered">Powered by @webhouse/cms</div>
  </footer>

  <script>${JS}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Block renderers
// ---------------------------------------------------------------------------

function renderBlock(block: Block, locale: string): string {
  switch (block._block) {
    case 'hero': return renderHeroBlock(block, locale);
    case 'stats': return renderStatsBlock(block);
    case 'features': return renderFeaturesBlock(block);
    case 'code-showcase': return renderCodeShowcase(block);
    case 'mcp-section': return renderMcpSection(block);
    case 'cta': return renderCtaBlock(block);
    case 'text-section': return renderTextSection(block);
    case 'timeline': return renderTimelineBlock(block);
    default: return `<!-- unknown block: ${block._block} -->`;
  }
}

function renderHeroBlock(b: Block, locale: string): string {
  const badge = b.badge as string || '';
  const headline = b.headline as string || '';
  const subline = (b.subline as string || '').replace(/\n/g, '<br>');
  const terminal = b.terminalCode as string || '';
  const cta1 = b.ctaPrimary as string || '';
  const cta2 = b.ctaSecondary as string || '';

  return `
  <section class="hero">
    <div class="hero-inner">
      <div class="hero-content">
        ${badge ? `<span class="hero-badge">${escapeHtml(badge)}</span>` : ''}
        <h1>${escapeHtml(headline)}</h1>
        <p class="hero-sub">${subline}</p>
        ${(cta1 || cta2) ? `<div class="hero-ctas">
          ${cta1 ? `<a href="https://webhouse.app/signup" class="btn-primary">${escapeHtml(cta1)} →</a>` : ''}
          ${cta2 ? `<a href="https://github.com/webhousecode/cms" class="btn-secondary">${escapeHtml(cta2)}</a>` : ''}
        </div>` : ''}
      </div>
      ${terminal ? `
      <div class="hero-terminal">
        <div class="terminal">
          <div class="terminal-bar">
            <span class="terminal-dot r"></span>
            <span class="terminal-dot y"></span>
            <span class="terminal-dot g"></span>
            <span class="terminal-title">Terminal</span>
          </div>
          <pre>${formatTerminal(terminal)}</pre>
        </div>
      </div>` : ''}
    </div>
  </section>`;
}

function renderStatsBlock(b: Block): string {
  const items: { value: string; label: string }[] = JSON.parse(b.items as string || '[]');
  return `
  <section class="stats reveal">
    <div class="stats-inner">
      ${items.map(s => `
      <div class="stat">
        <div class="stat-value">${escapeHtml(s.value)}</div>
        <div class="stat-label">${escapeHtml(s.label)}</div>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderFeaturesBlock(b: Block): string {
  const heading = b.heading as string || '';
  const subheading = b.subheading as string || '';
  const items: { title: string; description: string; icon: string; tag: string }[] =
    JSON.parse(b.items as string || '[]');

  return `
  <section class="section reveal">
    <div class="section-header">
      <h2>${escapeHtml(heading)}</h2>
      ${subheading ? `<p>${escapeHtml(subheading)}</p>` : ''}
    </div>
    <div class="features-grid">
      ${items.map(f => `
      <div class="feature-card">
        <span class="feature-icon">${f.icon}</span>
        <h3>${escapeHtml(f.title)}</h3>
        <p>${escapeHtml(f.description)}</p>
        ${f.tag ? `<span class="feature-tag">${escapeHtml(f.tag)}</span>` : ''}
      </div>`).join('')}
    </div>
  </section>`;
}

function renderCodeShowcase(b: Block): string {
  const heading = b.heading as string || '';
  const desc = b.description as string || '';
  const code = b.code as string || '';
  const lang = b.language as string || 'typescript';

  return `
  <section class="code-showcase reveal">
    <div class="code-showcase-inner">
      <div>
        <h2>${escapeHtml(heading)}</h2>
        <p class="desc">${escapeHtml(desc)}</p>
      </div>
      <div class="code-block-container">
        <div class="code-block-header">${escapeHtml(lang)}</div>
        <div class="code-block-body">
          <pre>${highlightCode(code, lang)}</pre>
        </div>
      </div>
    </div>
  </section>`;
}

function renderMcpSection(b: Block): string {
  const heading = b.heading as string || '';
  const subheading = b.subheading as string || '';
  const cards: { title: string; badge: string; description: string; tools: string[] }[] =
    JSON.parse(b.cards as string || '[]');

  return `
  <section class="mcp-section reveal">
    <div class="mcp-inner">
      <div class="section-header">
        <h2>${escapeHtml(heading)}</h2>
        <p>${escapeHtml(subheading)}</p>
      </div>
      <div class="mcp-cards">
        ${cards.map((c, i) => `
        <div class="mcp-card">
          <span class="mcp-card-badge ${i === 0 ? 'public' : 'auth'}">${escapeHtml(c.badge)}</span>
          <h3>${escapeHtml(c.title)}</h3>
          <p>${escapeHtml(c.description)}</p>
          <div class="mcp-tools">
            ${c.tools.map(tool => `<span class="mcp-tool">${escapeHtml(tool)}</span>`).join('')}
          </div>
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}

function renderCtaBlock(b: Block): string {
  const heading = b.heading as string || '';
  const sub = b.subheading as string || '';
  const btn = b.buttonText as string || '';
  const url = b.buttonUrl as string || '#';
  const btn2 = b.secondaryText as string || '';
  const url2 = b.secondaryUrl as string || '#';

  return `
  <section class="cta-section reveal">
    <div class="cta-box">
      <h2>${escapeHtml(heading)}</h2>
      ${sub ? `<p>${escapeHtml(sub)}</p>` : ''}
      <div class="cta-buttons">
        ${btn ? `<a href="${escapeHtml(url)}" class="btn-primary">${escapeHtml(btn)} →</a>` : ''}
        ${btn2 ? `<a href="${escapeHtml(url2)}" class="btn-secondary">${escapeHtml(btn2)}</a>` : ''}
      </div>
    </div>
  </section>`;
}

function renderTextSection(b: Block): string {
  const heading = b.heading as string || '';
  const body = b.body as string || '';

  return `
  <section class="text-section reveal">
    <h2>${escapeHtml(heading)}</h2>
    <div class="body-text">${markdownToHtml(body)}</div>
  </section>`;
}

function renderTimelineBlock(b: Block): string {
  const heading = b.heading as string || '';
  const items: { year: string; text: string }[] = JSON.parse(b.items as string || '[]');

  return `
  <section class="section reveal">
    <div class="section-header">
      <h2>${escapeHtml(heading)}</h2>
    </div>
    <div class="timeline">
      ${items.map(item => `
      <div class="timeline-item">
        <div class="timeline-year">${escapeHtml(item.year)}</div>
        <div class="timeline-text">${escapeHtml(item.text)}</div>
      </div>`).join('')}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

function buildPage(
  page: Doc<PageData>,
  globals: GlobalData,
  locale: string,
  altUrl?: string,
  altLocale?: string,
): string {
  const blocks = (page.data.sections || []).map(b => renderBlock(b, locale)).join('\n');
  return layout({
    title: page.data.title,
    description: page.data.description || '',
    locale,
    body: blocks,
    globals,
    altUrl,
    altLocale,
  });
}

function buildBlogIndex(
  posts: Doc<PostData>[],
  globals: GlobalData,
  locale: string,
  altUrl?: string,
  altLocale?: string,
): string {
  const sorted = [...posts].sort((a, b) =>
    new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

  const body = `
  <div class="page-hero">
    <span class="hero-badge">${t(locale, 'CMS Chronicle', 'CMS Krønike')}</span>
    <h1>${t(locale, 'Blog', 'Blog')}</h1>
    <p>${t(locale,
      'Architecture decisions, trade-offs, and honest accounts of building an AI-native CMS.',
      'Arkitekturbeslutninger, afvejninger og ærlige beretninger om at bygge et AI-native CMS.')}</p>
  </div>
  <section class="section">
    <div class="blog-grid">
      ${sorted.map(post => {
        const href = locale === 'da'
          ? `${BASE}/da/blog/${post.slug.replace(/-da$/, '')}/`
          : `${BASE}/blog/${post.slug}/`;
        return `
      <div class="post-card">
        <div class="post-meta">
          <span>${formatDate(post.data.date, locale)}</span>
          <span>·</span>
          <span>${post.data.readTime}</span>
        </div>
        <h3><a href="${href}" style="color:inherit;text-decoration:none">${escapeHtml(post.data.title)}</a></h3>
        <p>${escapeHtml(post.data.excerpt)}</p>
        <div class="post-tags">
          ${(post.data.tags || []).map(tag => renderTagLink(tag, locale)).join('')}
        </div>
      </div>`;
      }).join('')}
    </div>
  </section>`;

  return layout({
    title: t(locale, 'Blog', 'Blog'),
    description: t(locale,
      'Architecture decisions and development chronicles for @webhouse/cms.',
      'Arkitekturbeslutninger og udviklingshistorier for @webhouse/cms.'),
    locale,
    body,
    globals,
    altUrl,
    altLocale,
  });
}

function buildPostDetail(
  post: Doc<PostData>,
  globals: GlobalData,
  locale: string,
  altUrl?: string,
  altLocale?: string,
): string {
  const body = `
  <article class="article">
    <header class="article-header">
      <h1>${escapeHtml(post.data.title)}</h1>
      <div class="article-meta">
        <span>${post.data.author}</span>
        <span class="sep">·</span>
        <span>${formatDate(post.data.date, locale)}</span>
        <span class="sep">·</span>
        <span>${post.data.readTime}</span>
      </div>
    </header>
    <div class="article-body">
      ${markdownToHtml(post.data.content)}
    </div>
    <div class="post-tags" style="margin-top: 3rem; padding-top: 2rem; border-top: 1px solid var(--dark-border); gap: 0.5rem;">
      ${(post.data.tags || []).map(tag => renderTagLink(tag, locale)).join('')}
    </div>
    <div style="margin-top: 2rem;">
      <a href="${BASE}${locale === 'da' ? '/da' : ''}/blog/" style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-dimmer); text-transform: uppercase; letter-spacing: 0.08em;">← ${t(locale, 'More from Blog', 'Mere fra Blog')}</a>
    </div>
  </article>`;

  return layout({
    title: post.data.title,
    description: post.data.excerpt,
    locale,
    body,
    globals,
    altUrl,
    altLocale,
  });
}

// ---------------------------------------------------------------------------
// Tag pages
// ---------------------------------------------------------------------------

function buildTagsIndex(
  tags: Map<string, Doc<PostData>[]>,
  globals: GlobalData,
  locale: string,
): string {
  const sorted = [...tags.entries()].sort((a, b) => b[1].length - a[1].length);

  const body = `
  <div class="page-hero">
    <span class="hero-badge">${t(locale, 'Browse by topic', 'Gennemse efter emne')}</span>
    <h1>${t(locale, 'Tags', 'Tags')}</h1>
    <p>${t(locale,
      `${sorted.length} tags across ${[...new Set(sorted.flatMap(([, posts]) => posts.map(p => p.slug)))].length} posts`,
      `${sorted.length} tags på tværs af ${[...new Set(sorted.flatMap(([, posts]) => posts.map(p => p.slug)))].length} indlæg`)}</p>
  </div>
  <section class="section">
    <div class="tags-grid">
      ${sorted.map(([tag, posts]) =>
        `<a href="${tagUrl(tag, locale)}" class="tag-pill">${escapeHtml(tag)} <span class="tag-count">${posts.length}</span></a>`
      ).join('')}
    </div>
  </section>`;

  return layout({
    title: t(locale, 'Tags', 'Tags'),
    description: t(locale, 'Browse all topics', 'Gennemse alle emner'),
    locale,
    body,
    globals,
    altUrl: locale === 'da' ? '/tags/' : '/da/tags/',
    altLocale: locale === 'da' ? 'en' : 'da',
  });
}

function buildTagDetail(
  tag: string,
  posts: Doc<PostData>[],
  globals: GlobalData,
  locale: string,
): string {
  const sorted = [...posts].sort((a, b) =>
    new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

  const body = `
  <div class="page-hero">
    <span class="hero-badge">Tag</span>
    <h1>${escapeHtml(tag)}</h1>
    <p>${sorted.length} ${t(locale, 'posts', 'indlæg')}</p>
  </div>
  <section class="section">
    <div class="blog-grid">
      ${sorted.map(post => {
        const cleanSlug = post.slug.replace(/-da$/, '');
        const href = locale === 'da'
          ? `${BASE}/da/blog/${cleanSlug}/`
          : `${BASE}/blog/${post.slug}/`;
        return `
      <div class="post-card">
        <div class="post-meta">
          <span>${formatDate(post.data.date, locale)}</span>
          <span>·</span>
          <span>${post.data.readTime}</span>
        </div>
        <h3><a href="${href}" style="color:inherit;text-decoration:none">${escapeHtml(post.data.title)}</a></h3>
        <p>${escapeHtml(post.data.excerpt)}</p>
        <div class="post-tags">
          ${(post.data.tags || []).map(t => renderTagLink(t, locale)).join('')}
        </div>
      </div>`;
      }).join('')}
    </div>
  </section>`;

  return layout({
    title: `${tag} — ${t(locale, 'Tags', 'Tags')}`,
    description: `${t(locale, 'Posts tagged', 'Indlæg tagget med')} "${tag}"`,
    locale,
    body,
    globals,
    altUrl: locale === 'da' ? `/tags/${tag}/` : `/da/tags/${tag}/`,
    altLocale: locale === 'da' ? 'en' : 'da',
  });
}

// ---------------------------------------------------------------------------
// Build pipeline
// ---------------------------------------------------------------------------

function build() {
  console.log('Building CMS Demo site...\n');

  // Clean dist
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });

  // Read all content
  const allGlobals = readJsonDir<GlobalData>(path.join(CONTENT, 'globals'));
  const allPages = readJsonDir<PageData>(path.join(CONTENT, 'pages'));
  const allPosts = readJsonDir<PostData>(path.join(CONTENT, 'posts'));

  const published = <T>(docs: Doc<T>[]) => docs.filter(d => d.status === 'published');

  for (const locale of ['en', 'da']) {
    const globals = published(allGlobals).find(g => g.locale === locale)?.data
      || published(allGlobals)[0]?.data;
    if (!globals) { console.error(`No globals found for ${locale}`); continue; }

    const pages = published(allPages).filter(p => p.locale === locale);
    const posts = published(allPosts).filter(p => p.locale === locale);
    const prefix = locale === 'en' ? '' : `/${locale}`;

    // ── Home page ──
    const homePage = pages.find(p => p.slug === 'home' || p.slug === 'home-da');
    if (homePage) {
      const alt = findTranslation(published(allPages), homePage);
      const altUrl = alt ? (alt.locale === 'da' ? '/da/' : '/') : undefined;
      const html = buildPage(homePage, globals, locale, altUrl, alt?.locale);
      writeFile(path.join(DIST, locale === 'en' ? 'index.html' : `${locale}/index.html`), html);
      console.log(`  ✓ ${prefix || '/'} (home)`);
    }

    // ── Content pages ──
    for (const page of pages) {
      if (page.slug === 'home' || page.slug === 'home-da') continue;
      const cleanSlug = page.slug.replace(/-da$/, '');
      const alt = findTranslation(published(allPages), page);
      let altUrl: string | undefined;
      if (alt) {
        const altClean = alt.slug.replace(/-da$/, '');
        altUrl = alt.locale === 'da' ? `/da/${altClean}/` : `/${altClean}/`;
      }
      const html = buildPage(page, globals, locale, altUrl, alt?.locale);
      const outSlug = locale === 'da' ? cleanSlug : page.slug;
      writeFile(path.join(DIST, locale === 'en' ? `${outSlug}/index.html` : `${locale}/${outSlug}/index.html`), html);
      console.log(`  ✓ ${prefix}/${outSlug}/`);
    }

    // ── Blog index ──
    const altBlogUrl = locale === 'da' ? '/blog/' : '/da/blog/';
    const blogHtml = buildBlogIndex(posts, globals, locale, altBlogUrl, locale === 'da' ? 'en' : 'da');
    writeFile(path.join(DIST, locale === 'en' ? 'blog/index.html' : `${locale}/blog/index.html`), blogHtml);
    console.log(`  ✓ ${prefix}/blog/`);

    // ── Blog posts ──
    for (const post of posts) {
      const cleanSlug = post.slug.replace(/-da$/, '');
      const alt = findTranslation(published(allPosts), post);
      let altUrl: string | undefined;
      if (alt) {
        const altClean = alt.slug.replace(/-da$/, '');
        altUrl = alt.locale === 'da' ? `/da/blog/${altClean}/` : `/blog/${altClean}/`;
      }
      const html = buildPostDetail(post, globals, locale, altUrl, alt?.locale);
      writeFile(path.join(DIST, locale === 'en' ? `blog/${post.slug}/index.html` : `${locale}/blog/${cleanSlug}/index.html`), html);
      console.log(`  ✓ ${prefix}/blog/${cleanSlug}/`);
    }

    // ── Tag pages ──
    const tags = collectAllTags(posts);
    const tagsIndexHtml = buildTagsIndex(tags, globals, locale);
    writeFile(path.join(DIST, locale === 'en' ? 'tags/index.html' : `${locale}/tags/index.html`), tagsIndexHtml);
    console.log(`  ✓ ${prefix}/tags/`);

    for (const [tag, tagPosts] of tags) {
      const tagHtml = buildTagDetail(tag, tagPosts, globals, locale);
      writeFile(path.join(DIST, locale === 'en' ? `tags/${tag}/index.html` : `${locale}/tags/${tag}/index.html`), tagHtml);
      console.log(`  ✓ ${prefix}/tags/${tag}/`);
    }
  }

  // ── CMS Preview redirects ──
  // CMS admin constructs preview URLs as: urlPrefix + "/" + slug
  // DA docs have slugs like "about-da" so CMS previews at /about-da/
  // but the actual page is at /da/about/. Write redirect files.
  const allPublishedPages = published(allPages).filter(p => p.locale === 'da');
  const allPublishedPosts = published(allPosts).filter(p => p.locale === 'da');

  for (const page of allPublishedPages) {
    if (page.slug === 'home-da') continue;
    const cleanSlug = page.slug.replace(/-da$/, '');
    const target = `${BASE}/da/${cleanSlug}/`;
    writeFile(path.join(DIST, `${page.slug}/index.html`),
      `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${target}"><link rel="canonical" href="${target}"></head><body>Redirecting to <a href="${target}">${target}</a></body></html>`);
  }

  for (const post of allPublishedPosts) {
    const cleanSlug = post.slug.replace(/-da$/, '');
    const target = `${BASE}/da/blog/${cleanSlug}/`;
    writeFile(path.join(DIST, `blog/${post.slug}/index.html`),
      `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${target}"><link rel="canonical" href="${target}"></head><body>Redirecting to <a href="${target}">${target}</a></body></html>`);
  }

  const totalFiles = countFiles(DIST);
  console.log(`\n✓ Build complete: ${totalFiles} HTML files`);
}

function countFiles(dir: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
    else if (entry.name.endsWith('.html')) count++;
  }
  return count;
}

build();
