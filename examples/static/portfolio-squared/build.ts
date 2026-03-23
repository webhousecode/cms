/**
 * Portfolio² — Quinn-inspired photography portfolio
 *
 * Reads ALL content from CMS JSON files and generates a fully static site.
 * Zero hardcoded content — everything is editable via the CMS admin.
 *
 * Usage:  npx tsx build.ts
 */

import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Base path for GitHub Pages (e.g. "/boutique-site") or "" for root domain
const BASE = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SiteSettings {
  siteName: string;
  email: string;
  footerText: string;
  socialLinks: { label: string; url: string }[];
  navLinks: { label: string; href: string; key: string }[];
}

interface ProjectData {
  title: string;
  category: string;
  year: string;
  description: string;
  coverImage: string;
  images: { url: string; alt: string }[];
}

interface PageData {
  title: string;
  heading?: string;
  subtitle?: string;
  content?: string;
  heroImage?: string;
}

interface Document<T> {
  slug: string;
  status: string;
  data: T;
}

// ---------------------------------------------------------------------------
// Content loaders
// ---------------------------------------------------------------------------

const CONTENT_DIR = join(__dirname, 'content');

function loadCollection<T>(name: string): Document<T>[] {
  const dir = join(CONTENT_DIR, name);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')))
    .filter((d: Document<T>) => d.status === 'published');
}

function loadDocument<T>(collection: string, slug: string): Document<T> | undefined {
  return loadCollection<T>(collection).find((d) => d.slug === slug);
}

// ---------------------------------------------------------------------------
// Shared HTML helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0a0a0a;
  --bg-card: #141414;
  --text: #f5f5f5;
  --text-muted: #a3a3a3;
  --border: #1e1e1e;
}
html { scroll-behavior: smooth; }
body {
  font-family: 'Inter', sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ---- Nav ---- */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  background: rgba(10, 10, 10, 0.85);
  border-bottom: 1px solid var(--border);
}
.nav-inner {
  max-width: 1400px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.25rem 2.5rem;
}
.nav-logo {
  font-weight: 600; font-size: 1rem; letter-spacing: 0.08em;
  color: var(--text); text-decoration: none; text-transform: uppercase;
}
.nav-links { display: flex; gap: 2rem; list-style: none; }
.nav-links a {
  color: var(--text-muted); text-decoration: none; font-size: 0.8125rem;
  font-weight: 400; letter-spacing: 0.06em; text-transform: uppercase;
  transition: color 0.3s;
}
.nav-links a:hover, .nav-links a.active { color: var(--text); }

/* ---- Project grid ---- */
.grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 3px;
  padding-top: 73px;
}
.grid-item {
  position: relative; overflow: hidden; aspect-ratio: 4/3;
  cursor: pointer; display: block; text-decoration: none;
}
.grid-item img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.6s;
}
.grid-item:hover img { transform: scale(1.05); filter: brightness(0.6); }
.grid-overlay {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.5s;
}
.grid-item:hover .grid-overlay { opacity: 1; }
.grid-overlay h2 {
  font-size: 1.375rem; font-weight: 300; letter-spacing: 0.1em;
  text-transform: uppercase; color: #fff;
}
.grid-overlay span {
  font-size: 0.6875rem; font-weight: 400; letter-spacing: 0.14em;
  text-transform: uppercase; color: rgba(255,255,255,0.65); margin-top: 0.5rem;
}

/* ---- Project detail ---- */
.hero-img {
  width: 100%; height: 80vh; object-fit: cover; display: block;
}
.project-info {
  max-width: 720px; margin: 0 auto; padding: 5rem 2rem;
}
.project-info .cat {
  font-size: 0.6875rem; font-weight: 400; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--text-muted); margin-bottom: 1rem;
}
.project-info h1 {
  font-size: 2.75rem; font-weight: 300; letter-spacing: 0.01em;
  line-height: 1.15; margin-bottom: 1.5rem;
}
.project-info .desc {
  font-size: 1.0625rem; font-weight: 300; line-height: 1.9;
  color: var(--text-muted);
}
.gallery {
  display: grid; grid-template-columns: 1fr; gap: 3px;
}
.gallery img {
  width: 100%; display: block;
}
.back-link {
  display: block; text-align: center; padding: 4rem 2rem;
  color: var(--text-muted); text-decoration: none;
  font-size: 0.8125rem; letter-spacing: 0.08em; text-transform: uppercase;
  transition: color 0.3s;
}
.back-link:hover { color: var(--text); }

