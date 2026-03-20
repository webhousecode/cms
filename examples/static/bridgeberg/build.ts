import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GlobalsData {
  siteName: string;
  role: string;
  philosophy: string;
  introText: string;
  contactCta: string;
  contactNote: string;
  philosophyItems: { text: string }[];
  blogHeading: string;
  blogDescription: string;
  blogCta: string;
  projectsHeading: string;
  projectsDescription: string;
  projectsCta: string;
  contactItems: { label: string; value: string; href: string }[];
  footerCopyright: string;
  footerLinks: { label: string; href: string }[];
  instagramUrl: string;
}

interface PageData {
  title: string;
  metaDescription?: string;
  bio?: string;
  skillCategories?: { name: string; skills: string[] }[];
  timeline?: { year: string; description: string }[];
  aboutLinks?: { label: string; href: string }[];
}

interface PostData {
  title: string;
  excerpt: string;
  content: string;
  date: string;
  category: string;
  tags: string[];
}

interface ProjectData {
  title: string;
  description: string;
  status: string;
  icon: string;
  techTags: string[];
  linkLabel: string;
  linkUrl: string;
  sortOrder: number;
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
const BASE = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');

function loadCollection<T>(name: string): Document<T>[] {
  const dir = join(CONTENT_DIR, name);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Document<T>)
    .filter((d) => d.status === 'published');
}

function loadGlobals(): GlobalsData {
  return loadCollection<GlobalsData>('globals')[0].data;
}

function loadPage(slug: string): PageData {
  const doc: Document<PageData> = JSON.parse(
    readFileSync(join(CONTENT_DIR, 'pages', `${slug}.json`), 'utf-8'),
  );
  return doc.data;
}

function loadPosts(): Document<PostData>[] {
  return loadCollection<PostData>('posts').sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  );
}

function loadProjects(): Document<ProjectData>[] {
  return loadCollection<ProjectData>('projects').sort(
    (a, b) => a.data.sortOrder - b.data.sortOrder,
  );
}

// ---------------------------------------------------------------------------
// Markdown → HTML (simple converter for richtext fields)
// ---------------------------------------------------------------------------

function markdownToHtml(md: string): string {
  let html = md;
  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Paragraphs (split on double newlines)
  html = html
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^<(h[1-4]|hr|ul|ol|li|blockquote)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
    })
    .join('\n');
  return html;
}

// ---------------------------------------------------------------------------
// Category colors
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  development: { bg: '#4a5e3a', text: '#fff' },
  design: { bg: '#a68b2d', text: '#fff' },
  devops: { bg: '#2d5a8a', text: '#fff' },
  security: { bg: '#5a6a7a', text: '#fff' },
  ai: { bg: '#6a3d8a', text: '#fff' },
  'open-source': { bg: '#2d7a4a', text: '#fff' },
};

function categoryBadge(category: string): string {
  const colors = CATEGORY_COLORS[category] || { bg: '#666', text: '#fff' };
  const label = category.replace(/-/g, ' ');
  return `<span style="display:inline-block;background:${colors.bg};color:${colors.text};font-size:0.6875rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;padding:2px 8px;border-radius:2px;">${label}</span>`;
}

// ---------------------------------------------------------------------------
// Timeline year badge colors (cycle through)
// ---------------------------------------------------------------------------

const YEAR_COLORS = ['#2d7a4a', '#2d5a8a', '#a68b2d', '#6a3d8a', '#5a6a7a', '#4a5e3a'];

// ---------------------------------------------------------------------------
// Pixel strip (decorative colored blocks)
// ---------------------------------------------------------------------------

