import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

// Base path for GitHub Pages (e.g. "/boutique-site") or "" for root domain
const BASE = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');

const DIST = path.join(ROOT, process.env.BUILD_OUT_DIR ?? 'dist');
const CONTENT = path.join(ROOT, 'content');

interface Post {
  slug: string;
  status: string;
  data: {
    title: string;
    excerpt: string;
    content: string;
    date: string;
    tags: string[];
    coverImage: string;
    author: string;
  };
}

interface Page {
  slug: string;
  status: string;
  data: {
    title: string;
    content: string;
    siteTitle?: string;
    tagline?: string;
    metaDescription?: string;
  };
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function readJsonDir<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as T);
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Convert basic markdown to HTML (for richtext content stored as markdown) */
function markdownToHtml(md: string): string {
  let html = md;

  // Blockquotes (must come before paragraph handling)
  html = html.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>');
  // Merge consecutive blockquote tags
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // Unordered lists
  html = html.replace(/(?:^- .+\n?)+/gm, (match) => {
    const items = match.trim().split('\n').map(line => `<li>${line.replace(/^- /, '')}</li>`).join('\n');
    return `<ul>\n${items}\n</ul>\n`;
  });

  // Ordered lists
  html = html.replace(/(?:^\d+\. .+\n?)+/gm, (match) => {
    const items = match.trim().split('\n').map(line => `<li>${line.replace(/^\d+\. /, '')}</li>`).join('\n');
    return `<ol>\n${items}\n</ol>\n`;
  });

  // Inline formatting
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Paragraphs: wrap standalone lines (not already wrapped in block elements)
  const lines = html.split('\n');
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push('');
    } else if (/^<(h[23]|ul|ol|li|blockquote|\/ul|\/ol|\/blockquote)/.test(trimmed)) {
      result.push(trimmed);
    } else {
      result.push(`<p>${trimmed}</p>`);
    }
  }

  return result.filter((line, i, arr) => !(line === '' && (i === 0 || i === arr.length - 1 || arr[i - 1] === ''))).join('\n');
}

// ---------------------------------------------------------------------------
// Shared HTML fragments
// ---------------------------------------------------------------------------