/* ---- About ---- */
.about-grid {
  max-width: 1200px; margin: 0 auto; padding: 6rem 2.5rem;
  display: grid; grid-template-columns: 1fr 1fr; gap: 5rem; align-items: center;
}
.about-img {
  width: 100%; aspect-ratio: 3/4; object-fit: cover; display: block;
  filter: grayscale(10%);
}
.about-text .label {
  font-size: 0.6875rem; font-weight: 400; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--text-muted); margin-bottom: 1rem;
}
.about-text h1 {
  font-size: 2.5rem; font-weight: 300; letter-spacing: 0.02em;
  line-height: 1.2; margin-bottom: 2rem;
}
.about-text .bio {
  font-size: 1rem; font-weight: 300; line-height: 1.9; color: var(--text-muted);
}
.about-text .bio p { margin-bottom: 1rem; }
.about-email {
  display: inline-block; margin-top: 2rem;
  color: var(--text); text-decoration: none; font-size: 0.875rem;
  letter-spacing: 0.04em; border-bottom: 1px solid var(--border);
  padding-bottom: 2px; transition: border-color 0.3s;
}
.about-email:hover { border-color: var(--text); }

/* ---- Contact ---- */
.contact-wrap {
  min-height: 80vh; display: flex; align-items: center; justify-content: center;
  padding: 4rem 2rem; text-align: center;
}
.contact-wrap .label {
  font-size: 0.6875rem; font-weight: 400; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--text-muted); margin-bottom: 1rem;
}
.contact-wrap h1 {
  font-size: 2.5rem; font-weight: 300; letter-spacing: 0.02em;
  line-height: 1.2; margin-bottom: 1.5rem;
}
.contact-wrap .sub {
  font-size: 1.0625rem; font-weight: 300; line-height: 1.8;
  color: var(--text-muted); margin-bottom: 3rem; max-width: 500px;
}
.contact-btn {
  display: inline-block; padding: 0.875rem 2.5rem;
  border: 1px solid var(--text-muted); color: var(--text);
  text-decoration: none; font-size: 0.8125rem; letter-spacing: 0.1em;
  text-transform: uppercase; transition: background 0.3s, color 0.3s;
}
.contact-btn:hover { background: var(--text); color: var(--bg); }
.social-links {
  display: flex; gap: 2rem; justify-content: center; margin-top: 3rem;
}
.social-links a {
  color: var(--text-muted); text-decoration: none; font-size: 0.75rem;
  letter-spacing: 0.08em; text-transform: uppercase; transition: color 0.3s;
}
.social-links a:hover { color: var(--text); }

/* ---- Footer ---- */
.footer {
  border-top: 1px solid var(--border);
  padding: 2.5rem 2rem; text-align: center;
  color: var(--text-muted); font-size: 0.6875rem;
  letter-spacing: 0.04em;
}
.footer a { color: var(--text-muted); text-decoration: none; }
.footer a:hover { color: var(--text); }

/* ---- Animations ---- */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.fade { animation: fadeUp 0.7s ease-out both; }
.fade-d1 { animation-delay: 0.15s; }
.fade-d2 { animation-delay: 0.3s; }

/* ---- Responsive ---- */
@media (max-width: 768px) {
  .nav-inner { padding: 1rem 1.25rem; }
  .nav-links { gap: 1.25rem; }
  .grid { grid-template-columns: 1fr; }
  .about-grid { grid-template-columns: 1fr; gap: 2.5rem; padding: 3rem 1.5rem; }
  .project-info { padding: 3rem 1.5rem; }
  .project-info h1 { font-size: 2rem; }
  .hero-img { height: 50vh; }
}
`;

// ---------------------------------------------------------------------------
// Template functions (read site settings for every shared element)
// ---------------------------------------------------------------------------

function htmlHead(title: string, site: SiteSettings): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — ${esc(site.siteName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
  <style>${CSS}</style>
</head>`;
}

function nav(site: SiteSettings, active: string = ''): string {
  const linkHtml = site.navLinks
    .map((l) => `<li><a href="${BASE}${esc(l.href)}"${l.key === active ? ' class="active"' : ''}>${esc(l.label)}</a></li>`)
    .join('\n          ');
  return `
  <nav class="nav">
    <div class="nav-inner">
      <a href="${BASE}/" class="nav-logo">${esc(site.siteName)}</a>
      <ul class="nav-links">
        ${linkHtml}
      </ul>
    </div>
  </nav>`;
}

function footer(site: SiteSettings): string {
  return `
  <footer class="footer">
    <p>&copy; ${new Date().getFullYear()} ${esc(site.siteName)} &middot; ${esc(site.footerText)}</p>
    <p style="margin-top: 0.5rem;">Built with <a href="https://www.npmjs.com/package/@webhouse/cms" target="_blank" rel="noopener">@webhouse/cms</a></p>
  </footer>`;
}

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

function buildHome(site: SiteSettings, homePage: Document<PageData>, projects: Document<ProjectData>[]): string {
  const cards = projects
    .map(
      (p) => `
      <a href="${BASE}/projects/${p.slug}/" class="grid-item">
        <img src="${esc(p.data.coverImage)}" alt="${esc(p.data.title)}" loading="lazy">
        <div class="grid-overlay">
          <h2>${esc(p.data.title)}</h2>
          <span>${esc(p.data.category)} &middot; ${esc(p.data.year)}</span>
        </div>
      </a>`,
    )
    .join('\n');

  return `${htmlHead(homePage.data.title, site)}
<body>
  ${nav(site, 'work')}
  <main class="grid">
    ${cards}
  </main>
  ${footer(site)}
</body>
</html>`;
}

