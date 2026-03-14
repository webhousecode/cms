<p align="center">
  <img src="logo/webhouse.app-dark.svg" alt="webhouse.app" width="340" />
</p>

<p align="center">
  <strong>AI-native content engine — open source</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@webhouse/cms"><img src="https://img.shields.io/npm/v/@webhouse/cms.svg" alt="npm version" /></a>
  <a href="https://github.com/webhousecode/cms/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@webhouse/cms.svg" alt="license" /></a>
  <a href="https://webhouse.app"><img src="https://img.shields.io/badge/admin-webhouse.app-F7BB2E" alt="webhouse.app" /></a>
</p>

---

Define your content in TypeScript. Manage it visually. Let AI help write it. Deploy anywhere.

```bash
npm create @webhouse/cms my-site
cd my-site
bash start.sh
```

That's it. Claude Code reads your schema, builds a Next.js site, and you manage content through the admin UI.

---

## What is this?

WebHouse CMS is a **file-based, code-first content management system**. You define collections and fields in `cms.config.ts`, and the CMS stores content as flat JSON files in a `content/` directory. No database required. Git-committable. AI-native from day one.

```typescript
// cms.config.ts
import { defineConfig, defineCollection } from '@webhouse/cms';

export default defineConfig({
  collections: [
    defineCollection({
      name: 'posts',
      label: 'Blog Posts',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'excerpt', type: 'textarea' },
        { name: 'content', type: 'richtext' },
        { name: 'date', type: 'date' },
        { name: 'author', type: 'relation', collection: 'team' },
        { name: 'tags', type: 'tags' },
        { name: 'featured', type: 'boolean' },
      ],
    }),
  ],
});
```

Content is stored as JSON — read it directly in Next.js, Astro, or any framework:

```typescript
// Read content — no SDK, no API, just files
import { readFileSync } from 'node:fs';
const post = JSON.parse(readFileSync('content/posts/hello-world.json', 'utf-8'));
console.log(post.data.title); // "Hello, World!"
```

---

## Admin UI — 4 ways to run it

The visual admin interface for managing content. Open source, full-featured, works with any site.

### 1. Hosted cloud (coming soon)

```
https://webhouse.app
```

Sign in, connect your GitHub repo, manage content from anywhere. Zero setup.

### 2. npx — one command, local install

```bash
npx @webhouse/cms-admin-cli
```

Auto-detects `cms.config.ts` in your project. First run builds and caches the admin (~2 min). Subsequent starts are instant.

```bash
npx @webhouse/cms-admin-cli --config ./cms.config.ts  # explicit config
npx @webhouse/cms-admin-cli -p 4000                    # custom port
npx @webhouse/cms-admin-cli --update                   # force rebuild
```

### 3. Docker — isolated, reproducible

```bash
docker run -p 3010:3010 -v $(pwd):/site ghcr.io/webhousecode/cms-admin
```

Mounts your project at `/site`, auto-detects `cms.config.ts`, serves admin on port 3010.

### 4. Git clone — full source access

```bash
git clone https://github.com/webhousecode/cms.git
cd cms
pnpm install
pnpm dev
```

Admin runs on `localhost:3010`. Set `CMS_CONFIG_PATH` to point at your site's config.

---

## Features

### Content engine
- **16 field types** — text, textarea, richtext, number, boolean, date, image, video, select, tags, relation, array, object, blocks, image-gallery
- **Block editor** — composable page sections with nested fields
- **Relations** — cross-collection references (single and multi)
- **Structured arrays** — arrays of objects with per-item field editors
- **Nested objects** — deeply nested field structures with JSON/UI toggle
- **i18n** — multi-locale content with AI-powered translation
- **Scheduled publishing** — set a future date, auto-publishes

### Admin UI
- **Visual document editor** — every field type has a dedicated editor
- **Block editor** — drag-and-drop sections with type picker
- **Multi-site management** — manage multiple sites from one admin
- **GitHub integration** — OAuth login, create repos, manage GitHub-backed content
- **Site switcher** — fast switching between projects
- **Rich text editor** — Markdown with live preview
- **Media library** — upload, browse, and manage images
- **Revision history** — view diffs and restore previous versions
- **AI assistant** — generate, rewrite, and optimize content from the editor

### AI-native
- **Content generation** — `cms ai generate posts "Write about TypeScript generics"`
- **Rewriting** — `cms ai rewrite posts/hello "Make it more concise"`
- **SEO optimization** — `cms ai seo` across all published content
- **AI Lock** — field-level protection prevents AI from overwriting human edits
- **Brand voice** — configurable tone, audience, and style guidelines
- **MCP support** — expose content to AI assistants via Model Context Protocol