function pixelStrip(): string {
  const colors = [
    '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
    '#3498db', '#9b59b6', '#e74c3c', '#e67e22', '#f1c40f',
    '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e74c3c',
    '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db',
    '#9b59b6', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
    '#1abc9c', '#3498db', '#9b59b6', '#e74c3c', '#e67e22',
    '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6',
    '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  ];
  const blocks = colors
    .map((c) => `<span style="display:inline-block;width:16px;height:4px;background:${c};"></span>`)
    .join('');
  return `<div style="display:flex;gap:0;overflow:hidden;margin:0.75rem 0;">${blocks}</div>`;
}

// ---------------------------------------------------------------------------
// Shared HTML helpers
// ---------------------------------------------------------------------------

function css(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'JetBrains Mono', monospace;
      background: #fff;
      color: #1a1a1a;
      font-size: 14px;
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }

    a { color: #1a1a1a; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .container {
      max-width: 640px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }

    /* Header */
    .site-header {
      padding: 2.5rem 0 0;
    }
    .site-name {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .site-name a { text-decoration: none; }
    .nav-tabs {
      display: flex;
      gap: 0;
      margin-top: 0.75rem;
      border: 1px solid #e5e5e5;
      border-radius: 4px;
      overflow: hidden;
      width: fit-content;
    }
    .nav-tabs a {
      display: block;
      padding: 0.4rem 1rem;
      font-size: 0.8125rem;
      font-weight: 400;
      color: #666;
      text-decoration: none;
      border-right: 1px solid #e5e5e5;
      transition: background 0.15s, color 0.15s;
    }
    .nav-tabs a:last-child { border-right: none; }
    .nav-tabs a:hover { background: #f5f5f5; color: #1a1a1a; }
    .nav-tabs a.active { color: #1a1a1a; font-weight: 500; }

    /* Section */
    .section { margin-top: 2.5rem; }
    .section-heading {
      font-size: 0.875rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.75rem;
    }
    .section hr {
      border: none;
      border-top: 1px solid #e5e5e5;
      margin-bottom: 1rem;
    }

    /* Blockquote */
    blockquote {
      border-left: 3px solid #1a1a1a;
      padding-left: 1rem;
      font-style: italic;
      color: #444;
      margin: 1rem 0;
    }

    /* Button */
    .btn {
      display: inline-block;
      padding: 0.4rem 1rem;
      border: 1px solid #e5e5e5;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      color: #1a1a1a;
      text-decoration: none;
      transition: background 0.15s, border-color 0.15s;
    }
    .btn:hover {
      background: #f5f5f5;
      border-color: #ccc;
      text-decoration: none;
    }

    /* Contact table */
    .contact-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125rem;
    }
    .contact-table td {
      padding: 0.4rem 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .contact-table td:first-child {
      color: #666;
      width: 100px;
    }
    .contact-table a { text-decoration: underline; }

    /* Philosophy sidebar */
    .philosophy-box {
      border: 1px solid #e5e5e5;
      padding: 1rem;
      margin-top: 1rem;
      font-size: 0.75rem;
      color: #666;
    }
    .philosophy-box p {
      margin-bottom: 0.5rem;
    }
    .philosophy-box p:last-child { margin-bottom: 0; }

    /* Blog table */
    .blog-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125rem;
    }
    .blog-table th {
      text-align: left;
      font-weight: 500;
      color: #666;
      font-size: 0.6875rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 0.5rem 0.5rem 0.5rem 0;
      border-bottom: 1px solid #e5e5e5;
    }
    .blog-table td {
      padding: 0.6rem 0.5rem 0.6rem 0;
      border-bottom: 1px solid #f0f0f0;
      vertical-align: middle;
    }
    .blog-table .date-col {
      color: #999;
      white-space: nowrap;
      width: 90px;
    }
    .blog-table .title-col a {
      font-weight: 500;
      color: #1a1a1a;
    }
    .blog-table .tags-col {
      color: #999;
      font-size: 0.75rem;
    }

    /* Category filter pills */
    .filter-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .filter-pill {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border: 1px solid #e5e5e5;
      font-size: 0.75rem;
      color: #666;
      border-radius: 2px;
      text-decoration: none;
    }
    .filter-pill:hover { background: #f5f5f5; text-decoration: none; }
    .filter-pill.active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }

    /* Tag pills */
    .tag-pill {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border: 1px solid #e5e5e5;
      font-size: 0.6875rem;
      color: #666;
      border-radius: 2px;
      margin: 0.15rem 0.15rem 0.15rem 0;
      text-decoration: none;
    }

    /* Tags row */
    .tags-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 1.5rem;
    }
    .hash-tag {
      font-size: 0.75rem;
      color: #999;
    }

    /* Project cards */
    .projects-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .projects-grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    @media (max-width: 640px) {
      .projects-grid-2, .projects-grid-3 { grid-template-columns: 1fr; }
    }
    .project-card {
      border: 1px solid #e5e5e5;
      display: flex;
      flex-direction: column;
    }
    .project-card-body {
      padding: 1rem;
      flex: 1;
    }
    .project-card-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .project-card-icon { font-size: 1.25rem; }
    .project-card-name {
      font-weight: 700;
      font-size: 0.875rem;
    }
    .project-card-status {
      display: inline-block;
      font-size: 0.625rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 1px 6px;
      border-radius: 2px;
      margin-left: auto;
    }
    .status-featured { background: #2d7a4a; color: #fff; }
    .status-active { background: #2d5a8a; color: #fff; }
    .status-archived { background: #ccc; color: #666; }
    .project-card-desc {
      font-size: 0.75rem;
      color: #666;
      margin-bottom: 0.75rem;
    }
    .project-card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    .project-card-link {
      display: block;
      text-align: center;
      padding: 0.5rem;
      border-top: 1px solid #e5e5e5;
      font-size: 0.75rem;
      font-weight: 500;
      color: #1a1a1a;
      text-decoration: none;
    }
    .project-card-link:hover { background: #f5f5f5; text-decoration: none; }
    .project-card.archived {
      opacity: 0.5;
    }

    /* Skills grid */
    .skills-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    @media (max-width: 640px) {
      .skills-grid { grid-template-columns: 1fr; }
    }
    .skill-box {
      border: 1px solid #e5e5e5;
      padding: 1rem;
    }
    .skill-box-name {
      font-weight: 700;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.75rem;
      color: #666;
    }
    .skill-box-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }

    /* Timeline */
    .timeline-item {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      align-items: flex-start;
    }
    .timeline-year {
      display: inline-block;
      background: #2d7a4a;
      color: #fff;
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 2px;
      white-space: nowrap;
      min-width: 50px;
      text-align: center;
    }
    .timeline-desc {
      font-size: 0.8125rem;
      color: #444;
      padding-top: 1px;
    }

    /* Links table */
    .links-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125rem;
    }
    .links-table td {
      padding: 0.4rem 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .links-table a { text-decoration: underline; }

    /* Post detail */
    .back-link {
      display: inline-block;
      margin-bottom: 2rem;
      font-size: 0.8125rem;
      color: #666;
    }
    .back-link:hover { color: #1a1a1a; }
    .post-title {
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 0.75rem;
    }
    .post-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
      font-size: 0.8125rem;
      color: #999;
    }

    /* Prose (article body) */
    .prose h1 { font-size: 1.25rem; font-weight: 700; margin: 2rem 0 0.75rem; }
    .prose h2 { font-size: 1.125rem; font-weight: 700; margin: 2rem 0 0.75rem; }
    .prose h3 { font-size: 1rem; font-weight: 700; margin: 1.5rem 0 0.5rem; }
    .prose p { margin-bottom: 1rem; color: #333; line-height: 1.8; }
    .prose a { text-decoration: underline; }
    .prose code {
      background: #f5f5f5;
      padding: 0.15rem 0.4rem;
      border-radius: 2px;
      font-size: 0.85em;
    }
    .prose hr { border: none; border-top: 1px solid #e5e5e5; margin: 2rem 0; }
    .prose strong { font-weight: 700; }
    .prose em { font-style: italic; }

    /* Footer */
    .site-footer {
      margin-top: 4rem;
      padding: 2rem 0;
      border-top: 1px solid #e5e5e5;
      font-size: 0.6875rem;
      color: #999;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .footer-inner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .footer-links {
      display: flex;
      gap: 1.5rem;
    }
    .footer-links a {
      color: #999;
      text-decoration: none;
      font-size: 0.6875rem;
    }
    .footer-links a:hover { color: #1a1a1a; text-decoration: none; }
    .footer-built {
      width: 100%;
      text-align: center;
      margin-top: 0.5rem;
    }
    .footer-built a { color: #999; text-decoration: underline; }
    .footer-built a:hover { color: #1a1a1a; }

    /* Home layout with sidebar */
    .home-layout {
      display: grid;
      grid-template-columns: 1fr 200px;
      gap: 2rem;
      align-items: start;
    }
    @media (max-width: 640px) {
      .home-layout { grid-template-columns: 1fr; }
    }

    /* Featured project card on home */
    .featured-home-card {
      border: 1px solid #e5e5e5;
      padding: 1rem;
      margin-top: 0.75rem;
    }
    .featured-home-card-name {
      font-weight: 700;
      font-size: 0.875rem;
      margin-bottom: 0.25rem;
    }
    .featured-home-card-desc {
      font-size: 0.75rem;
      color: #666;
    }
  `;
}

function head(title: string, globals: GlobalsData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — ${globals.siteName}</title>
  <style>${css()}</style>
</head>`;
}

function nav(globals: GlobalsData, activePage: string): string {
  const items = [
    { label: 'Home', href: `${BASE}/`, key: 'home' },
    { label: 'Blog', href: `${BASE}/blog/`, key: 'blog' },
    { label: 'Projects', href: `${BASE}/projects/`, key: 'projects' },
    { label: 'About', href: `${BASE}/about/`, key: 'about' },
  ];
  const links = items
    .map((item) => {
      const dot = item.key === activePage ? '<span style="color:#2d7a4a;">&#9679;</span> ' : '';
      const cls = item.key === activePage ? ' class="active"' : '';
      return `<a href="${item.href}"${cls}>${dot}${item.label}</a>`;
    })
    .join('\n      ');

  return `
  <header class="site-header">
    <div class="container">
      <div class="site-name"><a href="${BASE}/">${globals.siteName}</a></div>
      ${pixelStrip()}
      <nav class="nav-tabs">
      ${links}
      </nav>
    </div>
  </header>`;
}

function footer(globals: GlobalsData): string {
  const links = globals.footerLinks
    .map((l) => `<a href="${l.href}">${l.label}</a>`)
    .join('\n        ');
  return `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-inner">
        <span>${globals.footerCopyright}</span>
        <div class="footer-links">
          ${links}
        </div>
      </div>
      <div class="footer-built">Built with <a href="https://webhouse.app" target="_blank" rel="noopener">@webhouse/cms</a></div>
    </div>
  </footer>`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

function buildHomePage(
  globals: GlobalsData,
  page: PageData,
  posts: Document<PostData>[],
  projects: Document<ProjectData>[],
): string {
  const contactRows = globals.contactItems
    .map(
      (c) =>
        `<tr><td>${c.label}</td><td><a href="${c.href}">${c.value}</a></td></tr>`,
    )
    .join('\n            ');

  const philosophyItems = globals.philosophyItems
    .map((p) => `<p>${p.text}</p>`)
    .join('\n          ');

  const featuredProject = projects.find((p) => p.data.status === 'featured');
  const featuredCard = featuredProject
    ? `<div class="featured-home-card">
        <div class="featured-home-card-name">${featuredProject.data.icon} ${featuredProject.data.title}</div>
        <div class="featured-home-card-desc">${featuredProject.data.description}</div>
      </div>`
    : '';

  return `${head(page.title, globals)}
<body>
  ${nav(globals, 'home')}

  <main class="container" style="padding-top:1.5rem;padding-bottom:2rem;">

    <!-- Hello section with sidebar -->
    <div class="home-layout">
      <div>
        <div class="section">
          <div class="section-heading">Hello</div>
          <hr />
          <p style="font-size:0.875rem;font-weight:500;margin-bottom:0.75rem;">${globals.role}</p>
          <blockquote>${globals.philosophy}</blockquote>
          <p style="margin:1rem 0;font-size:0.8125rem;color:#444;">${globals.introText}</p>
          <div style="display:flex;align-items:center;gap:1rem;margin-top:1rem;">
            <a href="#contact" class="btn">${globals.contactCta}</a>
            <span style="font-size:0.75rem;color:#999;">${globals.contactNote}</span>
          </div>
        </div>
      </div>

      <div>
        <div class="section">
          <div class="section-heading">Philosophy</div>
          <hr />
          <div class="philosophy-box">
            ${philosophyItems}
          </div>
        </div>
      </div>
    </div>

    <!-- Blog section -->
    <div class="section">
      <div class="section-heading">${globals.blogHeading}</div>
      <hr />
      <p style="font-size:0.8125rem;color:#666;margin-bottom:1rem;">${globals.blogDescription}</p>
      <a href="${BASE}/blog/" class="btn">${globals.blogCta}</a>
    </div>

    <!-- Projects section -->
    <div class="section">
      <div class="section-heading">${globals.projectsHeading}</div>
      <hr />
      <p style="font-size:0.8125rem;color:#666;margin-bottom:1rem;">${globals.projectsDescription}</p>
      ${featuredCard}
      <div style="margin-top:1rem;">
        <a href="${BASE}/projects/" class="btn">${globals.projectsCta}</a>
      </div>
    </div>

    <!-- Contact section -->
    <div class="section" id="contact">
      <div class="section-heading">Contact</div>
      <hr />
      <table class="contact-table">
        ${contactRows}
      </table>
    </div>

  </main>

  ${footer(globals)}
</body>
</html>`;
}

function buildBlogListing(
  globals: GlobalsData,
  page: PageData,
  posts: Document<PostData>[],
): string {
  // Collect all categories and tags
  const categories = [...new Set(posts.map((p) => p.data.category))];
  const allTags = [...new Set(posts.flatMap((p) => p.data.tags))].sort();

  const categoryPills = [
    '<span class="filter-pill active">All</span>',
    ...categories.map(
      (c) =>
        `<span class="filter-pill">${c.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</span>`,
    ),
  ].join('\n        ');

  const tagPills = allTags
    .map((t) => `<span class="hash-tag">#${t}</span>`)
    .join('\n        ');

  const rows = posts
    .map(
      (p) => `
          <tr>
            <td class="date-col">${formatDateShort(p.data.date)}</td>
            <td class="title-col"><a href="${BASE}/blog/${p.slug}/">${p.data.title}</a></td>
            <td>${categoryBadge(p.data.category)}</td>
            <td class="tags-col">${p.data.tags.map((t) => `#${t}`).join(' ')}</td>
          </tr>`,
    )
    .join('\n');

  return `${head(page.title, globals)}
<body>
  ${nav(globals, 'blog')}

  <main class="container" style="padding-top:1.5rem;padding-bottom:2rem;">

    <div class="section">
      <div class="section-heading">${page.title}</div>
      <hr />
      <p style="font-size:0.8125rem;color:#666;margin-bottom:1.5rem;">${globals.blogDescription}</p>

      <!-- Category filters -->
      <div class="filter-pills">
        ${categoryPills}
      </div>

      <!-- Tags -->
      <div class="tags-row">
        ${tagPills}
      </div>

      <!-- Posts table -->
      <table class="blog-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Title</th>
            <th>Category</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>

  </main>

  ${footer(globals)}
</body>
</html>`;
}

function buildBlogPost(
  globals: GlobalsData,
  post: Document<PostData>,
): string {
  const contentHtml = markdownToHtml(post.data.content);

  return `${head(post.data.title, globals)}
<body>
  ${nav(globals, 'blog')}

  <main class="container" style="padding-top:1.5rem;padding-bottom:2rem;">

    <a href="${BASE}/blog/" class="back-link">&larr; Back to Blog</a>

    <h1 class="post-title">${post.data.title}</h1>

    <div class="post-meta">
      <span>${formatDate(post.data.date)}</span>
      ${categoryBadge(post.data.category)}
    </div>

    <article class="prose">
      ${contentHtml}
    </article>

  </main>

  ${footer(globals)}
</body>
</html>`;
}

function buildProjectsListing(
  globals: GlobalsData,
  page: PageData,
  projects: Document<ProjectData>[],
): string {
  const featured = projects.filter((p) => p.data.status === 'featured');
  const active = projects.filter((p) => p.data.status === 'active');
  const archived = projects.filter((p) => p.data.status === 'archived');

  function projectCard(p: Document<ProjectData>, dim = false): string {
    const statusClass = `status-${p.data.status}`;
    const cardClass = dim ? 'project-card archived' : 'project-card';
    const tags = p.data.techTags
      .map((t) => `<span class="tag-pill">${t}</span>`)
      .join('');
    return `
      <div class="${cardClass}">
        <div class="project-card-body">
          <div class="project-card-header">
            <span class="project-card-icon">${p.data.icon}</span>
            <span class="project-card-name">${p.data.title}</span>
            <span class="project-card-status ${statusClass}">${p.data.status}</span>
          </div>
          <div class="project-card-desc">${p.data.description}</div>
          <div class="project-card-tags">${tags}</div>
        </div>
        <a href="${p.data.linkUrl}" class="project-card-link">${p.data.linkLabel}</a>
      </div>`;
  }

  const featuredCards = featured.map((p) => projectCard(p)).join('\n');
  const activeCards = active.map((p) => projectCard(p)).join('\n');
  const archivedCards = archived.map((p) => projectCard(p, true)).join('\n');

  return `${head(page.title, globals)}
<body>
  ${nav(globals, 'projects')}

  <main class="container" style="padding-top:1.5rem;padding-bottom:2rem;">

    <div class="section">
      <div class="section-heading">${page.title}</div>
      <hr />
      <p style="font-size:0.8125rem;color:#666;margin-bottom:2rem;">${globals.projectsDescription}</p>
    </div>

    <!-- Featured -->
    <div class="section">
      <div class="section-heading">Featured</div>
      <hr />
      <div class="projects-grid-2">
        ${featuredCards}
      </div>
    </div>

    <!-- Active -->
    <div class="section">
      <div class="section-heading">Active</div>
      <hr />
      <div class="projects-grid-3">
        ${activeCards}
      </div>
    </div>

    <!-- Archived -->
    <div class="section">
      <div class="section-heading">Archived</div>
      <hr />
      <div class="projects-grid-2">
        ${archivedCards}
      </div>
    </div>

  </main>

  ${footer(globals)}
</body>
</html>`;
}

function buildAboutPage(
  globals: GlobalsData,
  page: PageData,
): string {
  const skillBoxes = (page.skillCategories || [])
    .map(
      (cat) => `
      <div class="skill-box">
        <div class="skill-box-name">${cat.name}</div>
        <div class="skill-box-tags">
          ${cat.skills.map((s) => `<span class="tag-pill">${s}</span>`).join('\n          ')}
        </div>
      </div>`,
    )
    .join('\n');

  const timelineItems = (page.timeline || [])
    .map(
      (t, i) =>
        `<div class="timeline-item">
        <span class="timeline-year" style="background:${YEAR_COLORS[i % YEAR_COLORS.length]}">${t.year}</span>
        <span class="timeline-desc">${t.description}</span>
      </div>`,
    )
    .join('\n      ');

  const linkRows = (page.aboutLinks || [])
    .map(
      (l) => `<tr><td><a href="${l.href}">${l.label}</a></td></tr>`,
    )
    .join('\n          ');

  return `${head(page.title, globals)}
<body>
  ${nav(globals, 'about')}

  <main class="container" style="padding-top:1.5rem;padding-bottom:2rem;">

    <div class="section">
      <div class="section-heading">${page.title}</div>
      <hr />
      <p style="font-size:0.8125rem;color:#444;line-height:1.8;">${page.bio || ''}</p>
    </div>

    <!-- Skills -->
    <div class="section">
      <div class="section-heading">Skills</div>
      <hr />
      <div class="skills-grid">
        ${skillBoxes}
      </div>
    </div>

    <!-- Timeline -->
    <div class="section">
      <div class="section-heading">Timeline</div>
      <hr />
      ${timelineItems}
    </div>

    <!-- Links -->
    <div class="section">
      <div class="section-heading">Links</div>
      <hr />
      <table class="links-table">
        ${linkRows}
      </table>
    </div>

  </main>

  ${footer(globals)}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

function build() {
  const DIST = join(import.meta.dirname, 'dist');

  const globals = loadGlobals();
  const posts = loadPosts();
  const projects = loadProjects();

  console.log(`Building ${globals.siteName} — ${posts.length} posts, ${projects.length} projects`);

  // dist/
  mkdirSync(DIST, { recursive: true });

  // Home
  const homePage = loadPage('home');
  writeFileSync(join(DIST, 'index.html'), buildHomePage(globals, homePage, posts, projects));
  console.log('  -> dist/index.html');

  // Blog listing
  mkdirSync(join(DIST, 'blog'), { recursive: true });
  const blogPage = loadPage('blog');
  writeFileSync(join(DIST, 'blog', 'index.html'), buildBlogListing(globals, blogPage, posts));
  console.log('  -> dist/blog/index.html');

  // Blog post pages
  for (const post of posts) {
    const dir = join(DIST, 'blog', post.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), buildBlogPost(globals, post));
    console.log(`  -> dist/blog/${post.slug}/index.html`);
  }

  // Projects listing
  mkdirSync(join(DIST, 'projects'), { recursive: true });
  const projectsPage = loadPage('projects');
  writeFileSync(
    join(DIST, 'projects', 'index.html'),
    buildProjectsListing(globals, projectsPage, projects),
  );
  console.log('  -> dist/projects/index.html');

  // About
  mkdirSync(join(DIST, 'about'), { recursive: true });
  const aboutPage = loadPage('about');
  writeFileSync(join(DIST, 'about', 'index.html'), buildAboutPage(globals, aboutPage));
  console.log('  -> dist/about/index.html');

  console.log('\nBuild complete!');
}

build();
