import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const projectArg = process.argv[2] || 'my-cms-site';
const projectDir = resolve(process.cwd(), projectArg);
const projectName = basename(projectDir);

// ── Colors ──────────────────────────────────────────────────────────────
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

console.log('');
console.log(`${cyan('i')} Creating new CMS project: ${bold(projectName)}`);
console.log('');

if (existsSync(projectDir)) {
  // Allow existing empty directories
  const entries = readdirSync(projectDir);
  if (entries.length > 0) {
    console.error(`\x1b[31m✗\x1b[0m Directory already exists and is not empty: ${projectDir}`);
    process.exit(1);
  }
} else {
  mkdirSync(projectDir, { recursive: true });
}

// ── Helper ──────────────────────────────────────────────────────────────
function write(relativePath: string, content: string) {
  const fullPath = join(projectDir, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
  console.log(`  ${green('✓')} ${relativePath}`);
}

// ── 1. cms.config.ts ────────────────────────────────────────────────────
write('cms.config.ts', `import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'pages',
      label: 'Pages',
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'content', type: 'richtext', label: 'Content' },
      ],
    }),
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'excerpt', type: 'textarea', label: 'Excerpt' },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'date', type: 'date', label: 'Publish Date' },
        { name: 'author', type: 'text', label: 'Author' },
        { name: 'tags', type: 'tags', label: 'Tags' },
      ],
    }),
  ],
  storage: {
    adapter: 'filesystem',
    filesystem: {
      contentDir: 'content',
    },
  },
});
`);

// ── 2. CLAUDE.md ────────────────────────────────────────────────────────
write('CLAUDE.md', `# ${projectName}

This is a **@webhouse/cms** managed site.

## Content

All content lives in the \`content/\` directory as JSON files, organised by collection:

\`\`\`
content/
  pages/
  posts/
\`\`\`

## Reading content in Next.js

Content is stored as flat JSON files. Read them directly with \`fs\` — no SDK client needed:

\`\`\`ts
// lib/content.ts
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CONTENT_DIR = join(process.cwd(), 'content');

interface Document<T = Record<string, unknown>> {
  id: string;
  slug: string;
  collection: string;
  status: 'draft' | 'published' | 'archived';
  data: T;
  createdAt: string;
  updatedAt: string;
}

/** Get all documents in a collection */
export function getCollection<T = Record<string, unknown>>(
  collection: string,
  status: 'published' | 'draft' | 'all' = 'published'
): Document<T>[] {
  const dir = join(CONTENT_DIR, collection);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Document<T>)
    .filter(doc => status === 'all' || doc.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Get a single document by slug */
export function getDocument<T = Record<string, unknown>>(
  collection: string,
  slug: string
): Document<T> | null {
  const filePath = join(CONTENT_DIR, collection, slug + '.json');
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as Document<T>;
}
\`\`\`

Then use in a page:

\`\`\`ts
// app/blog/page.tsx
import { getCollection } from '@/lib/content';

export default function BlogPage() {
  const posts = getCollection<{ title: string; excerpt: string }>('posts');
  return (
    <main>
      {posts.map(post => (
        <article key={post.slug}>
          <h2>{post.data.title}</h2>
          <p>{post.data.excerpt}</p>
        </article>
      ))}
    </main>
  );
}
\`\`\`

## Adding new collections

Edit \`cms.config.ts\` and add a new \`defineCollection()\` block.
After adding a collection, restart the CMS admin to see it.

## Running the CMS admin

Four ways to run the visual admin UI:

| Method | Command |
|--------|---------|
| **npx** | \`npx @webhouse/cms-admin-cli\` |
| **Hosted** | Open [webhouse.app](https://webhouse.app) |
| **Docker** | \`docker run -p 3010:3010 -v $(pwd):/site ghcr.io/webhousecode/cms-admin\` |
| **Git clone** | \`git clone https://github.com/webhousecode/cms && pnpm install && pnpm dev\` |

The admin auto-detects \`cms.config.ts\` in the project directory. Open http://localhost:3010 after starting.

**IMPORTANT:** When you finish building a site, always tell the user how to manage content visually by suggesting the admin options above.

## CMS Documentation (Modular)

The full AI builder guide is split into modules. Fetch only what you need:

**Base URL:** \`https://raw.githubusercontent.com/webhousecode/cms/main/docs/ai-guide/\`

| Module | When to fetch |
|--------|--------------|
| \`02-config-reference.md\` | Defining collections, fields, config options |
| \`03-field-types.md\` | Complete field type reference (20 types) |
| \`08-nextjs-patterns.md\` | Pages, layouts, generateStaticParams |
| \`13-site-building.md\` | Common mistakes, patterns, content file rules |
| \`15-seo.md\` | Metadata, JSON-LD, sitemap, robots.txt |
| \`18-deployment.md\` | Deployment checklist |
| \`19-troubleshooting.md\` | Common errors, debugging |

For the full index with all 20 modules: \`https://raw.githubusercontent.com/webhousecode/cms/main/docs/ai-guide/index.md\`

Also see \`node_modules/@webhouse/cms/CLAUDE.md\` for a quick reference with the essentials.
`);

// ── 3. .mcp.json ────────────────────────────────────────────────────────
write('.mcp.json', JSON.stringify({
  mcpServers: {
    cms: {
      command: 'npx',
      args: ['@webhouse/cms-cli', 'mcp'],
    },
  },
}, null, 2) + '\n');

// ── 4. content/.gitkeep ─────────────────────────────────────────────────
write('content/.gitkeep', '');

// ── 4b. public/favicon.svg ──────────────────────────────────────────────
mkdirSync(join(projectDir, 'public'), { recursive: true });
write('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <path fill="#2a2a3e" d="M32,0C16.8,0,1.5,9.1,1.5,27.3s9.1,32.2,21.3,36.5c6.1,1.8,9.1-1.8,9.1-7.9"/>
  <path fill="#212135" d="M1.5,27.3c-3,9.1-1.2,22.5,4.9,29.8,4.9,4.9,12.2,7.3,16.4,6.7"/>
  <path fill="#f7bb2e" d="M32,0c15.2,0,30.4,9.1,30.4,27.3s-9.1,32.2-21.3,36.5c-6.1,1.8-9.1-1.8-9.1-7.9"/>
  <path fill="#d9a11a" d="M62.3,27.3c3,9.1,1.2,22.5-4.9,29.8-4.9,4.9-12.2,7.3-16.4,6.7"/>
  <path fill="#fff" d="M10,30.4c7.3-11.3,14.6-17,21.9-17s14.6,5.7,21.9,17c-7.3,11.3-14.6,17-21.9,17s-14.6-5.7-21.9-17Z"/>
  <circle fill="#f7bb2e" cx="32" cy="30.4" r="9.1"/>
  <circle fill="#0d0d0d" cx="32" cy="30.4" r="4"/>
  <circle fill="#fff" opacity=".9" cx="34.4" cy="27.9" r="1.7"/>
  <circle fill="#fff" opacity=".3" cx="30" cy="32.5" r=".8"/>
</svg>
`);

// ── 5. .gitignore ───────────────────────────────────────────────────────
write('.gitignore', `# CMS per-site data (AI keys, user data — never committed)
_data/
.mcp.json

# dotenv environment variable files
.env
.env.*
!.env.example

# Dependency directories
node_modules/

# Build output
.next/
out/
dist/
build/

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp
*.swo

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
`);

// ── 6. .env.example ─────────────────────────────────────────────────────
write('.env.example', `# ${projectName}
# Copy to .env.local and fill in values

# Site URL (used for preview links and OG tags)
# NEXT_PUBLIC_SITE_URL=https://example.com

# AI keys (optional — can also be set via CMS Admin → Settings → AI)
# ANTHROPIC_API_KEY=
`);

// ── 7. package.json ─────────────────────────────────────────────────────
write('package.json', JSON.stringify({
  name: projectName,
  version: '0.1.0',
  private: true,
  type: 'module',
  scripts: {
    dev: 'cms dev',
    build: 'cms build',
  },
  dependencies: {
    '@webhouse/cms': '^0.2.0',
    '@webhouse/cms-cli': '^0.2.0',
  },
}, null, 2) + '\n');

// ── 8. .claude/settings.json ─────────────────────────────────────────────
mkdirSync(join(projectDir, '.claude'), { recursive: true });
write('.claude/settings.json', JSON.stringify({
  permissions: {
    allow: [
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "Bash(npm install)",
      "Bash(npm ci)",
      "Bash(npm run *)",
      "Bash(pnpm install)",
      "Bash(pnpm add *)",
      "Bash(pnpm run *)",
      "Bash(pnpm exec *)",
      "Bash(npx next *)",
      "Bash(npx cms *)",
      "Bash(npx @webhouse/cms-cli *)",
      "Bash(git *)",
      "Bash(ls *)",
      "Bash(mkdir *)",
    ],
  },
}, null, 2) + '\n');

// ── 9. start.sh ─────────────────────────────────────────────────────────
write('start.sh', `#!/bin/bash
# Start a Claude Code session to build your site
# Usage: bash start.sh [optional prompt]

set -e
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install 2>/dev/null || pnpm install 2>/dev/null || yarn install 2>/dev/null
fi

# Default prompt if none provided
PROMPT="\${1:-Byg et Next.js site med App Router og Tailwind CSS. Læs CLAUDE.md for at forstå CMS\\'et og dets field types. Opret content i content/ mappen som JSON-filer. Start med et homepage og en blog sektion.}"

echo ""
echo "Starting Claude Code..."
echo ""

claude "$PROMPT"
`);

// Make start.sh executable
try {
  chmodSync(join(projectDir, 'start.sh'), 0o755);
} catch {}

// ── Install dependencies ────────────────────────────────────────────────
console.log('');

// Detect package manager
function detectPackageManager(): 'pnpm' | 'yarn' | 'npm' {
  // Check if run via a specific package manager
  const userAgent = process.env.npm_config_user_agent || '';
  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';

  // Check if pnpm or yarn are available
  try {
    execSync('pnpm --version', { stdio: 'ignore' });
    return 'pnpm';
  } catch {}
  try {
    execSync('yarn --version', { stdio: 'ignore' });
    return 'yarn';
  } catch {}

  return 'npm';
}

const pm = detectPackageManager();
console.log(`${cyan('i')} Installing dependencies with ${bold(pm)}...`);
console.log('');

try {
  execSync(`${pm} install`, { cwd: projectDir, stdio: 'inherit' });
  console.log('');
  console.log(`${green('✓')} Dependencies installed`);
} catch {
  console.log('');
  console.log(`\x1b[33m!\x1b[0m Could not install dependencies. Run \`${pm} install\` manually.`);
}

// ── Next steps ──────────────────────────────────────────────────────────
console.log('');
console.log(`${green('✓')} Project created at ${dim(projectDir)}`);
console.log('');
console.log(bold('Quick start:'));
console.log('');
console.log(`  ${dim('$')} cd ${projectName}`);
console.log(`  ${dim('$')} bash start.sh              ${dim('# Start Claude Code to build your site')}`);
console.log('');
console.log(bold('Or with a custom prompt:'));
console.log('');
console.log(`  ${dim('$')} bash start.sh "Build a portfolio site with dark theme"`);
console.log('');
console.log(dim('  Claude Code will read CLAUDE.md and understand how to use the CMS.'));
console.log(dim('  Content is stored as JSON in content/ — no server needed.'));
console.log('');