const HEAD = (title: string, siteTitle: string, description?: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — ${escapeHtml(siteTitle)}</title>
  ${description ? `<meta name="description" content="${escapeHtml(description)}" />` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            display: ['"Playfair Display"', 'Georgia', 'serif'],
            body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
          },
          colors: {
            warm: '#fafaf9',
            ink: '#1a1a1a',
            muted: '#6b6b6b',
            accent: '#d97706',
            'accent-light': '#fef3c7',
          },
        },
      },
    };
  </script>
  <style>
    body { font-family: 'Source Sans 3', system-ui, sans-serif; background: #fafaf9; color: #1a1a1a; }

    /* Prose — article content styling */
    .prose { max-width: 680px; margin: 0 auto; font-size: 1.125rem; line-height: 1.8; color: #1a1a1a; }
    .prose p { margin-bottom: 1.5em; }
    .prose h2 { font-family: 'Playfair Display', Georgia, serif; font-weight: 700; font-size: 1.75rem; line-height: 1.3; margin-top: 2.5em; margin-bottom: 0.75em; color: #1a1a1a; }
    .prose h3 { font-family: 'Playfair Display', Georgia, serif; font-weight: 700; font-size: 1.35rem; line-height: 1.4; margin-top: 2em; margin-bottom: 0.5em; color: #1a1a1a; }
    .prose blockquote { border-left: 4px solid #d97706; padding: 1em 1.5em; margin: 2em 0; background: #fef3c7; border-radius: 0 8px 8px 0; }
    .prose blockquote p { margin-bottom: 0; font-style: italic; color: #92400e; }
    .prose ul { list-style: disc; padding-left: 1.5em; margin-bottom: 1.5em; }
    .prose ol { list-style: decimal; padding-left: 1.5em; margin-bottom: 1.5em; }
    .prose li { margin-bottom: 0.5em; }
    .prose li strong { color: #1a1a1a; }
    .prose code { background: #f3f3f0; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
    .prose pre { background: #1a1a1a; color: #e5e5e5; padding: 1.25em; border-radius: 8px; overflow-x: auto; margin-bottom: 1.5em; }
    .prose a { color: #d97706; text-decoration: underline; text-underline-offset: 2px; }
    .prose a:hover { color: #92400e; }
    .prose img { border-radius: 8px; margin: 2em 0; }
  </style>
</head>`;

const NAV = (siteTitle: string, active?: 'blog' | 'about') => `
<nav class="border-b border-gray-200 bg-warm">
  <div class="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
    <a href="${BASE}/" class="font-display text-xl font-bold text-ink hover:text-accent transition-colors">${escapeHtml(siteTitle)}</a>
    <div class="flex gap-6 text-sm font-semibold tracking-wide uppercase">
      <a href="${BASE}/" class="${active === 'blog' ? 'text-accent' : 'text-muted hover:text-ink'} transition-colors">Blog</a>
      <a href="${BASE}/about/" class="${active === 'about' ? 'text-accent' : 'text-muted hover:text-ink'} transition-colors">About</a>
    </div>
  </div>
</nav>`;

const FOOTER = (siteTitle: string) => `
<footer class="border-t border-gray-200 mt-20">
  <div class="max-w-4xl mx-auto px-6 py-10 text-center text-sm text-muted">
    <p>&copy; ${new Date().getFullYear()} ${escapeHtml(siteTitle)}. Built with <a href="https://webhouse.app" class="text-accent hover:underline">@webhouse/cms</a>.</p>
  </div>
</footer>`;

const TAG_PILL = (tag: string) =>
  `<span class="inline-block px-3 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">${escapeHtml(tag)}</span>`;

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

function buildHome(posts: Post[], homePage: Page): string {
  const siteTitle = homePage.data.siteTitle!;
  const tagline = homePage.data.tagline!;
  const sorted = [...posts].sort((a, b) => b.data.date.localeCompare(a.data.date));

  const postCards = sorted.map(post => `
    <article class="group flex gap-6 items-start py-8 border-b border-gray-100 last:border-0">
      <a href="${BASE}/posts/${post.slug}/" class="shrink-0 hidden sm:block">
        <img src="${escapeHtml(post.data.coverImage)}" alt="" class="w-28 h-28 object-cover rounded-lg group-hover:shadow-md transition-shadow" loading="lazy" />
      </a>
      <div class="flex-1 min-w-0">
        <a href="${BASE}/posts/${post.slug}/" class="block">
          <h2 class="font-display text-2xl font-bold text-ink group-hover:text-accent transition-colors leading-tight">${escapeHtml(post.data.title)}</h2>
        </a>
        <div class="flex items-center gap-3 mt-2 text-sm text-muted">
          <time datetime="${post.data.date}">${formatDate(post.data.date)}</time>
        </div>
        <p class="mt-2 text-base text-gray-600 leading-relaxed line-clamp-2">${escapeHtml(post.data.excerpt)}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          ${post.data.tags.map(TAG_PILL).join('\n          ')}
        </div>
      </div>
    </article>`).join('\n');

  return `${HEAD('Blog', siteTitle, homePage.data.metaDescription)}
<body class="bg-warm text-ink font-body antialiased">
  ${NAV(siteTitle, 'blog')}

  <header class="max-w-4xl mx-auto px-6 pt-16 pb-8">
    <h1 class="font-display text-5xl sm:text-6xl font-extrabold tracking-tight leading-tight">${escapeHtml(siteTitle)}</h1>
    <p class="mt-4 text-lg text-muted max-w-xl">${escapeHtml(tagline)}</p>
  </header>

  <main class="max-w-4xl mx-auto px-6">
    ${postCards}
  </main>

  ${FOOTER(siteTitle)}
</body>
</html>`;
}

function buildPost(post: Post, siteTitle: string): string {
  return `${HEAD(post.data.title, siteTitle, post.data.excerpt)}
<body class="bg-warm text-ink font-body antialiased">
  ${NAV(siteTitle, 'blog')}

  <article>
    <div class="w-full max-h-[420px] overflow-hidden">
      <img src="${escapeHtml(post.data.coverImage)}" alt="" class="w-full h-[420px] object-cover" />
    </div>

    <header class="max-w-3xl mx-auto px-6 pt-10 pb-8 text-center">
      <div class="flex justify-center gap-2 mb-4">
        ${post.data.tags.map(TAG_PILL).join('\n        ')}
      </div>
      <h1 class="font-display text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">${escapeHtml(post.data.title)}</h1>
      <div class="mt-4 flex items-center justify-center gap-3 text-sm text-muted">
        <span>${escapeHtml(post.data.author)}</span>
        <span class="text-gray-300">&middot;</span>
        <time datetime="${post.data.date}">${formatDate(post.data.date)}</time>
      </div>
    </header>

    <div class="prose px-6 pb-16">
      ${markdownToHtml(post.data.content)}
    </div>
  </article>

  ${FOOTER(siteTitle)}
</body>
</html>`;
}

function buildAbout(page: Page, siteTitle: string): string {
  return `${HEAD(page.data.title, siteTitle)}
<body class="bg-warm text-ink font-body antialiased">
  ${NAV(siteTitle, 'about')}

  <header class="max-w-3xl mx-auto px-6 pt-16 pb-8 text-center">
    <h1 class="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">${escapeHtml(page.data.title)}</h1>
  </header>

  <div class="prose px-6 pb-16">
    ${markdownToHtml(page.data.content)}
  </div>

  ${FOOTER(siteTitle)}
</body>
</html>`;
}

function buildTagsIndex(posts: Post[], tagsPage: Page, siteTitle: string): string {
  const tagMap = new Map<string, Post[]>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag)!.push(post);
    }
  }

  const sortedTags = [...tagMap.entries()].sort((a, b) => b[1].length - a[1].length);

  const tagSections = sortedTags.map(([tag, tagPosts]) => {
    const sorted = [...tagPosts].sort((a, b) => b.data.date.localeCompare(a.data.date));
    const postLinks = sorted.map(p =>
      `<li class="py-2 flex items-center justify-between">
        <a href="${BASE}/posts/${p.slug}/" class="text-ink hover:text-accent transition-colors">${escapeHtml(p.data.title)}</a>
        <time datetime="${p.data.date}" class="text-sm text-muted shrink-0 ml-4">${formatDate(p.data.date)}</time>
      </li>`
    ).join('\n          ');

    return `
      <section class="mb-12">
        <div class="flex items-center gap-3 mb-4">
          ${TAG_PILL(tag)}
          <span class="text-sm text-muted">${tagPosts.length} post${tagPosts.length === 1 ? '' : 's'}</span>
        </div>
        <ul class="divide-y divide-gray-100">
          ${postLinks}
        </ul>
      </section>`;
  }).join('\n');

  return `${HEAD(tagsPage.data.title, siteTitle)}
<body class="bg-warm text-ink font-body antialiased">
  ${NAV(siteTitle)}

  <header class="max-w-3xl mx-auto px-6 pt-16 pb-8">
    <h1 class="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">${escapeHtml(tagsPage.data.title)}</h1>
    <p class="mt-4 text-lg text-muted">${escapeHtml(tagsPage.data.content)}</p>
  </header>

  <main class="max-w-3xl mx-auto px-6 pb-16">
    ${tagSections}
  </main>

  ${FOOTER(siteTitle)}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function build() {
  console.log('Building blog...');

  ensureDir(DIST);

  // Read content
  const posts = readJsonDir<Post>(path.join(CONTENT, 'posts')).filter(p => p.status === 'published');
  const pages = readJsonDir<Page>(path.join(CONTENT, 'pages')).filter(p => p.status === 'published');

  // Load site-wide data from home.json
  const homePage = pages.find(p => p.slug === 'home');
  if (!homePage) {
    console.error('ERROR: content/pages/home.json is missing or not published.');
    process.exit(1);
  }
  const siteTitle = homePage.data.siteTitle!;

  // Load tags page data
  const tagsPage = pages.find(p => p.slug === 'tags');
  if (!tagsPage) {
    console.error('ERROR: content/pages/tags.json is missing or not published.');
    process.exit(1);
  }

  // Home page
  writeFile(path.join(DIST, 'index.html'), buildHome(posts, homePage));
  console.log(`  index.html (${posts.length} posts)`);

  // Post pages
  for (const post of posts) {
    writeFile(path.join(DIST, 'posts', post.slug, 'index.html'), buildPost(post, siteTitle));
    console.log(`  posts/${post.slug}/index.html`);
  }

  // About page
  const about = pages.find(p => p.slug === 'about');
  if (about) {
    writeFile(path.join(DIST, 'about', 'index.html'), buildAbout(about, siteTitle));
    console.log('  about/index.html');
  }

  // Tags page
  writeFile(path.join(DIST, 'tags', 'index.html'), buildTagsIndex(posts, tagsPage, siteTitle));
  console.log('  tags/index.html');

  console.log(`\nDone! ${posts.length} posts, ${pages.length} pages → dist/`);
}

build();
