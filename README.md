<p align="center">
  <img src="logo/cms-logo.svg" alt="WebHouse CMS" width="280" />
</p>

<p align="center">
  <strong>AI-native content management for the modern web</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@webhouse/cms"><img src="https://img.shields.io/npm/v/@webhouse/cms.svg" alt="npm version" /></a>
  <a href="https://github.com/webhousecode/cms/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@webhouse/cms.svg" alt="license" /></a>
</p>

---

WebHouse CMS is a code-first, AI-native content management system. Define your content schema in TypeScript, get a full admin UI, REST API, AI content generation, and static site builder — all powered by SQLite.

## Quickstart

```bash
npx @webhouse/cms init
cd my-site
npx @webhouse/cms dev
```

This scaffolds a new project with `cms.config.ts`, starts the dev server, and opens the admin UI.

## Packages

| Package | Description |
| --- | --- |
| [`@webhouse/cms`](packages/cms) | Core engine — Hono API, Drizzle ORM, SQLite, Zod schemas |
| [`@webhouse/cms-ai`](packages/cms-ai) | AI agents — content generation with Anthropic Claude & OpenAI |
| [`@webhouse/cms-cli`](packages/cms-cli) | CLI — `cms init`, `cms dev`, `cms build`, `cms ai` |
| [`@webhouse/cms-mcp-client`](packages/cms-mcp-client) | Public read-only MCP server for AI assistants |
| [`@webhouse/cms-mcp-server`](packages/cms-mcp-server) | Authenticated read+write MCP server for content production |

## Features

- **Code-first schemas** — Define collections with Zod, get type-safe content
- **AI-native** — Built-in content generation, rewriting, and SEO optimization
- **Admin UI** — Full-featured editor with rich text, media, and live preview
- **MCP support** — Let AI assistants read and write your content via Model Context Protocol
- **SQLite** — Zero-config, single-file database with Drizzle ORM
- **Static builds** — Generate static HTML/JSON output for any hosting

## Configuration

```typescript
// cms.config.ts
import { defineSite, defineCollection, z } from "@webhouse/cms";

export default defineSite({
  name: "My Site",
  collections: [
    defineCollection({
      name: "posts",
      schema: {
        title: z.string(),
        body: z.string(),
        publishedAt: z.string().datetime(),
      },
    }),
  ],
});
```

## Development

```bash
pnpm install
pnpm build
pnpm dev
```

## License

[MIT](LICENSE) — WebHouse
