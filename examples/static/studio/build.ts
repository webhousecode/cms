/**
 * OBSIDIAN Studio — Static site build pipeline
 *
 * Reads ALL content from JSON files in content/ and generates
 * a complete static site into dist/.
 *
 * Usage:  npx tsx build.ts
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ProjectData {
  slug: string;
  status: string;
  data: {
    title: string;
    category: string;
    heroImage: string;
    year: string;
    description: string;
    images: { url: string; alt: string }[];
  };
}

interface NewsData {
  slug: string;
  status: string;
  data: {
    title: string;
    date: string;
    content: string;
    excerpt: string;
  };
}

interface SiteSettings {
  slug: string;
  status: string;
  data: {
    studioName: string;
    footerLocation: string;
    footerEmail: string;
    copyright: string;
    instagramLabel: string;
    instagramUrl: string;
    builtWithLabel: string;
    builtWithUrl: string;
    builtWithName: string;
  };
}

interface PageData {
  slug: string;
  status: string;
  data: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Load content
// ---------------------------------------------------------------------------
function loadCollection<T>(dir: string): T[] {
  const fullDir = join(__dirname, dir);
  return readdirSync(fullDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(fullDir, f), 'utf-8')) as T)
    .filter((item: any) => item.status === 'published');
}

function loadSingle<T>(path: string): T {
  return JSON.parse(readFileSync(join(__dirname, path), 'utf-8')) as T;
}

const site = loadSingle<SiteSettings>('content/globals/site.json');
const homePage = loadSingle<PageData>('content/pages/home.json');
const projectsPage = loadSingle<PageData>('content/pages/projects.json');
const newsPage = loadSingle<PageData>('content/pages/news.json');

const projects = loadCollection<ProjectData>('content/projects');
const news = loadCollection<NewsData>('content/news').sort(
  (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2p(s: string): string {
  return s
    .split('\n')
    .filter((p) => p.trim())
    .map((p) => `<p>${esc(p)}</p>`)
    .join('\n');
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Shared CSS
// ---------------------------------------------------------------------------
const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --black: #000;
  --white: #fff;
  --accent: #e4ff1a;
  --accent-dim: #b8cc15;
  --gray: #666;
  --gray-light: #999;
  --gray-dark: #1a1a1a;
  --font: 'Space Grotesk', system-ui, -apple-system, sans-serif;
}

html { scroll-behavior: smooth; }

body {
  font-family: var(--font);
  background: var(--black);
  color: var(--white);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

a { color: var(--white); text-decoration: none; }

/* ---- Navigation ---- */
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem clamp(1.5rem, 4vw, 3rem);
  mix-blend-mode: difference;
}

.nav-logo {
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.nav-links {
  display: flex;
  gap: 2rem;
  list-style: none;
}

.nav-links a {
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transition: color 0.2s;
}

.nav-links a:hover { color: var(--accent); }

/* ---- Footer ---- */
.footer {
  padding: clamp(4rem, 10vw, 8rem) clamp(1.5rem, 4vw, 3rem) 2rem;
  border-top: 1px solid var(--gray-dark);
}

.footer-name {
  font-size: clamp(3rem, 12vw, 10rem);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  -webkit-text-stroke: 1px var(--white);
  -webkit-text-fill-color: transparent;
  line-height: 1;
  margin-bottom: 2rem;
}

.footer-info {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.8125rem;
  color: var(--gray);
}

.footer-info a { color: var(--gray-light); transition: color 0.2s; }
.footer-info a:hover { color: var(--accent); }

/* ---- Utilities ---- */
.divider {
  border: none;
  border-top: 1px solid var(--gray-dark);
  margin: 0;
}

/* ---- Responsive ---- */
@media (max-width: 640px) {
  .nav { padding: 1rem; }
  .nav-links { gap: 1.25rem; }
}
`;

// ---------------------------------------------------------------------------
// Shared HTML parts
// ---------------------------------------------------------------------------
function head(title: string, description: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>${CSS}`;
}

function nav(basePath: string = ''): string {
  return `
<nav class="nav">
  <a href="${basePath || '/'}" class="nav-logo">${esc(site.data.studioName)}</a>
  <ul class="nav-links">
    <li><a href="${basePath ? basePath + 'projects/' : '/projects/'}">Work</a></li>
    <li><a href="${basePath ? basePath + 'news/' : '/news/'}">News</a></li>
  </ul>
</nav>`;
}

function footer(): string {
  return `
<footer class="footer">
  <div class="footer-name">${esc(site.data.studioName)}</div>
  <div class="footer-info">
    <span>${esc(site.data.footerLocation)}</span>
    <span>${esc(site.data.footerEmail)}</span>
    <span>&copy; ${esc(site.data.copyright)}</span>
    <span>${esc(site.data.builtWithLabel)} <a href="${esc(site.data.builtWithUrl)}">${esc(site.data.builtWithName)}</a></span>
    <a href="${esc(site.data.instagramUrl)}">${esc(site.data.instagramLabel)}</a>
  </div>
</footer>`;
}

