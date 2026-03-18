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

const SITE_NAME = 'Meridian Studio';

function head(title: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — ${SITE_NAME}</title>
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

function nav(active: 'home' | 'work' | 'about' = 'home') {
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
      <a href="/index.html" class="font-heading font-800 text-lg tracking-tight" style="font-weight:800;">${SITE_NAME}</a>
      <div class="flex items-center gap-8">
        ${linkHtml}
      </div>
    </div>
  </nav>`;
}

function footer() {
  const year = new Date().getFullYear();
  return `
  <footer class="border-t border-gray-100" style="background: #fafafa;">
    <div class="max-w-7xl mx-auto px-6 lg:px-8 py-16">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-10">
        <!-- Brand -->
        <div class="md:col-span-2">
          <p class="font-heading font-800 text-lg tracking-tight mb-3" style="font-weight:800;">${SITE_NAME}</p>
          <p class="text-[#666] text-sm leading-relaxed max-w-md">
            A creative agency crafting bold digital experiences for ambitious brands. Based in Copenhagen, working worldwide.
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
            <a href="mailto:hello@meridianstudio.co" class="footer-link">hello@meridianstudio.co</a>
            <a href="#" class="footer-link">Instagram</a>
            <a href="#" class="footer-link">LinkedIn</a>
            <a href="#" class="footer-link">Dribbble</a>
          </div>
        </div>
      </div>

      <div class="border-t border-gray-200 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p class="text-[#999] text-xs">&copy; ${year} ${SITE_NAME}. All rights reserved.</p>
        <p class="text-[#999] text-xs">Built with <a href="https://www.npmjs.com/package/@webhouse/cms" target="_blank" rel="noopener" class="hover:text-[#111] transition-colors">@webhouse/cms</a></p>
      </div>
    </div>
  </footer>`;
}

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

function buildHomePage(
  work: Document<WorkData>[],
  services: Document<ServiceData>[],
  team: Document<TeamData>[],
) {
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

  return `${head('Home')}
<body>
  ${nav('home')}

  <!-- Hero -->
  <section class="pt-32 pb-20 lg:pt-44 lg:pb-32 px-6 lg:px-8">
    <div class="max-w-5xl mx-auto text-center">
      <p class="fade-up font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-6" style="font-weight:600;">Creative Agency</p>
      <h1 class="fade-up fade-up-d1 font-heading hero-title leading-[1.08] tracking-tight mb-8" style="font-size: clamp(2.5rem, 6vw, 4.5rem); font-weight: 800;">
        We craft <span class="gradient-text">digital experiences</span> that matter
      </h1>
      <p class="fade-up fade-up-d2 text-[#666] text-lg lg:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
        Meridian Studio is a creative agency specialising in brand strategy, digital design, and web development for ambitious brands.
      </p>
      <div class="fade-up fade-up-d3">
        <a href="/work/index.html" class="btn-gradient">View Our Work</a>
      </div>
    </div>
  </section>

  <!-- Services -->
  <section class="py-20 lg:py-28 px-6 lg:px-8" style="background: #fafafa;">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <p class="font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-4" style="font-weight:600;">What We Do</p>
        <h2 class="font-heading section-title tracking-tight" style="font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;">Services</h2>
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
          <p class="font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-4" style="font-weight:600;">Selected Projects</p>
          <h2 class="font-heading section-title tracking-tight" style="font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;">Featured Work</h2>
        </div>
        <a href="/work/index.html" class="hidden md:inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
          View all &rarr;
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
        <p class="font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-4" style="font-weight:600;">The People</p>
        <h2 class="font-heading section-title tracking-tight" style="font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;">Our Team</h2>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
        ${teamCards}
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="py-24 lg:py-32 px-6 lg:px-8 text-center" style="background: linear-gradient(135deg, #6366f1, #a855f7);">
    <div class="max-w-3xl mx-auto">
      <h2 class="font-heading text-white tracking-tight mb-6" style="font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;">Ready to start your next project?</h2>
      <p class="text-white/80 text-lg mb-10">Let's create something extraordinary together.</p>
      <a href="mailto:hello@meridianstudio.co" class="inline-block px-8 py-4 bg-white text-[#111] font-heading font-700 text-sm rounded-full hover:shadow-xl transition-shadow" style="font-weight:700;">Get in Touch</a>
    </div>
  </section>

  ${footer()}
</body>
</html>`;
}

function buildWorkListingPage(work: Document<WorkData>[]) {
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

  return `${head('Work')}
<body>
  ${nav('work')}

  <section class="pt-32 pb-12 lg:pt-40 lg:pb-16 px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <p class="fade-up font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-4" style="font-weight:600;">Case Studies</p>
      <h1 class="fade-up fade-up-d1 font-heading tracking-tight" style="font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 800;">Our Work</h1>
    </div>
  </section>

  <section class="pb-20 lg:pb-28 px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        ${workCards}
      </div>
    </div>
  </section>

  ${footer()}
</body>
</html>`;
}

function buildWorkDetailPage(project: Document<WorkData>) {
  const { title, client, category, heroImage, description, year, excerpt } = project.data;
  const paragraphs = description
    .split('\n\n')
    .map((p) => `<p class="text-[#555] text-base lg:text-lg leading-relaxed mb-6">${p.trim()}</p>`)
    .join('\n          ');

  return `${head(title)}
<body>
  ${nav('work')}

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

  ${footer()}
</body>
</html>`;
}

function buildAboutPage(team: Document<TeamData>[]) {
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

  return `${head('About')}
<body>
  ${nav('about')}

  <!-- Hero -->
  <section class="pt-32 pb-16 lg:pt-44 lg:pb-24 px-6 lg:px-8">
    <div class="max-w-4xl mx-auto text-center">
      <p class="fade-up font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-6" style="font-weight:600;">About Us</p>
      <h1 class="fade-up fade-up-d1 font-heading tracking-tight mb-8" style="font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 800;">
        We believe in the power of <span class="gradient-text">thoughtful design</span>
      </h1>
      <p class="fade-up fade-up-d2 text-[#666] text-lg leading-relaxed max-w-2xl mx-auto">
        Meridian Studio was founded in 2019 with a simple conviction: great brands deserve great craft. We are a tight-knit team of strategists, designers, and developers who obsess over every detail — from the first brand brief to the final pixel.
      </p>
    </div>
  </section>

  <!-- Values -->
  <section class="py-16 lg:py-24 px-6 lg:px-8" style="background: #fafafa;">
    <div class="max-w-7xl mx-auto">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div class="text-center px-6">
          <h3 class="font-heading font-700 text-lg mb-3" style="font-weight:700;">Craft Over Convention</h3>
          <p class="text-[#666] text-sm leading-relaxed">We don't follow templates. Every project starts from a blank canvas, shaped by strategy and refined through meticulous craft.</p>
        </div>
        <div class="text-center px-6">
          <h3 class="font-heading font-700 text-lg mb-3" style="font-weight:700;">Collaboration First</h3>
          <p class="text-[#666] text-sm leading-relaxed">We work alongside our clients, not in isolation. The best results come from honest dialogue and shared ambition.</p>
        </div>
        <div class="text-center px-6">
          <h3 class="font-heading font-700 text-lg mb-3" style="font-weight:700;">Impact, Not Output</h3>
          <p class="text-[#666] text-sm leading-relaxed">We measure success by business outcomes, not deliverable lists. Every design decision connects back to your goals.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Team -->
  <section class="py-20 lg:py-28 px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <p class="font-heading font-600 text-xs tracking-[0.2em] uppercase text-[#999] mb-4" style="font-weight:600;">The Team</p>
        <h2 class="font-heading section-title tracking-tight" style="font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;">Meet the people behind the work</h2>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        ${teamCards}
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="py-24 lg:py-32 px-6 lg:px-8 text-center" style="background: linear-gradient(135deg, #6366f1, #a855f7);">
    <div class="max-w-3xl mx-auto">
      <h2 class="font-heading text-white tracking-tight mb-6" style="font-size: clamp(2rem, 4vw, 3rem); font-weight: 800;">Want to work together?</h2>
      <p class="text-white/80 text-lg mb-10">We're always looking for interesting projects and ambitious clients.</p>
      <a href="mailto:hello@meridianstudio.co" class="inline-block px-8 py-4 bg-white text-[#111] font-heading font-700 text-sm rounded-full hover:shadow-xl transition-shadow" style="font-weight:700;">Start a Conversation</a>
    </div>
  </section>

  ${footer()}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

function build() {
  const DIST = join(import.meta.dirname, 'dist');

  const work = loadCollection<WorkData>('work');
  const team = loadCollection<TeamData>('team');
  const services = loadCollection<ServiceData>('services');

  console.log(`Building agency site — ${work.length} case studies, ${team.length} team members, ${services.length} services`);

  mkdirSync(DIST, { recursive: true });

  // Home
  writeFileSync(join(DIST, 'index.html'), buildHomePage(work, services, team));
  console.log('  -> dist/index.html');

  // Work listing
  mkdirSync(join(DIST, 'work'), { recursive: true });
  writeFileSync(join(DIST, 'work', 'index.html'), buildWorkListingPage(work));
  console.log('  -> dist/work/index.html');

  // Work detail pages
  for (const project of work) {
    const dir = join(DIST, 'work', project.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), buildWorkDetailPage(project));
    console.log(`  -> dist/work/${project.slug}/index.html`);
  }

  // About
  mkdirSync(join(DIST, 'about'), { recursive: true });
  writeFileSync(join(DIST, 'about', 'index.html'), buildAboutPage(team));
  console.log('  -> dist/about/index.html');

  console.log('\nBuild complete!');
}

build();
