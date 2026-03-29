/**
 * Landing page build pipeline
 *
 * Reads cms.config.ts block definitions and content/pages/home.json,
 * then renders a complete static HTML page into dist/index.html.
 *
 * Usage:  npx tsx build.ts
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Load content
// ---------------------------------------------------------------------------
interface TerminalLine {
  type: 'cmd' | 'output' | 'success';
  text: string;
}

interface StatItem {
  value: string;
  label: string;
}

interface FeatureItem {
  icon: string;
  title: string;
  description: string;
  tag: string;
}

interface McpCard {
  type: 'public' | 'auth';
  badge: string;
  title: string;
  description: string;
  tools: string;
}

interface Block {
  _block: string;
  [key: string]: unknown;
}

interface PageData {
  slug: string;
  status: string;
  data: {
    title: string;
    metaDescription: string;
    sections: Block[];
  };
}

const contentPath = join(__dirname, 'content/pages/home.json');
const page: PageData = JSON.parse(readFileSync(contentPath, 'utf-8'));
const { title, metaDescription, sections } = page.data;

// ---------------------------------------------------------------------------
// Read SVG assets for inlining
// ---------------------------------------------------------------------------
const iconSvg = readFileSync(join(__dirname, 'public/webhouse-icon.svg'), 'utf-8');
const wordmarkSvg = readFileSync(join(__dirname, 'public/webhouse-wordmark-dark.svg'), 'utf-8');

// ---------------------------------------------------------------------------
// Escape helper
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------------------
// Block renderers
// ---------------------------------------------------------------------------

function renderHero(block: Block): string {
  const terminal = block.terminal as TerminalLine[];
  const terminalLines = terminal
    .map((line) => {
      if (line.type === 'cmd') {
        return `<div class="term-line"><span class="term-prompt">$</span> <span class="term-cmd">${esc(line.text)}</span></div>`;
      }
      if (line.type === 'success') {
        return `<div class="term-line"><span class="term-ok">&#10003;</span> ${esc(line.text)}</div>`;
      }
      return `<div class="term-line term-output">${esc(line.text)}</div>`;
    })
    .join('\n');

  return `
<section class="hero">
  <div class="container">
    <div class="hero-logo">
      <div class="hero-icon">${iconSvg}</div>
      <div class="hero-wordmark">${wordmarkSvg}</div>
    </div>
    <span class="badge">${esc(block.badge as string)}</span>
    <h1>${esc(block.tagline as string)}</h1>
    <div class="hero-ctas">
      <a href="${esc(block.primaryCtaUrl as string)}" class="btn btn-primary">${esc(block.primaryCta as string)}</a>
      <a href="${esc(block.secondaryCtaUrl as string)}" class="btn btn-secondary">${esc(block.secondaryCta as string)}</a>
    </div>
    <div class="terminal">
      <div class="terminal-header">
        <span class="terminal-dot red"></span>
        <span class="terminal-dot yellow"></span>
        <span class="terminal-dot green"></span>
      </div>
      <div class="terminal-body">
${terminalLines}
      </div>
    </div>
  </div>
</section>`;
}

function renderStats(block: Block): string {
  const items = block.items as StatItem[];
  const statsHtml = items
    .map(
      (item) => `
      <div class="stat">
        <div class="stat-value">${esc(item.value)}</div>
        <div class="stat-label">${esc(item.label)}</div>
      </div>`
    )
    .join('\n');

  return `
<section class="stats">
  <div class="container">
    <div class="stats-grid">
${statsHtml}
    </div>
  </div>
</section>`;
}

function renderFeatures(block: Block): string {
  const items = block.items as FeatureItem[];
  const cardsHtml = items
    .map(
      (item) => `
      <div class="feature-card">
        <div class="feature-icon">${item.icon}</div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.description)}</p>
        <span class="feature-tag">${esc(item.tag)}</span>
      </div>`
    )
    .join('\n');

  return `
<section class="features" id="features">
  <div class="container">
    <span class="section-label">${esc(block.label as string)}</span>
    <h2>${nl2br(block.title as string)}</h2>
    <p class="section-desc">${esc(block.description as string)}</p>
    <div class="features-grid">
${cardsHtml}
    </div>
  </div>
</section>`;
}

function renderArchitecture(block: Block): string {
  // Inline the architecture diagram SVG if it exists
  let diagramHtml: string;
  const diagramPath = join(__dirname, 'public', 'architecture-diagram.svg');
  if (existsSync(diagramPath)) {
    diagramHtml = `<div class="arch-diagram">${readFileSync(diagramPath, 'utf-8')}</div>`;
  } else {
    diagramHtml = `<img src="${esc(block.diagramSrc as string)}" alt="Architecture diagram" class="arch-diagram-img">`;
  }

  return `
<section class="architecture" id="architecture">
  <div class="container">
    <span class="section-label">${esc(block.label as string)}</span>
    <h2>${nl2br(block.title as string)}</h2>
    <p class="section-desc">${esc(block.description as string)}</p>
    ${diagramHtml}
  </div>
</section>`;
}

function renderMcp(block: Block): string {
  const cards = block.cards as McpCard[];
  const cardsHtml = cards
    .map(
      (card) => `
      <div class="mcp-card mcp-${card.type}">
        <span class="mcp-badge">${esc(card.badge)}</span>
        <h3>${esc(card.title)}</h3>
        <p>${esc(card.description)}</p>
        <pre class="mcp-tools">${esc(card.tools)}</pre>
      </div>`
    )
    .join('\n');

  return `
<section class="mcp" id="mcp">
  <div class="container">
    <span class="section-label">${esc(block.label as string)}</span>
    <h2>${nl2br(block.title as string)}</h2>
    <p class="section-desc">${esc(block.description as string)}</p>
    <div class="mcp-grid">
${cardsHtml}
    </div>
  </div>
</section>`;
}

function renderCta(block: Block): string {
  return `
<section class="cta">
  <div class="container">
    <span class="section-label">${esc(block.label as string)}</span>
    <h2>${nl2br(block.title as string)}</h2>
    <p class="cta-subtitle">${esc(block.subtitle as string)}</p>
    <div class="hero-ctas">
      <a href="${esc(block.primaryCtaUrl as string)}" class="btn btn-primary">${esc(block.primaryCta as string)}</a>
      <a href="${esc(block.secondaryCtaUrl as string)}" class="btn btn-secondary">${esc(block.secondaryCta as string)}</a>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
const renderers: Record<string, (b: Block) => string> = {
  hero: renderHero,
  stats: renderStats,
  features: renderFeatures,
  architecture: renderArchitecture,
  mcp: renderMcp,
  cta: renderCta,
};

const sectionsHtml = sections
  .map((block) => {
    const renderer = renderers[block._block];
    if (!renderer) {
      console.warn(`Unknown block type: ${block._block}`);
      return '';
    }
    return renderer(block);
  })
  .join('\n');

// ---------------------------------------------------------------------------
// Full HTML document
// ---------------------------------------------------------------------------
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(metaDescription)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(metaDescription)}">
  <meta property="og:type" content="website">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(iconSvg)}">
  <style>
    /* ------------------------------------------------------------------ */
    /* Reset & base                                                       */
    /* ------------------------------------------------------------------ */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --gold: #F7BB2E;
      --gold-dim: #d9a11a;
      --dark: #0D0D0D;
      --dark-card: #161622;
      --dark-border: #2a2a3e;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --font-sans: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-mono: "JetBrains Mono", "Fira Code", "Courier New", monospace;
      --max-w: 72rem;
      --radius: 0.75rem;
    }

    html { scroll-behavior: smooth; }

    body {
      font-family: var(--font-sans);
      background: var(--dark);
      color: var(--text);
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .container {
      max-width: var(--max-w);
      margin: 0 auto;
      padding: 0 1.5rem;
    }

    a { color: var(--gold); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ------------------------------------------------------------------ */
    /* Section shared                                                     */
    /* ------------------------------------------------------------------ */
    section { padding: clamp(4rem, 8vw, 7rem) 0; }

    .section-label {
      display: inline-block;
      text-transform: uppercase;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: var(--gold);
      margin-bottom: 0.75rem;
    }

    section h2 {
      font-size: clamp(1.75rem, 4vw, 2.75rem);
      font-weight: 800;
      line-height: 1.15;
      margin-bottom: 1rem;
    }

    .section-desc {
      max-width: 40rem;
      color: var(--text-muted);
      font-size: 1.125rem;
      margin-bottom: 3rem;
    }

    /* ------------------------------------------------------------------ */
    /* Buttons                                                            */
    /* ------------------------------------------------------------------ */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.875rem 2rem;
      border-radius: var(--radius);
      font-weight: 600;
      font-size: 1rem;
      text-decoration: none;
      transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
    }
    .btn:hover { text-decoration: none; transform: translateY(-1px); }

    .btn-primary {
      background: var(--gold);
      color: var(--dark);
      box-shadow: 0 0 24px rgba(247, 187, 46, 0.25);
    }
    .btn-primary:hover { background: #fcc844; box-shadow: 0 0 32px rgba(247, 187, 46, 0.35); }

    .btn-secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--dark-border);
    }
    .btn-secondary:hover { border-color: var(--gold); color: var(--gold); }

    /* ------------------------------------------------------------------ */
    /* Hero                                                               */
    /* ------------------------------------------------------------------ */
    .hero {
      text-align: center;
      padding: clamp(5rem, 12vw, 9rem) 0 clamp(3rem, 6vw, 5rem);
    }

    .hero-logo {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .hero-icon svg { width: 64px; height: auto; }
    .hero-wordmark svg { width: 260px; height: auto; }

    .badge {
      display: inline-block;
      padding: 0.375rem 1rem;
      border-radius: 999px;
      border: 1px solid var(--dark-border);
      font-size: 0.8125rem;
      color: var(--text-muted);
      margin-bottom: 1.5rem;
    }

    .hero h1 {
      font-size: clamp(2.5rem, 7vw, 4.5rem);
      font-weight: 800;
      line-height: 1.05;
      margin-bottom: 2rem;
      background: linear-gradient(135deg, var(--text) 40%, var(--gold));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero-ctas {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
      margin-bottom: 3.5rem;
    }

    /* Terminal --------------------------------------------------------- */
    .terminal {
      max-width: 38rem;
      margin: 0 auto;
      background: #111120;
      border: 1px solid var(--dark-border);
      border-radius: var(--radius);
      overflow: hidden;
      text-align: left;
      font-family: var(--font-mono);
      font-size: 0.875rem;
    }

    .terminal-header {
      display: flex;
      gap: 6px;
      padding: 0.75rem 1rem;
      background: #18182a;
    }

    .terminal-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .terminal-dot.red { background: #ff5f57; }
    .terminal-dot.yellow { background: #febc2e; }
    .terminal-dot.green { background: #28c840; }

    .terminal-body { padding: 1rem 1.25rem; }

    .term-line { padding: 0.2rem 0; color: var(--text-muted); }
    .term-prompt { color: var(--gold); font-weight: 700; }
    .term-cmd { color: var(--text); }
    .term-ok { color: #22c55e; margin-right: 0.25rem; }
    .term-output { color: var(--text-muted); }

    /* ------------------------------------------------------------------ */
    /* Stats bar                                                          */
    /* ------------------------------------------------------------------ */
    .stats {
      padding: 2.5rem 0;
      border-top: 1px solid var(--dark-border);
      border-bottom: 1px solid var(--dark-border);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      text-align: center;
    }

    .stat-value {
      font-size: clamp(1.75rem, 3.5vw, 2.5rem);
      font-weight: 800;
      color: var(--gold);
    }

    .stat-label {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    @media (max-width: 640px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 2rem; }
    }

    /* ------------------------------------------------------------------ */
    /* Features                                                           */
    /* ------------------------------------------------------------------ */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }

    .feature-card {
      background: var(--dark-card);
      border: 1px solid var(--dark-border);
      border-radius: var(--radius);
      padding: 2rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .feature-card:hover {
      border-color: var(--gold);
      box-shadow: 0 0 24px rgba(247, 187, 46, 0.08);
    }

    .feature-icon {
      font-size: 1.75rem;
      margin-bottom: 1rem;
    }

    .feature-card h3 {
      font-size: 1.125rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
    }

    .feature-card p {
      color: var(--text-muted);
      font-size: 0.9375rem;
      margin-bottom: 1.25rem;
      line-height: 1.6;
    }

    .feature-tag {
      display: inline-block;
      padding: 0.25rem 0.625rem;
      border-radius: 0.375rem;
      background: rgba(247, 187, 46, 0.1);
      color: var(--gold);
      font-size: 0.75rem;
      font-family: var(--font-mono);
    }

    @media (max-width: 900px) {
      .features-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 600px) {
      .features-grid { grid-template-columns: 1fr; }
    }

    /* ------------------------------------------------------------------ */
    /* Architecture                                                       */
    /* ------------------------------------------------------------------ */
    .architecture { text-align: center; }
    .architecture .section-desc { margin-left: auto; margin-right: auto; }

    .arch-diagram {
      max-width: 56rem;
      margin: 0 auto;
      overflow: hidden;
      border-radius: var(--radius);
    }
    .arch-diagram svg { width: 100%; height: auto; }
    .arch-diagram-img { max-width: 100%; height: auto; border-radius: var(--radius); }

    /* ------------------------------------------------------------------ */
    /* MCP                                                                */
    /* ------------------------------------------------------------------ */
    .mcp-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
    }

    .mcp-card {
      background: var(--dark-card);
      border: 1px solid var(--dark-border);
      border-radius: var(--radius);
      padding: 2rem;
    }

    .mcp-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
    }

    .mcp-public .mcp-badge {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    .mcp-auth .mcp-badge {
      background: rgba(247, 187, 46, 0.15);
      color: var(--gold);
    }

    .mcp-card h3 {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      font-family: var(--font-mono);
    }

    .mcp-card p {
      color: var(--text-muted);
      font-size: 0.9375rem;
      margin-bottom: 1.25rem;
      line-height: 1.6;
    }

    .mcp-tools {
      background: #111120;
      color: var(--text-muted);
      padding: 1rem;
      border-radius: 0.5rem;
      font-size: 0.8125rem;
      font-family: var(--font-mono);
      line-height: 1.8;
      white-space: pre-wrap;
      overflow-x: auto;
    }

    @media (max-width: 768px) {
      .mcp-grid { grid-template-columns: 1fr; }
    }

    /* ------------------------------------------------------------------ */
    /* CTA                                                                */
    /* ------------------------------------------------------------------ */
    .cta {
      text-align: center;
      border-top: 1px solid var(--dark-border);
    }
    .cta h2 {
      font-size: clamp(2rem, 5vw, 3.25rem);
      background: linear-gradient(135deg, var(--text) 40%, var(--gold));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .cta-subtitle {
      color: var(--text-muted);
      font-size: 1.125rem;
      margin-bottom: 2.5rem;
    }

    /* ------------------------------------------------------------------ */
    /* Footer                                                             */
    /* ------------------------------------------------------------------ */
    footer {
      border-top: 1px solid var(--dark-border);
      padding: 2rem 0;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.875rem;
    }
    footer a { color: var(--gold); }
  </style>
</head>
<body>
${sectionsHtml}
  <footer>
    <div class="container">
      <p>Built with <a href="https://github.com/webhousecode/cms">@webhouse/cms</a></p>
    </div>
  </footer>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------
const distDir = join(__dirname, 'dist');
mkdirSync(distDir, { recursive: true });

const outPath = join(distDir, 'index.html');
writeFileSync(outPath, html, 'utf-8');

console.log(`Built landing page: ${outPath} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
