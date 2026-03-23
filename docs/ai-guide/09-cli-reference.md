<!-- @webhouse/cms ai-guide v0.3.0 — last updated 2026-03-23 -->

# CLI Reference

## CLI Commands

All commands are run via `npx cms <command>` (provided by `@webhouse/cms-cli`).

| Command | Description |
|---------|-------------|
| `cms init [name]` | Scaffold a new CMS project |
| `cms dev [--port 3000]` | Start dev server with hot reload |
| `cms build [--outDir dist]` | Build static site |
| `cms serve [--port 5000] [--dir dist]` | Serve the built static site |
| `cms ai generate <collection> "<prompt>"` | Generate a new document with AI |
| `cms ai rewrite <collection>/<slug> "<instruction>"` | Rewrite an existing document with AI |
| `cms ai seo [--status published]` | Run SEO optimization on all documents |
| `cms mcp keygen [--label "My key"] [--scopes "read,write"]` | Generate MCP API key |
| `cms mcp test [--endpoint url]` | Test local MCP server |
| `cms mcp status [--endpoint url]` | Check MCP server status |

### AI Commands

AI commands require `@webhouse/cms-ai` and an `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env`.

```bash
# Generate a blog post
npx cms ai generate posts "Write a guide to TypeScript generics"

# Rewrite with instructions
npx cms ai rewrite posts/hello-world "Make it more concise and add code examples"

# SEO optimization across all published content
npx cms ai seo
```