function buildProject(site: SiteSettings, project: Document<ProjectData>): string {
  const { title, category, year, description, coverImage, images } = project.data;

  const galleryHtml = images
    .map((img) => `    <img src="${esc(img.url)}" alt="${esc(img.alt)}" loading="lazy">`)
    .join('\n');

  return `${htmlHead(title, site)}
<body>
  ${nav(site)}
  <main style="padding-top: 73px;">
    <img src="${esc(coverImage)}" alt="${esc(title)}" class="hero-img fade">

    <div class="project-info">
      <p class="cat fade">${esc(category)} &middot; ${esc(year)}</p>
      <h1 class="fade fade-d1">${esc(title)}</h1>
      <p class="desc fade fade-d2">${esc(description)}</p>
    </div>

    <div class="gallery">
${galleryHtml}
    </div>

    <a href="${BASE}/" class="back-link">&larr; Back to Works</a>
  </main>
  ${footer(site)}
</body>
</html>`;
}

function buildAbout(site: SiteSettings, page: Document<PageData>): string {
  return `${htmlHead(page.data.title, site)}
<body>
  ${nav(site, 'about')}
  <main style="padding-top: 73px;">
    <div class="about-grid">
      <div class="fade">
        <img src="${esc(page.data.heroImage || '')}" alt="${esc(site.siteName)}" class="about-img">
      </div>
      <div class="about-text">
        <p class="label fade">${esc(page.data.heading || page.data.title)}</p>
        <h1 class="fade fade-d1">${esc(site.siteName)}</h1>
        <div class="bio fade fade-d2">${page.data.content || ''}</div>
        <a href="mailto:${esc(site.email)}" class="about-email fade fade-d2">${esc(site.email)}</a>
      </div>
    </div>
  </main>
  ${footer(site)}
</body>
</html>`;
}

function buildContact(site: SiteSettings, page: Document<PageData>): string {
  const socialHtml = site.socialLinks
    .map((link) => `<a href="${esc(link.url)}">${esc(link.label)}</a>`)
    .join('\n          ');

  return `${htmlHead(page.data.title, site)}
<body>
  ${nav(site, 'contact')}
  <main style="padding-top: 73px;">
    <div class="contact-wrap">
      <div>
        <p class="label fade">${esc(page.data.heading || page.data.title)}</p>
        <h1 class="fade fade-d1">${esc(page.data.heading || page.data.title)}</h1>
        <p class="sub fade fade-d2">${esc(page.data.subtitle || '')}</p>
        <div class="fade fade-d2">
          <a href="mailto:${esc(site.email)}" class="contact-btn">${esc(site.email)}</a>
        </div>
        <div class="social-links fade fade-d2">
          ${socialHtml}
        </div>
      </div>
    </div>
  </main>
  ${footer(site)}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function build() {
  const DIST = join(__dirname, process.env.BUILD_OUT_DIR ?? 'dist');

  // Load site settings
  const siteDoc = loadDocument<SiteSettings>('globals', 'site');
  if (!siteDoc) {
    console.error('ERROR: content/globals/site.json not found. Cannot build without site settings.');
    process.exit(1);
  }
  const site = siteDoc.data;

  // Load content
  const projects = loadCollection<ProjectData>('projects');
  const pages = loadCollection<PageData>('pages');
  const homePage = pages.find((p) => p.slug === 'home');
  const aboutPage = pages.find((p) => p.slug === 'about');
  const contactPage = pages.find((p) => p.slug === 'contact');

  console.log(`Building ${site.siteName} — ${projects.length} projects found`);

  mkdirSync(DIST, { recursive: true });
  if (homePage) {
    writeFileSync(join(DIST, 'index.html'), buildHome(site, homePage, projects));
    console.log('  -> dist/index.html');
  }

  // Project pages
  for (const project of projects) {
    const dir = join(DIST, 'projects', project.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), buildProject(site, project));
    console.log(`  -> dist/projects/${project.slug}/index.html`);
  }

  // About
  if (aboutPage) {
    mkdirSync(join(DIST, 'about'), { recursive: true });
    writeFileSync(join(DIST, 'about', 'index.html'), buildAbout(site, aboutPage));
    console.log('  -> dist/about/index.html');
  }

  // Contact
  if (contactPage) {
    mkdirSync(join(DIST, 'contact'), { recursive: true });
    writeFileSync(join(DIST, 'contact', 'index.html'), buildContact(site, contactPage));
    console.log('  -> dist/contact/index.html');
  }

  console.log('\nBuild complete!');
}

build();