### Developer experience
- **TypeScript-first** — schemas defined in code, fully typed
- **File-based** — JSON files in `content/`, git-committable
- **No database** — filesystem adapter by default, SQLite and GitHub also available
- **CLI tools** — init, dev, build, serve, AI commands
- **Claude Code ready** — CLAUDE.md included in npm package, `.mcp.json` pre-configured

---

## Storage adapters

| Adapter | Description | Best for |
|---------|-------------|----------|
| **Filesystem** (default) | JSON files in `content/` | Local dev, git workflows |
| **GitHub** | Read/write via GitHub API | Headless sites, multi-editor |
| **SQLite** | Local database via Drizzle ORM | API-heavy use cases |

```typescript
// Filesystem (default)
storage: { adapter: 'filesystem', filesystem: { contentDir: 'content' } }

// GitHub
storage: { adapter: 'github', github: { owner: 'myorg', repo: 'my-site', token: process.env.GITHUB_TOKEN } }

// SQLite
storage: { adapter: 'sqlite', sqlite: { path: './data/cms.db' } }
```

---

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@webhouse/cms`](packages/cms) | Core engine — schema, storage, content service | [![npm](https://img.shields.io/npm/v/@webhouse/cms.svg)](https://www.npmjs.com/package/@webhouse/cms) |
| [`@webhouse/cms-cli`](packages/cms-cli) | CLI — init, dev, build, AI commands, MCP server | [![npm](https://img.shields.io/npm/v/@webhouse/cms-cli.svg)](https://www.npmjs.com/package/@webhouse/cms-cli) |
| [`@webhouse/cms-ai`](packages/cms-ai) | AI agents — generate, rewrite, translate, SEO | [![npm](https://img.shields.io/npm/v/@webhouse/cms-ai.svg)](https://www.npmjs.com/package/@webhouse/cms-ai) |
| [`@webhouse/cms-admin-cli`](packages/cms-admin-cli) | Run admin UI locally via npx | [![npm](https://img.shields.io/npm/v/@webhouse/cms-admin-cli.svg)](https://www.npmjs.com/package/@webhouse/cms-admin-cli) |
| [`@webhouse/cms-mcp-client`](packages/cms-mcp-client) | Public read-only MCP server | [![npm](https://img.shields.io/npm/v/@webhouse/cms-mcp-client.svg)](https://www.npmjs.com/package/@webhouse/cms-mcp-client) |
| [`@webhouse/cms-mcp-server`](packages/cms-mcp-server) | Authenticated MCP server (full CRUD) | [![npm](https://img.shields.io/npm/v/@webhouse/cms-mcp-server.svg)](https://www.npmjs.com/package/@webhouse/cms-mcp-server) |
| [`@webhouse/create-cms`](packages/create-cms) | Project scaffolder — `npm create @webhouse/cms` | [![npm](https://img.shields.io/npm/v/@webhouse/create-cms.svg)](https://www.npmjs.com/package/@webhouse/create-cms) |

---

## CLI

Install globally for the short `cms` command:

```bash
npm install -g @webhouse/cms-cli
```

> **Note:** Do not use `npx cms` — npm resolves it to an unrelated package. Use `npx @webhouse/cms-cli` if you prefer not to install globally.

### Commands

| Command | Description |
|---------|-------------|
| `cms init [name]` | Scaffold a new project |
| `cms dev [--port 3000]` | Start dev server with REST API and hot reload |
| `cms build [--outDir dist]` | Build static site (HTML, sitemap, llms.txt) |
| `cms serve [--port 5000]` | Serve built site locally |

### AI commands

Require `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env`.

| Command | Description |
|---------|-------------|
| `cms ai generate <collection> "<prompt>"` | Generate a new document with AI |
| `cms ai rewrite <collection>/<slug> "<instruction>"` | Rewrite existing content |
| `cms ai seo [--status published]` | Run SEO optimization across all documents |

```bash
# Examples
cms ai generate posts "Write a guide to TypeScript generics"
cms ai rewrite posts/hello-world "Make it more concise and add code examples"
cms ai seo
```

### MCP commands

| Command | Description |
|---------|-------------|
| `cms mcp serve` | Start stdio MCP server (for Claude Code / `.mcp.json`) |
| `cms mcp keygen` | Generate MCP API key |
| `cms mcp test` | Test MCP server connection |
| `cms mcp status` | Check MCP server status |

### Content creation — 3 ways

**A) Via AI generation**
```bash
cms ai generate posts "Write a blog post about TypeScript best practices"
```

**B) Via REST API**
```bash
curl -X POST http://localhost:3000/api/content/posts \
  -H "Content-Type: application/json" \
  -d '{"slug":"my-post","status":"published","data":{"title":"My Post","content":"# Hello"}}'
