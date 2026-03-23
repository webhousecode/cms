import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectData {
  title: string;
  category: string;
  description: string;
  heroImage: string;
  images: { url: string; alt: string }[];
}

interface AboutData {
  name: string;
  bio: string;
  photo: string;
  email: string;
}

interface HomePageData {
  title: string;
  content: string;
  metaDescription: string;
}

interface AboutPageData {
  title: string;
  label: string;
  content: string;
  metaDescription: string;
}

interface ContactPageData {
  title: string;
  label: string;
  content: string;
  metaDescription: string;
  socialLinks: { label: string; url: string }[];
}

interface Document<T> {
  slug: string;
  status: string;
  data: T;
}

// ---------------------------------------------------------------------------
// Content loaders
// ---------------------------------------------------------------------------

const CONTENT_DIR = join(import.meta.dirname, 'content');

// Base path for GitHub Pages (e.g. "/boutique-site") or "" for root domain
const BASE = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');

function loadProjects(): Document<ProjectData>[] {
  const dir = join(CONTENT_DIR, 'projects');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')))
    .filter((d: Document<ProjectData>) => d.status === 'published');
}

function loadAbout(): AboutData {
  const doc: Document<AboutData> = JSON.parse(
    readFileSync(join(CONTENT_DIR, 'about', 'bio.json'), 'utf-8'),
  );
  return doc.data;
}

function loadPage<T>(slug: string): T {
  const doc: Document<T> = JSON.parse(
    readFileSync(join(CONTENT_DIR, 'pages', `${slug}.json`), 'utf-8'),
  );
  return doc.data;
}

// ---------------------------------------------------------------------------
// Shared HTML helpers
// ---------------------------------------------------------------------------

