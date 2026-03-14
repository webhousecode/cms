# External Dependencies & API Services

Overview of all external services, APIs and third-party integrations used by @webhouse/cms.

## AI Providers (LLM)

| Service | Used By | Key Location | Required? |
|---------|---------|-------------|-----------|
| **Anthropic (Claude)** | Agent runner, AI chat, AI generate, AI rewrite, bubble menu | Settings → AI (`_data/ai-config.json`) or `ANTHROPIC_API_KEY` env | Yes — primary AI provider |
| **OpenAI (GPT)** | Multi-model comparison (when enabled in Cockpit) | Settings → AI (`_data/ai-config.json`) or `OPENAI_API_KEY` env | No — optional for multi-draft |
| **Google Gemini** | Multi-model comparison (planned) | Settings → AI or `GEMINI_API_KEY` env | No — not yet implemented |

### Pricing (Anthropic — primary)
- **Claude Sonnet 4.6**: $3/M input, $15/M output tokens
- **Claude Haiku 4.5**: $0.25/M input, $1.25/M output tokens
- **Claude Opus 4.6**: $15/M input, $75/M output tokens
- Typical article generation: ~2K input + ~2K output ≈ $0.04 per article (Sonnet)

## Search

| Service | Used By | Key Location | Required? |
|---------|---------|-------------|-----------|
| **Brave Search API** | Agent `web_search` tool — lets agents research topics during content generation | `BRAVE_API_KEY` env | No — agents work without it, just can't search the web |

### Pricing (Brave Search)
- **Search**: $5/1,000 requests (includes $5 free credits/month = ~1,000 free searches)
- **Answers**: $4/1,000 queries + token costs (includes $5 free credits/month)
- Both plans require signup with payment method
- Signup: https://api.search.brave.com/register

## Authentication

| Service | Used By | Key Location | Required? |
|---------|---------|-------------|-----------|
| **jose (JWT)** | Admin auth — session tokens | `CMS_JWT_SECRET` env (auto-generated at setup) | Yes — bundled, no external service |
| **Gravatar** | User avatar in admin header | Automatic from email hash | No — falls back to initials |

## Infrastructure (Deployment)

| Service | Used By | Key Location | Required? |
|---------|---------|-------------|-----------|
| **Fly.io** | Production hosting (admin + site) | `fly.toml`, Fly CLI | No — any Node.js host works |
| **Docker** | Local development + production | `docker-compose.yml`, `Dockerfile.cms` | No — can run with `pnpm dev` |

## NPM Packages (notable external)

| Package | Purpose | License |
|---------|---------|---------|
| `@anthropic-ai/sdk` | Anthropic Claude API client | MIT |
| `@modelcontextprotocol/sdk` | MCP server/client protocol | MIT |
| `next` (v16) | Admin UI + site framework | MIT |
| `tiptap` | Rich text editor | MIT |
| `better-sqlite3` | SQLite storage adapter | MIT |
| `jose` | JWT signing/verification | MIT |

## MCP (Model Context Protocol)

### CMS as MCP Server (implemented ✅)
The CMS exposes two MCP endpoints that external AI clients can connect to:
- `/api/mcp` — Public read-only (rate-limited)
- `/api/mcp/admin` — Full CRUD with Bearer auth, 15 tools

### External MCP Servers → Agent Tools (architecture ready 🟡)
The tool registry (`src/lib/tools/`) supports plugging in external MCP servers.
Current built-in tools:
- `cms_search`, `cms_get_document`, `cms_list_collection`, `cms_list_collections`
- `web_search` (Brave API)

**Not yet wired:** Connecting to external MCP servers (brave-search, memory, github, etc.) via stdio transport. See section below.

## What does NOT require external services

Everything below works fully offline / self-hosted:
- All CMS core features (schema, storage, build, CLI)
- Filesystem + SQLite + GitHub storage adapters
- Admin UI (editor, media, curation queue, agents, cockpit)
- Content search (site search API + Cmd+K)
- TTS / content speaker (browser Web Speech API)
- Scheduled publishing
- AI Lock system
- Brand Voice (stored locally after one-time AI interview)
- Content Context injection (reads from local CMS data)
