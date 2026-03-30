/**
 * Generate README.md for all example sites.
 * Also copies screenshots into each example directory.
 * Run: npx tsx scripts/generate-example-readmes.ts
 */
import { writeFileSync, copyFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const EXAMPLES = join(__dirname, "..", "examples");
const DOCS_SCREENSHOTS = "/Users/cb/Apps/webhouse/cms-docs/public/screenshots";

interface Example {
  dir: string;
  name: string;
  title: string;
  description: string;
  screenshot?: string; // source path
  liveUrl?: string;
  port?: number;
  collections: string;
  features: string[];
  buildCmd: string;
  devCmd: string;
}

const examples: Example[] = [
  // ── Boilerplates ──
  {
    dir: "nextjs-boilerplate",
    name: "Next.js Boilerplate",
    title: "Next.js Boilerplate",
    description: "Production-ready Next.js site with App Router, Tailwind CSS v4, dark mode, blog, block-based pages, and SEO metadata. The recommended starting point for most projects.",
    screenshot: join(DOCS_SCREENSHOTS, "boilerplate-nextjs-dark.png"),
    liveUrl: "https://nextjs-boilerplate-1x3txthik-webhhouse.vercel.app/",
    collections: "3 collections: `global` (site settings), `pages` (block-based), `posts` (blog)",
    features: [
      "Next.js 16+ with App Router and Server Components",
      "Tailwind CSS v4 with `@theme` CSS variables",
      "Dark/light mode toggle with localStorage persistence",
      "`react-markdown` with `remark-gfm` for richtext rendering",
      "`generateStaticParams` + `generateMetadata` for SEO",
      "3 block types: hero, features, CTA",
      "Blog listing + detail pages",
      "Map field with Leaflet/OpenStreetMap",
      "Responsive navbar + footer from global settings",
      "CLAUDE.md with AI builder instructions",
    ],
    buildCmd: "npm run build",
    devCmd: "npm run dev",
  },
  {
    dir: "nextjs-github-boilerplate",
    name: "Next.js GitHub Boilerplate",
    title: "Next.js GitHub Boilerplate",
    description: "Everything from the Next.js Boilerplate plus GitHub storage adapter with live content updates via signed webhooks. Content lives in a GitHub repo, each edit is a commit.",
    screenshot: join(DOCS_SCREENSHOTS, "boilerplate-nextjs-dark.png"),
    collections: "3 collections: `global`, `pages`, `posts` (same as Next.js Boilerplate)",
    features: [
      "Everything from Next.js Boilerplate",
      "GitHub storage adapter (each edit = a Git commit)",
      "LiveRefresh SSE webhooks for instant browser updates",
      "HMAC-signed revalidation endpoint (`/api/revalidate`)",
      "Content stream SSE endpoint (`/api/content-stream`)",
      "PR-based content review workflow",
    ],
    buildCmd: "npm run build",
    devCmd: "npm run dev",
  },
  {
    dir: "static-boilerplate",
    name: "Static Boilerplate",
    title: "Static Boilerplate",
    description: "Zero-framework static site generator. A custom `build.ts` reads JSON content and outputs plain HTML with Marked for markdown rendering. No React, no bundler, no runtime JS.",
    collections: "3 collections: `global`, `pages`, `posts`",
    features: [
      "Pure HTML output — zero client-side JavaScript",
      "Custom `build.ts` with Marked for markdown",
      "3 block types: hero, features, CTA",
      "Dark theme with CSS variables",
      "Map field support",
      "sitemap.xml generation",
    ],
    buildCmd: "npm run build",
    devCmd: "npx cms dev",
  },
  // ── Examples ──
  {
    dir: "blog",
    name: "Simple Blog",
    title: "Simple Blog — Thinking in Pixels",
    description: "Minimal blog using the CMS CLI directly. Two collections (posts + pages), clean design with tags and cover images.",
    screenshot: join(DOCS_SCREENSHOTS, "example-blog.png"),
    liveUrl: "https://thinking-in-pixels.fly.dev/",
    collections: "2 collections: `posts` (blog), `pages` (static pages)",
    features: [
      "CMS CLI build (`npx cms build`)",
      "Posts with title, excerpt, richtext, date, author, tags",
      "Cover images",
      "Tag-based navigation",
      "Clean, minimal design",
    ],
    buildCmd: "npm run build",
    devCmd: "npx cms dev",
  },
  {
    dir: "landing",
    name: "webhouse.app Landing",
    title: "webhouse.app Landing Page",
    description: "The actual webhouse.app marketing site. Advanced custom `build.ts` with 6 block types including terminal animation, stats bar, and MCP cards.",
    screenshot: "/tmp/screenshot-landing.png",
    liveUrl: "https://webhouse.app",
    port: 3020,
    collections: "1 collection: `pages` with 6 block types",
    features: [
      "Hero with terminal animation (command + success lines)",
      "Stats bar with animated counters",
      "Features grid with emoji icons and tags",
      "Architecture diagram section",
      "MCP cards (public + authenticated)",
      "CTA section with dual buttons",
      "Inline CSS (no external dependencies)",
    ],
    buildCmd: "npm run build:landing",
    devCmd: "npx cms dev --port 3020",
  },
  // ── Static templates ──
  {
    dir: "static/freelancer",
    name: "Freelancer",
    title: "Sarah Mitchell — Freelancer Portfolio",
    description: "Freelancer portfolio with services, pricing packages, client testimonials, blog, and contact section.",
    screenshot: join(DOCS_SCREENSHOTS, "example-freelancer-ghpages.png"),
    liveUrl: "https://cbroberg.github.io/freelancer-site/",
    collections: "Collections: `pages`, `posts`, `services`, `testimonials`",
    features: [
      "Hero with gradient background",
      "Services with pricing tiers",
      "Client testimonials carousel",
      "Blog with categories",
      "Contact section with CTA",
      "Responsive design",
    ],
    buildCmd: "npx tsx build.ts",
    devCmd: "npx cms dev",
  },
  {
    dir: "static/studio",
    name: "Meridian Studio",
    title: "Meridian Studio — Creative Agency",
    description: "Creative studio template with services, featured work portfolio, team section, and call-to-action.",
    screenshot: join(DOCS_SCREENSHOTS, "example-studio.png"),
    liveUrl: "https://cbroberg.github.io/meridian-studio-site/",
    collections: "Collections: `pages`, `work`, `team`, `services`",
    features: [
      "Services grid",
      "Featured work portfolio with images",
      "Team member cards with photos",
      "Purple gradient CTA section",
      "Clean, modern design",
    ],
    buildCmd: "npx tsx build.ts",
    devCmd: "npx cms dev",
  },
  {
    dir: "static/boutique",
    name: "AURA Boutique",
    title: "AURA — Fashion Boutique",
    description: "Product showcase with collections, editorial content, and newsletter signup. Elegant light theme with gold accents.",
    screenshot: join(DOCS_SCREENSHOTS, "example-boutique.png"),
    liveUrl: "https://boutique.webhouse.app/",
    collections: "Collections: `products`, `editorials`, `pages`",
    features: [
      "Product grid with categories",
      "Editorial/lookbook content",
      "Newsletter signup",
      "Elegant light theme",
      "Image-heavy layout",
    ],
    buildCmd: "npx tsx build.ts",
    devCmd: "npx cms dev",
  },
  {
    dir: "static/portfolio",
    name: "Elena Vasquez Portfolio",
    title: "Elena Vasquez — Visual Portfolio",
    description: "Full-screen image grid portfolio with about page and contact. Dark theme, minimal UI, maximum visual impact.",
    screenshot: join(DOCS_SCREENSHOTS, "example-portfolio.png"),
    collections: "Collections: `projects`, `pages`",
    features: [
      "Full-screen image grid (2x4)",
      "Dark theme with minimal chrome",
      "Project detail pages",
      "About + Contact pages",
      "Responsive grid layout",
    ],
    buildCmd: "npx tsx build.ts",
    devCmd: "npx cms dev",
  },
  {
    dir: "static/portfolio-squared",
    name: "Elina Voss Portfolio²",
    title: "Elina Voss — Portfolio Squared",
    description: "Alternative portfolio layout with 2x2 image grid. Dark theme with nav bar.",
    screenshot: join(DOCS_SCREENSHOTS, "example-freelancer.png"),
    collections: "Collections: `projects`, `pages`",
    features: [
      "2x2 image grid layout",
      "Navigation bar with links",
      "Dark theme",
      "Project showcase",
    ],
    buildCmd: "npx tsx build.ts",
    devCmd: "npx cms dev",
  },
  {
    dir: "static/agency",
    name: "Agency",
    title: "Digital Agency Template",
    description: "Full agency website with case studies, team, services, and blog. Professional design with multiple page types.",
    screenshot: "/tmp/screenshot-agency.png",
    collections: "Collections: `work`, `team`, `services`, `posts`, `pages`",
    features: [
      "Case study portfolio",
      "Team member profiles",
      "Services with descriptions",
      "Blog with categories",
      "Contact page",
      "Multiple page layouts",
    ],
    buildCmd: "npx tsx build.ts",
    devCmd: "npx cms dev",
  },
  {
    dir: "static/bridgeberg",
    name: "Bridgeberg",
    title: "Bridgeberg — Developer Portfolio",
    description: "Developer/engineer portfolio with blog, projects, and about page. Technical focus with code-friendly design.",
    screenshot: "/tmp/screenshot-bridgeberg.png",
    collections: "Collections: `posts`, `projects`, `pages`",
    features: [
      "Blog with tech categories (AI, web, architecture, CMS)",
      "Project portfolio",
      "About page with timeline",
      "Clean, developer-focused design",
    ],
    buildCmd: "npx tsx build.ts",
    devCmd: "npx cms dev",
  },
  {
    dir: "static/blog",
    name: "Static Blog",
    title: "Static Blog Template",
    description: "Simple blog with posts, pages, tags, and cover images. The most basic starting point for a blog.",
    collections: "Collections: `posts`, `pages`",
    features: [
      "Posts with title, excerpt, content, date, tags",
      "Cover images",
      "Static pages",
      "Minimal design",
    ],
    buildCmd: "npx tsx build.ts",
    devCmd: "npx cms dev",
  },
];

let count = 0;

for (const ex of examples) {
  const dir = join(EXAMPLES, ex.dir);
  if (!existsSync(dir)) {
    console.log(`  ✗ ${ex.dir} — directory not found`);
    continue;
  }

  // Copy screenshot if available
  let screenshotRef = "";
  if (ex.screenshot && existsSync(ex.screenshot)) {
    const dest = join(dir, "screenshot.png");
    copyFileSync(ex.screenshot, dest);
    screenshotRef = "\n![Screenshot](screenshot.png)\n";
  }

  const liveLink = ex.liveUrl ? `\n**Live demo:** [${ex.liveUrl}](${ex.liveUrl})\n` : "";
  const docsLink = `\n**Documentation:** [docs.webhouse.app/docs/templates](https://docs.webhouse.app/docs/templates)\n`;

  const readme = `# ${ex.title}
${screenshotRef}
${ex.description}
${liveLink}${docsLink}
## Quick Start

\`\`\`bash
# Clone this example
git clone https://github.com/webhousecode/cms.git
cd cms/examples/${ex.dir}
npm install

# Start development
${ex.devCmd}

# Build for production
${ex.buildCmd}
\`\`\`

## Collections

${ex.collections}

## Features

${ex.features.map(f => `- ${f}`).join("\n")}

## Project Structure

\`\`\`
${ex.dir}/
  cms.config.ts       → Collection + field definitions
  content/            → JSON content files
  ${ex.dir.includes("static") || ex.dir === "blog" || ex.dir === "landing" ? "build.ts          → Static site generator" : "src/               → Next.js app source"}
  ${ex.dir.includes("static") || ex.dir === "blog" || ex.dir === "landing" ? "dist/              → Built output" : ".next/             → Build output"}
  public/             → Static assets + uploads
\`\`\`

## Managing Content

### Option 1: CMS Admin UI

\`\`\`bash
npx @webhouse/cms-admin-cli
# Opens visual editor at http://localhost:3010
\`\`\`

### Option 2: Edit JSON directly

Content is stored as JSON files in \`content/\`. Each file is one document:

\`\`\`json
{
  "slug": "my-page",
  "status": "published",
  "data": {
    "title": "My Page",
    "content": "Markdown content here..."
  },
  "id": "unique-id",
  "_fieldMeta": {}
}
\`\`\`

### Option 3: AI via Chat

Open CMS admin → click **Chat** → describe what you want in natural language.

## Deployment

\`\`\`bash
# Vercel
npx vercel

# GitHub Pages
# Push dist/ to gh-pages branch

# Fly.io
fly deploy
\`\`\`

See [Deployment docs](https://docs.webhouse.app/docs/deployment) for detailed guides.

## Learn More

- [Templates & Boilerplates](https://docs.webhouse.app/docs/templates) — all available templates
- [Configuration Reference](https://docs.webhouse.app/docs/config-reference) — cms.config.ts options
- [Field Types](https://docs.webhouse.app/docs/field-types) — all 22 field types
- [webhouse.app](https://webhouse.app) — the AI-native CMS

---

Built with [@webhouse/cms](https://github.com/webhousecode/cms)
`;

  writeFileSync(join(dir, "README.md"), readme);
  console.log(`  ✓ ${ex.dir}/README.md`);
  count++;
}

console.log(`\n✓ ${count} README files generated`);
