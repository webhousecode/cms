<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# Getting Started

## What is @webhouse/cms

`@webhouse/cms` is a file-based, AI-native CMS engine for TypeScript projects. You define collections and fields in a `cms.config.ts` file, and the CMS stores content as flat JSON files in a `content/` directory (one file per document, organized by collection). It provides a REST API server, a static site builder, AI content generation via `@webhouse/cms-ai`, and a visual admin UI at [webhouse.app](https://webhouse.app). The primary use case is powering Next.js websites where content is read directly from JSON files at build time or runtime.

## Quick Start

```bash
# Scaffold a new project
npm create @webhouse/cms my-site

# Or with the CLI directly
npx @webhouse/cms-cli init my-site
```

This generates:
```
my-site/
  cms.config.ts          # Collection + field definitions
  package.json           # Dependencies: @webhouse/cms, @webhouse/cms-cli, @webhouse/cms-ai
  .env                   # AI provider keys (ANTHROPIC_API_KEY or OPENAI_API_KEY)
  content/
    posts/
      hello-world.json   # Example document
```

Then:
```bash
cd my-site
npm install
npx cms dev       # Start dev server + admin UI
npx cms build     # Build static site
```
