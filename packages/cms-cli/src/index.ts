import { defineCommand, runMain } from 'citty';
import { initCommand } from './commands/init.js';
import { devCommand } from './commands/dev.js';
import { buildCommand } from './commands/build.js';
import { serveCommand } from './commands/serve.js';
import { aiGenerateCommand, aiRewriteCommand, aiSeoCommand } from './commands/ai.js';

const init = defineCommand({
  meta: { name: 'init', description: 'Initialize a new CMS project' },
  args: {
    name: { type: 'positional', description: 'Project name', required: false, default: 'my-cms-site' },
  },
  async run({ args }) {
    await initCommand({ name: args.name });
  },
});

const dev = defineCommand({
  meta: { name: 'dev', description: 'Start the dev server' },
  args: {
    port: { type: 'string', description: 'Port number', default: '3000' },
  },
  async run({ args }) {
    await devCommand({ port: Number(args.port) });
  },
});

const build = defineCommand({
  meta: { name: 'build', description: 'Build the static site' },
  args: {
    outDir: { type: 'string', description: 'Output directory', default: 'dist' },
  },
  async run({ args }) {
    await buildCommand({ outDir: args.outDir });
  },
});

const serve = defineCommand({
  meta: { name: 'serve', description: 'Serve the built static site' },
  args: {
    port: { type: 'string', description: 'Port number', default: '5000' },
    dir: { type: 'string', description: 'Directory to serve', default: 'dist' },
  },
  async run({ args }) {
    await serveCommand({ port: Number(args.port), dir: args.dir });
  },
});

const aiGenerate = defineCommand({
  meta: { name: 'generate', description: 'Generate content with AI' },
  args: {
    collection: { type: 'positional', description: 'Collection name' },
    prompt: { type: 'positional', description: 'What to generate' },
    status: { type: 'string', description: 'Document status (draft|published)', default: 'draft' },
  },
  async run({ args }) {
    await aiGenerateCommand({
      collection: args.collection,
      prompt: args.prompt,
      status: args.status,
    });
  },
});

const aiRewrite = defineCommand({
  meta: { name: 'rewrite', description: 'Rewrite existing content with AI' },
  args: {
    ref: { type: 'positional', description: 'collection/slug' },
    instruction: { type: 'positional', description: 'Rewrite instruction' },
  },
  async run({ args }) {
    const [collection, slug] = args.ref.split('/');
    if (!collection || !slug) {
      console.error('Format: cms ai rewrite <collection>/<slug> "<instruction>"');
      process.exit(1);
    }
    await aiRewriteCommand({ collection, slug, instruction: args.instruction });
  },
});

const aiSeo = defineCommand({
  meta: { name: 'seo', description: 'Run SEO agent on all published documents' },
  args: {
    status: { type: 'string', description: 'Document status filter', default: 'published' },
  },
  async run({ args }) {
    await aiSeoCommand({ status: args.status });
  },
});

const ai = defineCommand({
  meta: { name: 'ai', description: 'AI-powered content operations' },
  subCommands: { generate: aiGenerate, rewrite: aiRewrite, seo: aiSeo },
});

const main = defineCommand({
  meta: {
    name: 'cms',
    description: '@webhouse/cms — AI-native CMS engine',
    version: '0.1.0',
  },
  subCommands: { init, dev, build, serve, ai },
});

runMain(main);
