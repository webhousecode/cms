import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkData {
  title: string;
  client: string;
  category: string;
  heroImage: string;
  excerpt: string;
  description: string;
  year: string;
}

interface TeamData {
  name: string;
  role: string;
  photo: string;
  bio: string;
}

interface ServiceData {
  title: string;
  description: string;
  icon: string;
}

interface Document<T> {
  slug: string;
  status: string;
  data: T;
}

interface HomePageData {
  title: string;
  metaDescription: string;
  hero: { label: string; heading: string; subtitle: string; ctaText: string; ctaUrl: string };
  services: { label: string; heading: string };
  featuredWork: { label: string; heading: string; viewAllText: string };
  team: { label: string; heading: string };
  cta: { heading: string; subtitle: string; buttonText: string; buttonUrl: string };
}

interface AboutPageData {
  title: string;
  metaDescription: string;
  hero: { label: string; heading: string; intro: string };
  values: { title: string; description: string }[];
  teamSection: { label: string; heading: string };
  cta: { heading: string; subtitle: string; buttonText: string; buttonUrl: string };
}

interface WorkPageData {
  title: string;
  metaDescription: string;
  hero: { label: string; heading: string };
}

interface SiteData {
  siteName: string;
  footer: {
    description: string;
    email: string;
    socialLinks: { label: string; url: string }[];
  };
}

// ---------------------------------------------------------------------------
// Content loaders
// ---------------------------------------------------------------------------

const CONTENT_DIR = join(import.meta.dirname, 'content');

function loadCollection<T>(name: string): Document<T>[] {
  const dir = join(CONTENT_DIR, name);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')))
    .filter((d: Document<T>) => d.status === 'published');
}

function loadPage<T>(slug: string): Document<T> {
  const file = join(CONTENT_DIR, 'pages', `${slug}.json`);
  return JSON.parse(readFileSync(file, 'utf-8'));
}

function loadSiteData(): SiteData {
  return JSON.parse(readFileSync(join(CONTENT_DIR, 'site.json'), 'utf-8'));
}

// ---------------------------------------------------------------------------
// Icon map (emoji)
// ---------------------------------------------------------------------------

const ICONS: Record<string, string> = {
  compass: '\u{1F9ED}',
  palette: '\u{1F3A8}',
  code: '\u{1F4BB}',
  pencil: '\u{270F}\u{FE0F}',
};

// ---------------------------------------------------------------------------
// Shared HTML helpers
// ---------------------------------------------------------------------------