function head(title: string, siteName: string, path: string = '') {
  const depth = path.split('/').filter(Boolean).length;
  const base = depth === 0 ? '.' : Array(depth).fill('..').join('/');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — ${siteName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root {
      --bg: #0a0a0a;
      --bg-card: #141414;
      --text: #f5f5f5;
      --text-muted: #a3a3a3;
      --accent: #d4d4d4;
      --border: #262626;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'Inter', sans-serif;
      background: var(--bg);
      color: var(--text);
      -webkit-font-smoothing: antialiased;
    }
    /* Nav */
    .nav-fixed {
      position: fixed; top: 0; left: 0; right: 0; z-index: 50;
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      background: rgba(10, 10, 10, 0.85);
      border-bottom: 1px solid var(--border);
    }
    .nav-inner {
      max-width: 1400px; margin: 0 auto;
      display: flex; align-items: center; justify-content: space-between;
      padding: 1.25rem 2rem;
    }
    .nav-logo {
      font-weight: 600; font-size: 1.125rem; letter-spacing: 0.04em;
      color: var(--text); text-decoration: none; text-transform: uppercase;
    }
    .nav-links { display: flex; gap: 2rem; list-style: none; }
    .nav-links a {
      color: var(--text-muted); text-decoration: none; font-size: 0.8125rem;
      font-weight: 400; letter-spacing: 0.06em; text-transform: uppercase;
      transition: color 0.3s;
    }
    .nav-links a:hover { color: var(--text); }
    /* Grid */
    .project-grid {
      display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;
    }
    @media (max-width: 768px) {
      .project-grid { grid-template-columns: 1fr; }
      .nav-inner { padding: 1rem 1.25rem; }
      .nav-links { gap: 1.25rem; }
    }
    .project-card {
      position: relative; overflow: hidden; aspect-ratio: 4/3; cursor: pointer;
    }
    .project-card img {
      width: 100%; height: 100%; object-fit: cover;
      transition: transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.7s;
    }
    .project-card:hover img {
      transform: scale(1.05); filter: brightness(0.7);
    }
    .project-card .overlay {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      opacity: 0; transition: opacity 0.5s;
    }
    .project-card:hover .overlay { opacity: 1; }
    .overlay h2 {
      font-size: 1.5rem; font-weight: 300; letter-spacing: 0.08em;
      text-transform: uppercase; color: #fff;
    }
    .overlay span {
      font-size: 0.75rem; font-weight: 400; letter-spacing: 0.12em;
      text-transform: uppercase; color: rgba(255,255,255,0.7); margin-top: 0.5rem;
    }
    /* Gallery grid */
    .gallery-grid {
      display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;
    }
    @media (max-width: 768px) {
      .gallery-grid { grid-template-columns: 1fr; }
    }
    .gallery-grid img {
      width: 100%; height: 100%; object-fit: cover; aspect-ratio: 3/2;
      transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    .gallery-grid img:hover { transform: scale(1.03); }
    /* Hero */
    .project-hero {
      width: 100%; height: 80vh; object-fit: cover;
    }
    /* Footer */
    .site-footer {
      border-top: 1px solid var(--border);
      padding: 3rem 2rem; text-align: center;
      color: var(--text-muted); font-size: 0.75rem;
      letter-spacing: 0.04em;
    }
    .site-footer a { color: var(--text-muted); text-decoration: none; }
    .site-footer a:hover { color: var(--text); }
    /* Fade-in animation */
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .fade-up {
      animation: fadeUp 0.8s ease-out both;
    }
    .fade-up-delay { animation-delay: 0.2s; }
    .fade-up-delay-2 { animation-delay: 0.4s; }
  </style>
</head>`;
}

function nav(siteName: string, active: 'work' | 'about' | 'contact' | '' = '') {
  const links = [
    { href: `${BASE}/index.html`, label: 'Work', key: 'work' },
    { href: `${BASE}/about/index.html`, label: 'About', key: 'about' },
    { href: `${BASE}/contact/index.html`, label: 'Contact', key: 'contact' },
  ];
  const linkHtml = links
    .map(
      (l) =>
        `<li><a href="${l.href}" style="${l.key === active ? 'color: var(--text)' : ''}">${l.label}</a></li>`,
    )
    .join('\n          ');
  return `
  <nav class="nav-fixed">
    <div class="nav-inner">
      <a href="${BASE}/index.html" class="nav-logo">${siteName}</a>
      <ul class="nav-links">
        ${linkHtml}
      </ul>
    </div>
  </nav>`;
}

function footer(siteName: string) {
  const year = new Date().getFullYear();
  return `
  <footer class="site-footer">
    <p>&copy; ${year} ${siteName}. All rights reserved.</p>
    <p style="margin-top: 0.5rem;">Built with <a href="https://webhouse.app" target="_blank" rel="noopener">@webhouse/cms</a></p>
  </footer>`;
}

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

function buildHomePage(projects: Document<ProjectData>[], homePage: HomePageData, siteName: string) {
  const cards = projects
    .map(
      (p) => `
      <a href="${BASE}/projects/${p.slug}/index.html" class="project-card">
        <img src="${p.data.heroImage}" alt="${p.data.title}" loading="lazy" />
        <div class="overlay">
          <h2>${p.data.title}</h2>
          <span>${p.data.category}</span>
        </div>
      </a>`,
    )
    .join('\n');

  return `${head(homePage.title, siteName)}
<body>
  ${nav(siteName, 'work')}

  <main style="padding-top: 73px;">
    <div class="project-grid">
      ${cards}
    </div>
  </main>

  ${footer(siteName)}
</body>
</html>`;
}

function buildProjectPage(project: Document<ProjectData>, siteName: string) {
  const { title, category, description, heroImage, images } = project.data;

  const galleryHtml = images
    .map(
      (img) =>
        `<div style="overflow: hidden;"><img src="${img.url}" alt="${img.alt}" loading="lazy" /></div>`,
    )
    .join('\n        ');

  return `${head(title, siteName, `projects/${project.slug}`)}
<body>
  ${nav(siteName)}

  <main style="padding-top: 73px;">
    <!-- Hero -->
    <img src="${heroImage}" alt="${title}" class="project-hero fade-up" />

    <!-- Info -->
    <section style="max-width: 800px; margin: 0 auto; padding: 4rem 2rem 5rem;">
      <p class="fade-up" style="font-size: 0.75rem; font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 1rem;">
        ${category}
      </p>
      <h1 class="fade-up fade-up-delay" style="font-size: 2.5rem; font-weight: 300; letter-spacing: 0.02em; line-height: 1.2; margin-bottom: 1.5rem;">
        ${title}
      </h1>
      <p class="fade-up fade-up-delay-2" style="font-size: 1.0625rem; font-weight: 300; line-height: 1.8; color: var(--text-muted);">
        ${description}
      </p>
    </section>

    <!-- Gallery -->
    <section class="gallery-grid">
      ${galleryHtml}
    </section>

    <!-- Back link -->
    <div style="text-align: center; padding: 4rem 2rem;">
      <a href="${BASE}/index.html" style="color: var(--text-muted); text-decoration: none; font-size: 0.8125rem; letter-spacing: 0.08em; text-transform: uppercase; transition: color 0.3s;"
         onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text-muted)'"
      >&larr; Back to Work</a>
    </div>
  </main>

  ${footer(siteName)}
</body>
</html>`;
}

function buildAboutPage(about: AboutData, aboutPage: AboutPageData, siteName: string) {
  return `${head(aboutPage.title, siteName, 'about')}
<body>
  ${nav(siteName, 'about')}

  <main style="padding-top: 73px;">
    <section style="max-width: 1200px; margin: 0 auto; padding: 6rem 2rem; display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; align-items: center;">
      <!-- Photo -->
      <div class="fade-up" style="overflow: hidden;">
        <img
          src="${about.photo}"
          alt="${about.name}"
          style="width: 100%; height: auto; aspect-ratio: 3/4; object-fit: cover; filter: grayscale(15%);"
        />
      </div>

      <!-- Bio -->
      <div>
        <p class="fade-up" style="font-size: 0.75rem; font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 1rem;">
          ${aboutPage.label}
        </p>
        <h1 class="fade-up fade-up-delay" style="font-size: 2.5rem; font-weight: 300; letter-spacing: 0.02em; line-height: 1.2; margin-bottom: 2rem;">
          ${about.name}
        </h1>
        <p class="fade-up fade-up-delay-2" style="font-size: 1.0625rem; font-weight: 300; line-height: 1.9; color: var(--text-muted);">
          ${about.bio}
        </p>
        <div class="fade-up fade-up-delay-2" style="margin-top: 2.5rem;">
          <a href="mailto:${about.email}" style="color: var(--text); text-decoration: none; font-size: 0.875rem; font-weight: 400; letter-spacing: 0.04em; border-bottom: 1px solid var(--border); padding-bottom: 2px; transition: border-color 0.3s;"
             onmouseover="this.style.borderColor='var(--text)'" onmouseout="this.style.borderColor='var(--border)'"
          >${about.email}</a>
        </div>
      </div>
    </section>

    <style>
      @media (max-width: 768px) {
        section { grid-template-columns: 1fr !important; gap: 2rem !important; padding: 3rem 1.25rem !important; }
      }
    </style>
  </main>

  ${footer(siteName)}
</body>
</html>`;
}

function buildContactPage(about: AboutData, contactPage: ContactPageData, siteName: string) {
  const socialLinksHtml = contactPage.socialLinks
    .map(
      (link) =>
        `<a href="${link.url}" style="color: var(--text-muted); text-decoration: none; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; transition: color 0.3s;"
           onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text-muted)'"
        >${link.label}</a>`,
    )
    .join('\n        ');

  return `${head(contactPage.title, siteName, 'contact')}
<body>
  ${nav(siteName, 'contact')}

  <main style="padding-top: 73px; min-height: 80vh; display: flex; align-items: center; justify-content: center;">
    <section style="text-align: center; padding: 4rem 2rem; max-width: 600px;">
      <p class="fade-up" style="font-size: 0.75rem; font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 1rem;">
        ${contactPage.label}
      </p>
      <h1 class="fade-up fade-up-delay" style="font-size: 2.5rem; font-weight: 300; letter-spacing: 0.02em; line-height: 1.2; margin-bottom: 1.5rem;">
        ${contactPage.title}
      </h1>
      <p class="fade-up fade-up-delay-2" style="font-size: 1.0625rem; font-weight: 300; line-height: 1.8; color: var(--text-muted); margin-bottom: 3rem;">
        ${contactPage.content}
      </p>

      <div class="fade-up fade-up-delay-2">
        <a href="mailto:${about.email}"
           style="display: inline-block; padding: 0.875rem 2.5rem; border: 1px solid var(--accent); color: var(--text); text-decoration: none; font-size: 0.8125rem; letter-spacing: 0.1em; text-transform: uppercase; transition: background 0.3s, color 0.3s;"
           onmouseover="this.style.background='var(--text)'; this.style.color='var(--bg)'" onmouseout="this.style.background='transparent'; this.style.color='var(--text)'"
        >${about.email}</a>
      </div>

      <!-- Social links -->
      <div style="display: flex; gap: 2rem; justify-content: center; margin-top: 3rem;">
        ${socialLinksHtml}
      </div>
    </section>
  </main>

  ${footer(siteName)}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

function build() {
  const DIST = join(import.meta.dirname, process.env.BUILD_OUT_DIR ?? 'dist');

  const projects = loadProjects();
  const about = loadAbout();
  const homePage = loadPage<HomePageData>('home');
  const aboutPage = loadPage<AboutPageData>('about');
  const contactPage = loadPage<ContactPageData>('contact');

  // Site name derived from content
  const siteName = about.name;

  console.log(`Building portfolio — ${projects.length} projects found`);

  mkdirSync(DIST, { recursive: true });

  // Home
  writeFileSync(join(DIST, 'index.html'), buildHomePage(projects, homePage, siteName));
  console.log('  -> dist/index.html');

  // Project pages
  for (const project of projects) {
    const dir = join(DIST, 'projects', project.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), buildProjectPage(project, siteName));
    console.log(`  -> dist/projects/${project.slug}/index.html`);
  }

  // About
  mkdirSync(join(DIST, 'about'), { recursive: true });
  writeFileSync(join(DIST, 'about', 'index.html'), buildAboutPage(about, aboutPage, siteName));
  console.log('  -> dist/about/index.html');

  // Contact
  mkdirSync(join(DIST, 'contact'), { recursive: true });
  writeFileSync(join(DIST, 'contact', 'index.html'), buildContactPage(about, contactPage, siteName));
  console.log('  -> dist/contact/index.html');

  console.log('\nBuild complete!');
}

build();
