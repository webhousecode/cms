import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const projectName = process.argv[2] || 'my-cms-site';
const projectDir = resolve(process.cwd(), projectName);

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

Use the \`@webhouse/cms\` SDK to load content:

\`\`\`ts
import { loadContent } from '@webhouse/cms';

// Load all entries in a collection
const posts = await loadContent('posts');

// Load a single entry by slug
const post = await loadContent('posts', 'hello-world');
\`\`\`

## Adding new collections

Edit \`cms.config.ts\` and add a new \`defineCollection()\` block.
After adding a collection, restart the CMS admin to see it.

## Running the CMS admin

\`\`\`bash
npx @webhouse/cms-cli dev     # Local admin UI
\`\`\`

Or use **webhouse.app** for the hosted admin experience.

## Reference

See the [\`@webhouse/cms\` CLAUDE.md](https://github.com/webhousecode/cms/blob/main/CLAUDE.md) for full field type documentation and API reference.
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
    '@webhouse/cms': '^0.1.2',
    '@webhouse/cms-cli': '^0.1.2',
  },
}, null, 2) + '\n');

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
console.log(bold('Next steps:'));
console.log('');
console.log(`  ${dim('$')} cd ${projectName}`);
console.log(`  ${dim('$')} npx @webhouse/cms-cli dev   ${dim('# Start CMS admin UI')}`);
console.log('');
console.log(bold('AI content generation:'));
console.log('');
console.log(`  1. Add your ANTHROPIC_API_KEY to .env`);
console.log(`  2. ${dim('$')} npx @webhouse/cms-cli ai generate posts "Write a blog post about..."`);
console.log('');
console.log(bold('MCP integration:'));
console.log('');
console.log(`  .mcp.json is already configured — Claude Code and other`);
console.log(`  MCP-compatible agents can manage your content automatically.`);
console.log('');
