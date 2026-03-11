import { html, raw } from '../engine.js';
import type { TemplateContext } from '../types.js';

export function layoutTemplate(content: string, context: TemplateContext): string {
  const pageTitle = context.page.title;
  const siteTitle = context.site.title;
  const description = context.page.description;
  const canonicalUrl = context.page.canonicalUrl;
  const jsonLd = context.page.jsonLd;
  const ogImage = context.page.ogImage;

  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle} — ${siteTitle}</title>
  ${description ? raw(`<meta name="description" content="${description}">`) : ''}
  <meta property="og:title" content="${pageTitle} — ${siteTitle}">
  ${description ? raw(`<meta property="og:description" content="${description}">`) : ''}
  <meta property="og:type" content="website">
  ${ogImage ? raw(`<meta property="og:image" content="${ogImage}">`) : ''}
  ${canonicalUrl ? raw(`<link rel="canonical" href="${canonicalUrl}">`) : ''}
  ${jsonLd ? raw(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`) : ''}
  <style>
    :root {
      --color-bg: #ffffff;
      --color-fg: #111827;
      --color-primary: #2563eb;
      --color-muted: #6b7280;
      --color-border: #e5e7eb;
      --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-mono: 'Courier New', monospace;
      --font-size-base: 1rem;
      --line-height-base: 1.7;
      --spacing-base: 1rem;
      --spacing-section: clamp(2rem, 5vw, 4rem);
      --max-width: 72rem;
      --radius: 0.5rem;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font-sans); background: var(--color-bg); color: var(--color-fg); font-size: var(--font-size-base); line-height: var(--line-height-base); }
    a { color: var(--color-primary); }
    img { max-width: 100%; height: auto; }
    .container { max-width: var(--max-width); margin: 0 auto; padding: 0 var(--spacing-base); }
    header { border-bottom: 1px solid var(--color-border); padding: 1rem 0; margin-bottom: 2rem; }
    header nav { display: flex; align-items: center; flex-wrap: wrap; position: relative; }
    header .site-title { font-weight: 700; font-size: 1.25rem; text-decoration: none; color: var(--color-fg); flex: 1; }
    .nav-toggle { display: none; }
    .nav-burger { display: flex; flex-direction: column; gap: 4px; cursor: pointer; padding: 0.5rem; margin: -0.5rem; }
    .nav-burger span { display: block; width: 20px; height: 2px; background: var(--color-fg); transition: transform 0.2s, opacity 0.2s; }
    .nav-links { display: none; width: 100%; flex-direction: column; gap: 0; padding-top: 0.75rem; }
    .nav-toggle:checked ~ .nav-links { display: flex; }
    .nav-toggle:checked ~ .nav-burger span:nth-child(1) { transform: rotate(45deg) translate(4px, 4px); }
    .nav-toggle:checked ~ .nav-burger span:nth-child(2) { opacity: 0; }
    .nav-toggle:checked ~ .nav-burger span:nth-child(3) { transform: rotate(-45deg) translate(4px, -4px); }
    header nav a.nav-link { text-decoration: none; color: var(--color-muted); font-size: 0.9375rem; transition: color 0.15s; padding: 0.75rem 0; display: block; }
    header nav a.nav-link:hover { color: var(--color-fg); }
    @media (min-width: 768px) {
      .nav-burger { display: none; }
      .nav-links { display: flex; width: auto; flex-direction: row; gap: 2rem; padding-top: 0; margin-left: 2rem; }
      header nav a.nav-link { padding: 0; display: inline; }
    }
    main { padding: var(--spacing-section) 0; }
    footer { border-top: 1px solid var(--color-border); padding: 1.5rem 0; margin-top: var(--spacing-section); color: var(--color-muted); font-size: 0.875rem; }
    .prose h1 { font-size: clamp(1.75rem, 4vw, 2.25rem); font-weight: 800; line-height: 1.2; margin-bottom: 1rem; }
    .prose h2 { font-size: clamp(1.25rem, 3vw, 1.5rem); font-weight: 700; margin: 2rem 0 0.75rem; }
    .prose h3 { font-size: clamp(1.1rem, 2.5vw, 1.25rem); font-weight: 600; margin: 1.5rem 0 0.5rem; }
    .prose p { margin-bottom: 1.25rem; }
    .prose pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: var(--radius); overflow-x: auto; margin-bottom: 1.25rem; font-family: var(--font-mono); font-size: clamp(0.75rem, 1.5vw, 0.875rem); }
    .prose code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-family: var(--font-mono); font-size: 0.875em; }
    .prose pre code { background: none; padding: 0; }
    .prose ul, .prose ol { padding-left: 1.5rem; margin-bottom: 1.25rem; }
    .prose li { margin-bottom: 0.375rem; }
    .prose blockquote { border-left: 4px solid var(--color-primary); padding-left: 1rem; margin: 1.5rem 0; color: var(--color-muted); }
    .prose img { border-radius: var(--radius); margin: 1.5rem 0; }
    .card-grid { display: grid; grid-template-columns: 1fr; gap: 1.25rem; }
    @media (min-width: 640px) {
      .card-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
    }
    .card { border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1.5rem; transition: box-shadow 0.2s; }
    .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .card h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem; }
    .card h2 a { text-decoration: none; color: var(--color-fg); }
    .card h2 a:hover { color: var(--color-primary); }
    .card .meta { color: var(--color-muted); font-size: 0.875rem; margin-bottom: 0.75rem; }
    .card .excerpt { color: var(--color-muted); font-size: 0.9375rem; }
    .hero { padding: var(--spacing-section) 0; text-align: center; }
    .hero h1 { font-size: clamp(2rem, 6vw, 3rem); font-weight: 800; margin-bottom: 1rem; }
    .hero p { font-size: clamp(1rem, 2.5vw, 1.25rem); color: var(--color-muted); max-width: 42rem; margin: 0 auto 2rem; }
    .btn { display: inline-block; padding: 0.75rem 1.5rem; background: var(--color-primary); color: #fff; border-radius: var(--radius); text-decoration: none; font-weight: 600; }
    .btn:hover { opacity: 0.9; }
    .post-header { margin-bottom: 2rem; }
    .post-header h1 { font-size: clamp(1.75rem, 5vw, 2.5rem); font-weight: 800; line-height: 1.2; margin-bottom: 0.5rem; }
    .post-meta { color: var(--color-muted); font-size: 0.875rem; }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <nav>
        <a href="/" class="site-title">${context.site.title}</a>
        <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-hidden="true">
        <label for="nav-toggle" class="nav-burger" aria-label="Menu"><span></span><span></span><span></span></label>
        <div class="nav-links">
          ${raw((context.site.nav ?? []).map(item => html`<a href="${item.href}" class="nav-link">${item.label}</a>`).join('\n'))}
        </div>
      </nav>
    </div>
  </header>
  <main>
    <div class="container">
      ${raw(content)}
    </div>
  </main>
  <footer>
    <div class="container">
      <p>Built with @webhouse/cms</p>
    </div>
  </footer>
</body>
</html>`;
}
