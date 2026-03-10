import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { logger } from '../utils/logger.js';

const CMS_CONFIG_TEMPLATE = `import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'excerpt', type: 'textarea', label: 'Excerpt' },
        { name: 'content', type: 'richtext', label: 'Content' },
        { name: 'date', type: 'date', label: 'Publish Date' },
      ],
    }),
  ],
  storage: {
    adapter: 'filesystem',
    filesystem: {
      contentDir: 'content',
    },
  },
  build: {
    outDir: 'dist',
  },
  api: {
    port: 3000,
  },
});
`;

const EXAMPLE_POST = {
  id: 'example-post-001',
  slug: 'hello-world',
  collection: 'posts',
  status: 'published',
  data: {
    title: 'Hello, World!',
    excerpt: 'My first post using @webhouse/cms.',
    content: `# Hello, World!

Welcome to your new CMS-powered blog. This post was created automatically when you ran \`cms init\`.

## Getting Started

Edit this post, create new ones, or run the build:

\`\`\`bash
# Start the dev server
npx cms dev

# Build the static site
npx cms build
\`\`\`

## Writing Content

Content is written in **Markdown**. You can use:

- **Bold** and *italic* text
- Lists like this one
- \`inline code\`
- Code blocks
- And much more!

Happy writing!
`,
    date: new Date().toISOString(),
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const PACKAGE_JSON_TEMPLATE = (name: string) => JSON.stringify({
  name,
  version: '0.1.0',
  private: true,
  type: 'module',
  scripts: {
    dev: 'cms dev',
    build: 'cms build',
  },
  dependencies: {
    '@webhouse/cms': '^0.1.0',
    '@webhouse/cms-cli': '^0.1.0',
  },
}, null, 2);

export async function initCommand(args: { name?: string; dir?: string }) {
  const projectName = args.name ?? 'my-cms-site';
  const projectDir = args.dir ? resolve(args.dir) : resolve(process.cwd(), projectName);

  logger.log('');
  logger.info(`Creating new CMS project: ${projectName}`);
  logger.log('');

  if (existsSync(projectDir)) {
    logger.error(`Directory already exists: ${projectDir}`);
    process.exit(1);
  }

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, 'content', 'posts'), { recursive: true });

  writeFileSync(join(projectDir, 'cms.config.ts'), CMS_CONFIG_TEMPLATE, 'utf-8');
  writeFileSync(join(projectDir, 'package.json'), PACKAGE_JSON_TEMPLATE(projectName), 'utf-8');
  writeFileSync(
    join(projectDir, 'content', 'posts', 'hello-world.json'),
    JSON.stringify(EXAMPLE_POST, null, 2),
    'utf-8',
  );

  logger.success(`Project created at ${projectDir}`);
  logger.log('');
  logger.log('Next steps:');
  logger.log(`  cd ${projectName}`);
  logger.log('  pnpm install');
  logger.log('  pnpm dev      # Start dev server');
  logger.log('  pnpm build    # Build static site');
  logger.log('');
}