// ---------------------------------------------------------------------------
// Page: Home
// ---------------------------------------------------------------------------
function buildHome(): string {
  // Asymmetric project previews
  const projectsHtml = projects
    .map((p, i) => {
      const isEven = i % 2 === 0;
      const width = isEven ? 'w-full md:w-[65%]' : 'w-full md:w-[50%]';
      const align = isEven ? '' : 'md:ml-auto';
      const marginTop = i === 0 ? '' : 'mt-16 md:mt-24';
      return `
      <a href="/projects/${p.slug}/" class="block group ${marginTop} ${width} ${align}">
        <div class="relative overflow-hidden">
          <img
            src="${esc(p.data.heroImage)}"
            alt="${esc(p.data.title)}"
            class="w-full aspect-[16/10] object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
          >
          <div class="absolute bottom-0 left-0 right-0 p-6 md:p-8">
            <span class="inline-block text-xs font-medium tracking-widest uppercase mb-2 opacity-70">${esc(p.data.category)}</span>
            <h3 class="text-3xl md:text-5xl font-bold tracking-tight leading-none mix-blend-difference">${esc(p.data.title)}</h3>
          </div>
        </div>
      </a>`;
    })
    .join('\n');

  return `${head(homePage.data.title, homePage.data.metaDescription)}

    /* ---- Home Hero ---- */
    .home-hero {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 8rem clamp(1.5rem, 4vw, 3rem) 4rem;
    }

    .home-hero h1 {
      font-size: clamp(4rem, 15vw, 12rem);
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 0.9;
      text-transform: uppercase;
    }

    .home-hero .tagline {
      font-size: clamp(1rem, 2.5vw, 1.5rem);
      color: var(--gray-light);
      margin-top: 1.5rem;
      font-weight: 500;
      max-width: 32rem;
    }

    .home-hero .accent-dot {
      color: var(--accent);
    }

    /* ---- Projects section ---- */
    .projects-section {
      padding: clamp(4rem, 8vw, 8rem) clamp(1.5rem, 4vw, 3rem);
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: clamp(2rem, 5vw, 4rem);
    }

    .section-header h2 {
      font-size: clamp(0.75rem, 1.5vw, 0.875rem);
      font-weight: 500;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--gray);
    }

    .section-header a {
      font-size: 0.8125rem;
      color: var(--gray-light);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      transition: color 0.2s;
    }

    .section-header a:hover { color: var(--accent); }
  </style>
</head>
<body>
${nav()}

<section class="home-hero">
  <h1>${esc(homePage.data.heroHeading)}<span class="accent-dot">.</span></h1>
  <p class="tagline">${esc(homePage.data.tagline)}</p>
</section>

<hr class="divider">

<section class="projects-section">
  <div class="section-header">
    <h2>${esc(homePage.data.selectedWorkLabel)}</h2>
    <a href="/projects/">${esc(homePage.data.viewAllLabel)} &rarr;</a>
  </div>
  ${projectsHtml}
</section>

${footer()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page: Projects index
// ---------------------------------------------------------------------------
function buildProjectsIndex(): string {
  const gridHtml = projects
    .map(
      (p, i) => `
      <a href="/projects/${p.slug}/" class="block group ${i % 3 === 1 ? 'md:mt-16' : ''}">
        <div class="overflow-hidden mb-4">
          <img
            src="${esc(p.data.heroImage)}"
            alt="${esc(p.data.title)}"
            class="w-full aspect-[4/3] object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
          >
        </div>
        <div class="flex justify-between items-baseline mb-1">
          <h3 class="text-xl md:text-2xl font-bold tracking-tight">${esc(p.data.title)}</h3>
          <span class="text-sm text-gray-500">${esc(p.data.year)}</span>
        </div>
        <span class="text-xs font-medium tracking-widest uppercase text-gray-500">${esc(p.data.category)}</span>
      </a>`
    )
    .join('\n');

  return `${head(projectsPage.data.title, projectsPage.data.metaDescription)}

    .page-title-section {
      padding: clamp(8rem, 15vw, 12rem) clamp(1.5rem, 4vw, 3rem) clamp(3rem, 6vw, 5rem);
    }

    .page-title-section h1 {
      font-size: clamp(3rem, 10vw, 8rem);
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 0.9;
      text-transform: uppercase;
    }

    .projects-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: clamp(1.5rem, 3vw, 3rem);
      padding: 0 clamp(1.5rem, 4vw, 3rem) clamp(4rem, 8vw, 8rem);
    }

    @media (max-width: 768px) {
      .projects-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
${nav('../')}

<section class="page-title-section">
  <h1>${esc(projectsPage.data.heading)}</h1>
</section>

<hr class="divider">

<div class="projects-grid">
  ${gridHtml}
</div>

${footer()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page: Project detail
// ---------------------------------------------------------------------------
function buildProjectDetail(project: ProjectData): string {
  const { data } = project;

  const galleryHtml = data.images
    .map(
      (img, i) => `
      <div class="${i === 0 ? 'md:col-span-2' : ''}">
        <img
          src="${esc(img.url)}"
          alt="${esc(img.alt)}"
          class="w-full object-cover"
          loading="lazy"
        >
      </div>`
    )
    .join('\n');

  return `${head(`${data.title} — ${site.data.studioName}`, data.description.slice(0, 160))}

    .project-hero {
      position: relative;
      height: 80vh;
      min-height: 500px;
      overflow: hidden;
    }

    .project-hero img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .project-hero-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: clamp(2rem, 5vw, 4rem) clamp(1.5rem, 4vw, 3rem);
      background: linear-gradient(transparent, rgba(0,0,0,0.8));
    }

    .project-hero-overlay h1 {
      font-size: clamp(3rem, 10vw, 8rem);
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 0.9;
      text-transform: uppercase;
      mix-blend-mode: difference;
    }

    .project-meta {
      display: flex;
      gap: 3rem;
      padding: clamp(2rem, 4vw, 3rem) clamp(1.5rem, 4vw, 3rem);
      font-size: 0.8125rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--gray);
    }

    .project-description {
      max-width: 48rem;
      padding: 0 clamp(1.5rem, 4vw, 3rem) clamp(3rem, 6vw, 5rem);
      font-size: clamp(1rem, 1.5vw, 1.125rem);
      color: var(--gray-light);
      line-height: 1.8;
    }

    .project-description p { margin-bottom: 1.25rem; }

    .project-gallery {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 2px;
      padding: 0 0 0;
    }

    .back-link {
      display: inline-block;
      padding: clamp(2rem, 4vw, 3rem) clamp(1.5rem, 4vw, 3rem);
      font-size: 0.8125rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--gray);
      transition: color 0.2s;
    }

    .back-link:hover { color: var(--accent); }

    @media (max-width: 768px) {
      .project-gallery { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
${nav('../../')}

<section class="project-hero">
  <img src="${esc(data.heroImage)}" alt="${esc(data.title)}">
  <div class="project-hero-overlay">
    <h1>${esc(data.title)}</h1>
  </div>
</section>

<div class="project-meta">
  <span>${esc(data.category)}</span>
  <span>${esc(data.year)}</span>
</div>

<hr class="divider" style="margin: 0 clamp(1.5rem, 4vw, 3rem);">

<div class="project-description">
  ${nl2p(data.description)}
</div>

<div class="project-gallery">
  ${galleryHtml}
</div>

<a href="/projects/" class="back-link">&larr; All projects</a>

${footer()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page: News
// ---------------------------------------------------------------------------
function buildNewsIndex(): string {
  const listHtml = news
    .map(
      (n) => `
      <article class="news-item">
        <time class="news-date">${formatDate(n.data.date)}</time>
        <h3 class="news-title">${esc(n.data.title)}</h3>
        <p class="news-excerpt">${esc(n.data.excerpt)}</p>
        <hr class="divider" style="margin-top: 2rem;">
      </article>`
    )
    .join('\n');

  return `${head(newsPage.data.title, newsPage.data.metaDescription)}

    .page-title-section {
      padding: clamp(8rem, 15vw, 12rem) clamp(1.5rem, 4vw, 3rem) clamp(3rem, 6vw, 5rem);
    }

    .page-title-section h1 {
      font-size: clamp(3rem, 10vw, 8rem);
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 0.9;
      text-transform: uppercase;
    }

    .news-list {
      padding: clamp(2rem, 4vw, 3rem) clamp(1.5rem, 4vw, 3rem) clamp(4rem, 8vw, 8rem);
      max-width: 48rem;
    }

    .news-item { padding: 2rem 0; }

    .news-date {
      display: block;
      font-size: 0.8125rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--gray);
      margin-bottom: 0.75rem;
    }

    .news-title {
      font-size: clamp(1.25rem, 2.5vw, 1.75rem);
      font-weight: 700;
      letter-spacing: -0.01em;
      margin-bottom: 0.75rem;
    }

    .news-excerpt {
      color: var(--gray-light);
      font-size: 0.9375rem;
      line-height: 1.7;
    }
  </style>
</head>
<body>
${nav('../')}

<section class="page-title-section">
  <h1>${esc(newsPage.data.heading)}</h1>
</section>

<hr class="divider">

<div class="news-list">
  ${listHtml}
</div>

${footer()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Write all pages
// ---------------------------------------------------------------------------
const dist = join(__dirname, 'dist');

// Home
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'index.html'), buildHome(), 'utf-8');
console.log('  dist/index.html');

// Projects index
const projDir = join(dist, 'projects');
mkdirSync(projDir, { recursive: true });
writeFileSync(join(projDir, 'index.html'), buildProjectsIndex(), 'utf-8');
console.log('  dist/projects/index.html');

// Project detail pages
for (const project of projects) {
  const dir = join(projDir, project.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), buildProjectDetail(project), 'utf-8');
  console.log(`  dist/projects/${project.slug}/index.html`);
}

// News
const newsDir = join(dist, 'news');
mkdirSync(newsDir, { recursive: true });
writeFileSync(join(newsDir, 'index.html'), buildNewsIndex(), 'utf-8');
console.log('  dist/news/index.html');

console.log(`\nBuilt ${2 + projects.length + 1} pages.`);
