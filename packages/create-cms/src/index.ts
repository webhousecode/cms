import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectName = process.argv[2] || 'my-cms-site';
const projectDir = resolve(process.cwd(), projectName);

console.log('');
console.log(`\x1b[36mi\x1b[0m Creating new CMS project: ${projectName}`);
console.log('');

if (existsSync(projectDir)) {
  console.error(`\x1b[31m✗\x1b[0m Directory already exists: ${projectDir}`);
  process.exit(1);
}

mkdirSync(projectDir, { recursive: true });
mkdirSync(join(projectDir, 'content', 'posts'), { recursive: true });

writeFileSync(join(projectDir, 'cms.config.ts'), `import { defineConfig, defineCollection } from '@webhouse/cms';

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
`, 'utf-8');

writeFileSync(join(projectDir, '.env'), `# AI provider — uncomment one:
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
`, 'utf-8');

const examplePost = {
  id: 'example-post-001',
  slug: 'hello-world',
  collection: 'posts',
  status: 'published',
  data: {
    title: 'Hello, World!',
    excerpt: 'My first post using @webhouse/cms.',
    content: '# Hello, World!\n\nWelcome to your new CMS-powered blog.\n\n## Getting Started\n\n```bash\nnpx cms dev    # Start dev server\nnpx cms build  # Build static site\n```\n\nHappy writing!\n',
    date: new Date().toISOString(),
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

writeFileSync(
  join(projectDir, 'content', 'posts', 'hello-world.json'),
  JSON.stringify(examplePost, null, 2),
  'utf-8',
);

writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
  name: projectName,
  version: '0.1.0',
  private: true,
  type: 'module',
  scripts: {
    dev: 'cms dev',
    build: 'cms build',
  },
  dependencies: {
    '@webhouse/cms': '^0.1.1',
    '@webhouse/cms-cli': '^0.1.1',
    '@webhouse/cms-ai': '^0.1.1',
  },
}, null, 2), 'utf-8');

console.log(`\x1b[32m✓\x1b[0m Project created at ${projectDir}`);
console.log('');
console.log('Next steps:');
console.log(`  cd ${projectName}`);
console.log('  npm install');
console.log('  npx cms dev      # Start dev server + admin UI');
console.log('  npx cms build    # Build static site');
console.log('');
console.log('AI content generation:');
console.log('  1. Add your ANTHROPIC_API_KEY to .env');
console.log('  2. npx cms ai generate posts "Write a blog post about..."');
console.log('');