function head(title: string, site: SiteData) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — ${site.siteName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            heading: ['Sora', 'sans-serif'],
            body: ['Inter', 'sans-serif'],
          },
          colors: {
            dark: '#111111',
            accent: { from: '#6366f1', to: '#a855f7' },
          },
        },
      },
    };
  </script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'Inter', sans-serif;
      background: #fff;
      color: #111;
      -webkit-font-smoothing: antialiased;
    }

    /* Gradient text utility */
    .gradient-text {
      background: linear-gradient(135deg, #6366f1, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    /* Gradient button */
    .btn-gradient {
      display: inline-block;
      padding: 1rem 2.5rem;
      background: linear-gradient(135deg, #6366f1, #a855f7);
      color: #fff;
      text-decoration: none;
      font-family: 'Sora', sans-serif;
      font-weight: 600;
      font-size: 0.875rem;
      letter-spacing: 0.04em;
      border-radius: 9999px;
      transition: transform 0.3s, box-shadow 0.3s;
    }
    .btn-gradient:hover {
      transform: translateY(-2px);
      box-shadow: 0 20px 40px rgba(99, 102, 241, 0.3);
    }

    /* Card hover */
    .card-hover {
      transition: transform 0.3s, box-shadow 0.3s;
    }
    .card-hover:hover {
      transform: translateY(-4px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
    }

    /* Work card image zoom */
    .work-card img {
      transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    .work-card:hover img {
      transform: scale(1.05);
    }

    /* Category pill */
    .pill {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1));
      color: #6366f1;
      font-family: 'Sora', sans-serif;
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      border-radius: 9999px;
    }

    /* Nav */
    .nav-fixed {
      position: fixed; top: 0; left: 0; right: 0; z-index: 50;
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      background: rgba(255, 255, 255, 0.9);
      border-bottom: 1px solid rgba(0,0,0,0.06);
    }

    /* Footer */
    .footer-link {
      color: #666; text-decoration: none; font-size: 0.875rem; transition: color 0.3s;
    }
    .footer-link:hover { color: #111; }

    /* Fade-in animation */
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .fade-up { animation: fadeUp 0.8s ease-out both; }
    .fade-up-d1 { animation-delay: 0.1s; }
    .fade-up-d2 { animation-delay: 0.2s; }
    .fade-up-d3 { animation-delay: 0.3s; }
    .fade-up-d4 { animation-delay: 0.4s; }

    /* Responsive */
    @media (max-width: 768px) {
      .hero-title { font-size: 2.5rem !important; }
      .section-title { font-size: 2rem !important; }
    }
  </style>
</head>`;
}

function nav(active: 'home' | 'work' | 'about', site: SiteData) {
  const links = [
    { href: '/index.html', label: 'Home', key: 'home' },
    { href: '/work/index.html', label: 'Work', key: 'work' },
    { href: '/about/index.html', label: 'About', key: 'about' },
  ];
  const linkHtml = links
    .map(
      (l) =>
        `<a href="${l.href}" class="font-body text-sm tracking-wide transition-colors ${l.key === active ? 'text-[#111] font-medium' : 'text-[#888] hover:text-[#111]'}">${l.label}</a>`,
    )
    .join('\n          ');
  return `
  <nav class="nav-fixed">
    <div class="max-w-7xl mx-auto flex items-center justify-between px-6 lg:px-8 py-5">
      <a href="/index.html" class="font-heading font-800 text-lg tracking-tight" style="font-weight:800;">${site.siteName}</a>
      <div class="flex items-center gap-8">
        ${linkHtml}
      </div>
    </div>
  </nav>`;
}

function footer(site: SiteData) {
  const year = new Date().getFullYear();
  const socialLinksHtml = site.footer.socialLinks
    .map((s) => `<a href="${s.url}" class="footer-link">${s.label}</a>`)
    .join('\n            ');
  return `
  <footer class="border-t border-gray-100" style="background: #fafafa;">
    <div class="max-w-7xl mx-auto px-6 lg:px-8 py-16">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-10">
        <!-- Brand -->
        <div class="md:col-span-2">
          <p class="font-heading font-800 text-lg tracking-tight mb-3" style="font-weight:800;">${site.siteName}</p>
          <p class="text-[#666] text-sm leading-relaxed max-w-md">
            ${site.footer.description}
          </p>
        </div>

        <!-- Links -->
        <div>
          <p class="font-heading font-700 text-xs tracking-widest uppercase text-[#999] mb-4" style="font-weight:700;">Navigation</p>
          <div class="flex flex-col gap-2">
            <a href="/index.html" class="footer-link">Home</a>
            <a href="/work/index.html" class="footer-link">Work</a>
            <a href="/about/index.html" class="footer-link">About</a>
          </div>
        </div>

        <!-- Contact -->
        <div>
          <p class="font-heading font-700 text-xs tracking-widest uppercase text-[#999] mb-4" style="font-weight:700;">Contact</p>
          <div class="flex flex-col gap-2">
            <a href="mailto:${site.footer.email}" class="footer-link">${site.footer.email}</a>
            ${socialLinksHtml}
          </div>
        </div>
      </div>

      <div class="border-t border-gray-200 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p class="text-[#999] text-xs">&copy; ${year} ${site.siteName}. All rights reserved.</p>
        <p class="text-[#999] text-xs">Built with <a href="https://webhouse.app" target="_blank" rel="noopener" class="hover:text-[#111] transition-colors">@webhouse/cms</a></p>
      </div>
    </div>
  </footer>`;
}

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

function buildHomePage(
  homePage: Document<HomePageData>,
  work: Document<WorkData>[],
  services: Document<ServiceData>[],
  team: Document<TeamData>[],
  site: SiteData,
) {
  const hp = homePage.data;

  const serviceCards = services
    .map(
      (s) => `
        <div class="card-hover bg-white border border-gray-100 rounded-2xl p-8">
          <div class="text-3xl mb-4">${ICONS[s.data.icon] || s.data.icon}</div>
          <h3 class="font-heading font-700 text-lg mb-3" style="font-weight:700;">${s.data.title}</h3>
          <p class="text-[#666] text-sm leading-relaxed">${s.data.description}</p>
        </div>`,
    )
    .join('\n');

  const workCards = work
    .map(
      (w) => `
        <a href="/work/${w.slug}/index.html" class="work-card group block card-hover rounded-2xl overflow-hidden bg-white border border-gray-100">
          <div class="overflow-hidden aspect-[4/3]">
            <img src="${w.data.heroImage}" alt="${w.data.title}" loading="lazy" class="w-full h-full object-cover" />
          </div>
          <div class="p-6">
            <div class="flex items-center gap-3 mb-3">
              <span class="pill">${w.data.category}</span>
              <span class="text-[#999] text-xs">${w.data.year}</span>
            </div>
            <h3 class="font-heading font-700 text-lg mb-1 group-hover:text-indigo-600 transition-colors" style="font-weight:700;">${w.data.title}</h3>
            <p class="text-[#888] text-sm">${w.data.client}</p>
          </div>
        </a>`,
    )
    .join('\n');

  const teamCards = team
    .map(
      (t) => `
        <div class="text-center">
          <div class="overflow-hidden rounded-2xl mb-4 aspect-square">
            <img src="${t.data.photo}" alt="${t.data.name}" loading="lazy" class="w-full h-full object-cover" />
          </div>
          <h3 class="font-heading font-700 text-base" style="font-weight:700;">${t.data.name}</h3>
          <p class="text-[#888] text-sm mt-1">${t.data.role}</p>
        </div>`,
    )
    .join('\n');

  return `${head(hp.title, site)}
<body>
  ${nav('home', site)}

  <!-- Hero -->
  <section class="pt-32 pb-20 lg:pt-44 lg:pb-32 px-6 lg:px-8">
    <div class="max-w-5xl mx-auto text-center">
      <p class="fade-up font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-6" style="font-weight:600;">${hp.hero.label}</p>
      <h1 class="fade-up fade-up-d1 font-heading hero-title leading-[1.08] tracking-tight mb-8" style="font-size: clamp(2.5rem, 6vw, 4.5rem); font-weight: 800;">
        ${hp.hero.heading}
      </h1>
      <p class="fade-up fade-up-d2 text-[#666] text-lg lg:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
        ${hp.hero.subtitle}
      </p>
      <div class="fade-up fade-up-d3">
        <a href="${hp.hero.ctaUrl}" class="btn-gradient">${hp.hero.ctaText}</a>
      </div>
    </div>
  </section>

  <!-- Services -->
  <section class="py-20 lg:py-28 px-6 lg:px-8" style="background: #fafafa;">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <p class="font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-4" style="font-weight:600;">${hp.services.label}</p>
        <h2 class="font-heading section-title tracking-tight" style="font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;">${hp.services.heading}</h2>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        ${serviceCards}
      </div>
    </div>
  </section>

  <!-- Featured Work -->
  <section class="py-20 lg:py-28 px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <div class="flex items-end justify-between mb-16">
        <div>
          <p class="font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-4" style="font-weight:600;">${hp.featuredWork.label}</p>
          <h2 class="font-heading section-title tracking-tight" style="font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;">${hp.featuredWork.heading}</h2>
        </div>
        <a href="/work/index.html" class="hidden md:inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
          ${hp.featuredWork.viewAllText} &rarr;
        </a>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        ${workCards}
      </div>
    </div>
  </section>

  <!-- Team -->
  <section class="py-20 lg:py-28 px-6 lg:px-8" style="background: #fafafa;">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <p class="font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-4" style="font-weight:600;">${hp.team.label}</p>
        <h2 class="font-heading section-title tracking-tight" style="font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;">${hp.team.heading}</h2>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
        ${teamCards}
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="py-24 lg:py-32 px-6 lg:px-8 text-center" style="background: linear-gradient(135deg, #6366f1, #a855f7);">
    <div class="max-w-3xl mx-auto">
      <h2 class="font-heading text-white tracking-tight mb-6" style="font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;">${hp.cta.heading}</h2>
      <p class="text-white/80 text-lg mb-10">${hp.cta.subtitle}</p>
      <a href="${hp.cta.buttonUrl}" class="inline-block px-8 py-4 bg-white text-[#111] font-heading font-700 text-sm rounded-full hover:shadow-xl transition-shadow" style="font-weight:700;">${hp.cta.buttonText}</a>
    </div>
  </section>

  ${footer(site)}
</body>
</html>`;
}

function buildWorkListingPage(
  workPage: Document<WorkPageData>,
  work: Document<WorkData>[],
  site: SiteData,
) {
  const wp = workPage.data;

  const workCards = work
    .map(
      (w) => `
        <a href="/work/${w.slug}/index.html" class="work-card group block card-hover rounded-2xl overflow-hidden bg-white border border-gray-100">
          <div class="overflow-hidden aspect-[4/3]">
            <img src="${w.data.heroImage}" alt="${w.data.title}" loading="lazy" class="w-full h-full object-cover" />
          </div>
          <div class="p-6">
            <div class="flex items-center gap-3 mb-3">
              <span class="pill">${w.data.category}</span>
              <span class="text-[#999] text-xs">${w.data.year}</span>
            </div>
            <h3 class="font-heading font-700 text-lg mb-1 group-hover:text-indigo-600 transition-colors" style="font-weight:700;">${w.data.title}</h3>
            <p class="text-[#888] text-sm mb-2">${w.data.client}</p>
            <p class="text-[#666] text-sm leading-relaxed">${w.data.excerpt}</p>
          </div>
        </a>`,
    )
    .join('\n');

  return `${head(wp.title, site)}
<body>
  ${nav('work', site)}

  <section class="pt-32 pb-12 lg:pt-40 lg:pb-16 px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <p class="fade-up font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-4" style="font-weight:600;">${wp.hero.label}</p>
      <h1 class="fade-up fade-up-d1 font-heading tracking-tight" style="font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 800;">${wp.hero.heading}</h1>
    </div>
  </section>

  <section class="pb-20 lg:pb-28 px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        ${workCards}
      </div>
    </div>
  </section>

  ${footer(site)}
</body>
</html>`;
}

function buildWorkDetailPage(project: Document<WorkData>, site: SiteData) {
  const { title, client, category, heroImage, description, year, excerpt } = project.data;
  const paragraphs = description
    .split('\n\n')
    .map((p) => `<p class="text-[#555] text-base lg:text-lg leading-relaxed mb-6">${p.trim()}</p>`)
    .join('\n          ');

  return `${head(title, site)}
<body>
  ${nav('work', site)}

  <!-- Hero Image -->
  <div class="pt-[73px]">
    <div class="w-full" style="height: 70vh; overflow: hidden;">
      <img src="${heroImage}" alt="${title}" class="w-full h-full object-cover fade-up" />
    </div>
  </div>

  <!-- Content -->
  <section class="py-16 lg:py-24 px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
        <!-- Main content -->
        <div class="lg:col-span-8">
          <h1 class="fade-up font-heading tracking-tight mb-4" style="font-size: clamp(2rem, 4vw, 3.5rem); font-weight: 800;">${title}</h1>
          <p class="fade-up fade-up-d1 text-[#888] text-lg mb-10">${excerpt}</p>
          <div class="fade-up fade-up-d2">
            ${paragraphs}
          </div>
        </div>

        <!-- Sidebar -->
        <div class="lg:col-span-4">
          <div class="fade-up fade-up-d3 sticky top-24 space-y-8 border-l border-gray-100 pl-8">
            <div>
              <p class="font-heading font-600 text-xs tracking-[0.15em] uppercase text-[#999] mb-2" style="font-weight:600;">Client</p>
              <p class="font-heading font-700 text-base" style="font-weight:700;">${client}</p>
            </div>
            <div>
              <p class="font-heading font-600 text-xs tracking-[0.15em] uppercase text-[#999] mb-2" style="font-weight:600;">Category</p>
              <span class="pill">${category}</span>
            </div>
            <div>
              <p class="font-heading font-600 text-xs tracking-[0.15em] uppercase text-[#999] mb-2" style="font-weight:600;">Year</p>
              <p class="text-base">${year}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Back link -->
  <div class="text-center pb-20">
    <a href="/work/index.html" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium transition-colors">&larr; Back to Work</a>
  </div>

  ${footer(site)}
</body>
</html>`;
}

function buildAboutPage(
  aboutPage: Document<AboutPageData>,
  team: Document<TeamData>[],
  site: SiteData,
) {
  const ap = aboutPage.data;

  const teamCards = team
    .map(
      (t) => `
        <div class="card-hover bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div class="aspect-[3/4] overflow-hidden">
            <img src="${t.data.photo}" alt="${t.data.name}" loading="lazy" class="w-full h-full object-cover" />
          </div>
          <div class="p-6">
            <h3 class="font-heading font-700 text-lg mb-1" style="font-weight:700;">${t.data.name}</h3>
            <p class="text-indigo-600 text-sm font-medium mb-3">${t.data.role}</p>
            <p class="text-[#666] text-sm leading-relaxed">${t.data.bio}</p>
          </div>
        </div>`,
    )
    .join('\n');

  const valuesHtml = ap.values
    .map(
      (v) => `
        <div class="text-center px-6">
          <h3 class="font-heading font-700 text-lg mb-3" style="font-weight:700;">${v.title}</h3>
          <p class="text-[#666] text-sm leading-relaxed">${v.description}</p>
        </div>`,
    )
    .join('\n');

  return `${head(ap.title, site)}
<body>
  ${nav('about', site)}

  <!-- Hero -->
  <section class="pt-32 pb-16 lg:pt-44 lg:pb-24 px-6 lg:px-8">
    <div class="max-w-4xl mx-auto text-center">
      <p class="fade-up font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-6" style="font-weight:600;">${ap.hero.label}</p>
      <h1 class="fade-up fade-up-d1 font-heading tracking-tight mb-8" style="font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 800;">
        ${ap.hero.heading}
      </h1>
      <p class="fade-up fade-up-d2 text-[#666] text-lg leading-relaxed max-w-2xl mx-auto">
        ${ap.hero.intro}
      </p>
    </div>
  </section>

  <!-- Values -->
  <section class="py-16 lg:py-24 px-6 lg:px-8" style="background: #fafafa;">
    <div class="max-w-7xl mx-auto">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        ${valuesHtml}
      </div>
    </div>
  </section>

  <!-- Team -->
  <section class="py-20 lg:py-28 px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <p class="font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-4" style="font-weight:600;">${ap.teamSection.label}</p>
        <h2 class="font-heading section-title tracking-tight" style="font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;">${ap.teamSection.heading}</h2>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        ${teamCards}
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="py-24 lg:py-32 px-6 lg:px-8 text-center" style="background: linear-gradient(135deg, #6366f1, #a855f7);">
    <div class="max-w-3xl mx-auto">
      <h2 class="font-heading text-white tracking-tight mb-6" style="font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;">${ap.cta.heading}</h2>
      <p class="text-white/80 text-lg mb-10">${ap.cta.subtitle}</p>
      <a href="${ap.cta.buttonUrl}" class="inline-block px-8 py-4 bg-white text-[#111] font-heading font-700 text-sm rounded-full hover:shadow-xl transition-shadow" style="font-weight:700;">${ap.cta.buttonText}</a>
    </div>
  </section>

  ${footer(site)}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

function build() {
  const DIST = join(import.meta.dirname, 'dist');

  const site = loadSiteData();
  const work = loadCollection<WorkData>('work');
  const team = loadCollection<TeamData>('team');
  const services = loadCollection<ServiceData>('services');
  const homePage = loadPage<HomePageData>('home');
  const aboutPage = loadPage<AboutPageData>('about');
  const workPage = loadPage<WorkPageData>('work');

  console.log(`Building agency site — ${work.length} case studies, ${team.length} team members, ${services.length} services`);

  mkdirSync(DIST, { recursive: true });

  // Home
  writeFileSync(join(DIST, 'index.html'), buildHomePage(homePage, work, services, team, site));
  console.log('  -> dist/index.html');

  // Work listing
  mkdirSync(join(DIST, 'work'), { recursive: true });
  writeFileSync(join(DIST, 'work', 'index.html'), buildWorkListingPage(workPage, work, site));
  console.log('  -> dist/work/index.html');

  // Work detail pages
  for (const project of work) {
    const dir = join(DIST, 'work', project.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), buildWorkDetailPage(project, site));
    console.log(`  -> dist/work/${project.slug}/index.html`);
  }

  // About
  mkdirSync(join(DIST, 'about'), { recursive: true });
  writeFileSync(join(DIST, 'about', 'index.html'), buildAboutPage(aboutPage, team, site));
  console.log('  -> dist/about/index.html');

  console.log('\nBuild complete!');
}

build();