```

**C) Via Claude Code**
```
> Create a blog post about why file-based CMS is the future
```

---

## REST API

The dev server (`cms dev`) exposes a full REST API. See the complete [OpenAPI specification](docs/openapi.yml).

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/manifest` | CMS configuration and collection list |
| `GET` | `/api/schema/:collection` | JSON Schema for a collection |
| `GET` | `/api/content/:collection` | List all documents in a collection |
| `GET` | `/api/content/:collection/:slug` | Get a single document by slug |
| `POST` | `/api/content/:collection` | Create a new document |
| `PATCH` | `/api/content/:collection/:slug` | Update a document |
| `DELETE` | `/api/content/:collection/:slug` | Delete a document |
| `GET` | `/api/content/:collection/:slug/_fieldMeta` | Get field-level AI lock metadata |
| `PATCH` | `/api/content/:collection/:slug/_fieldMeta` | Update field locks |

### Example

```bash
# List all published posts
curl http://localhost:3000/api/content/posts?status=published

# Get a single post
curl http://localhost:3000/api/content/posts/hello-world

# Create a post
curl -X POST http://localhost:3000/api/content/posts \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-post",
    "status": "draft",
    "data": {
      "title": "My First Post",
      "content": "# Hello\n\nThis is my first post.",
      "date": "2026-03-15"
    }
  }'
```

---

## Building a site with Claude Code

Every scaffolded project includes a `CLAUDE.md` that teaches AI how to use the CMS. The `@webhouse/cms` npm package also ships with a comprehensive `CLAUDE.md`.

```bash
# Scaffold and let AI build your site
npm create @webhouse/cms my-site
cd my-site
claude "Build a portfolio site with Next.js and Tailwind. Read CLAUDE.md for CMS docs."
```

Or use the included start script:

```bash
bash start.sh "Build a dark-themed blog with categories and author pages"
```

Claude Code will:
1. Read `CLAUDE.md` and understand the CMS
2. Create a Next.js App Router site
3. Define collections in `cms.config.ts`
4. Create content in `content/` as JSON files
5. Build pages that read content from the filesystem
6. Suggest running the admin UI when done

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  webhouse.app / cms-admin              (Visual Admin UI)    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Document │ │  Block   │ │  Media   │ │  AI Cockpit  │   │
│  │  Editor  │ │  Editor  │ │ Library  │ │  & Agents    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  @webhouse/cms                          (Core Engine)       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │  Schema  │ │ Content  │ │ Storage  │ │     API      │   │
│  │ Validate │ │ Service  │ │ Adapters │ │   (Hono)     │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Storage                                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│  │Filesystem│ │  GitHub  │ │  SQLite  │                    │
│  │  (JSON)  │ │   API    │ │ (Drizzle)│                    │
│  └──────────┘ └──────────┘ └──────────┘                    │
├─────────────────────────────────────────────────────────────┤
│  AI Layer                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Generate │ │ Rewrite  │ │Translate │ │  SEO Agent   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────┐ ┌──────────┐                                  │
│  │ MCP Read │ │MCP Write │  (Model Context Protocol)       │
│  └──────────┘ └──────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Development

```bash
git clone https://github.com/webhousecode/cms.git
cd cms
pnpm install
pnpm build          # Build all packages
pnpm dev            # Start admin on :3010
```

### Project structure

```
packages/
  cms/              # Core engine
  cms-admin/        # Next.js admin UI
  cms-admin-cli/    # npx wrapper for admin
  cms-ai/           # AI agents
  cms-cli/          # CLI tools
  cms-mcp-client/   # Public MCP server
  cms-mcp-server/   # Admin MCP server
  create-cms/       # Project scaffolder
examples/
  blog/             # Blog example
  landing/          # Landing page with blocks
deploy/
  Dockerfile.cms    # Combined site + admin image
  Dockerfile.admin  # Standalone admin image
  fly.toml          # Fly.io deployment config
```

---

## License

[MIT](LICENSE) — [WebHouse](https://webhouse.dk)

<p align="center">
  <sub>Built with conviction by <a href="https://webhouse.dk">WebHouse</a> — 30 years of building for the web.</sub>
</p>
