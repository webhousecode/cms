import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineCommand, runMain } from 'citty';
import { initCommand } from './commands/init.js';

// Load .env file from cwd
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
import { devCommand } from './commands/dev.js';
import { buildCommand } from './commands/build.js';
import { serveCommand } from './commands/serve.js';
import { aiGenerateCommand, aiRewriteCommand, aiSeoCommand } from './commands/ai.js';
import { mcpKeygenCommand, mcpTestCommand, mcpStatusCommand } from './commands/mcp.js';
import { mcpServeCommand } from './commands/mcp-serve.js';
import { exportSchemaCommand } from './commands/export-schema.js';

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

const mcpKeygen = defineCommand({
  meta: { name: 'keygen', description: 'Generate a new MCP API key' },
  args: {
    label: { type: 'string', description: 'Key label (e.g. "Claude iOS")', default: 'My key' },
    scopes: { type: 'string', description: 'Comma-separated scopes', default: 'read,write,publish,deploy,ai' },
  },
  async run({ args }) {
    await mcpKeygenCommand({ label: args.label, scopes: args.scopes });
  },
});

const mcpTest = defineCommand({
  meta: { name: 'test', description: 'Test the local MCP server' },
  args: {
    endpoint: { type: 'string', description: 'MCP endpoint URL', default: 'http://localhost:3001/api/mcp' },
  },
  async run({ args }) {
    await mcpTestCommand({ endpoint: args.endpoint });
  },
});

const mcpStatus = defineCommand({
  meta: { name: 'status', description: 'Check MCP server status' },
  args: {
    endpoint: { type: 'string', description: 'Admin server base URL', default: 'http://localhost:3001' },
  },
  async run({ args }) {
    await mcpStatusCommand({ endpoint: args.endpoint });
  },
});

const mcpServe = defineCommand({
  meta: { name: 'serve', description: 'Start stdio MCP server (for Claude Code / .mcp.json)' },
  async run() {
    await mcpServeCommand({});
  },
});

const mcp = defineCommand({
  meta: { name: 'mcp', description: 'MCP server management' },
  subCommands: { serve: mcpServe, keygen: mcpKeygen, test: mcpTest, status: mcpStatus },
});

const exportSchema = defineCommand({
  meta: {
    name: 'export-schema',
    description: 'Export cms.config.ts as JSON Schema for non-TypeScript runtimes (F125)',
  },
  args: {
    out: { type: 'string', description: 'Output file path (default: stdout)', required: false },
    baseUrl: { type: 'string', description: 'Base URL for the schema $id field', required: false },
    title: { type: 'string', description: 'Schema title', required: false },
    pretty: { type: 'boolean', description: 'Pretty-print JSON output', default: true },
    includeBlocks: { type: 'boolean', description: 'Include block definitions', default: true },
  },
  async run({ args }) {
    await exportSchemaCommand({
      out: args.out,
      baseUrl: args.baseUrl,
      title: args.title,
      pretty: args.pretty,
      includeBlocks: args.includeBlocks,
    });
  },
});

const main = defineCommand({
  meta: {
    name: 'cms',
    description: '@webhouse/cms — AI-native CMS engine',
    version: '0.1.1',
  },
  subCommands: { init, dev, build, serve, ai, mcp, 'export-schema': exportSchema },
});

runMain(main);
