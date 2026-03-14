# @webhouse/cms-mcp-server

Authenticated read+write [Model Context Protocol](https://modelcontextprotocol.io/) server for `@webhouse/cms`. Enables AI assistants to create, update, and manage CMS content with API key authentication.

## Installation

```bash
npm install @webhouse/cms-mcp-server
```

## Usage

```typescript
import { createMcpServer } from "@webhouse/cms-mcp-server";

const server = createMcpServer({
  siteUrl: "https://my-site.example.com",
  apiKey: process.env.CMS_MCP_API_KEY,
});

// The MCP server exposes authenticated tools for creating,
// updating, publishing, and managing CMS content.
```

## Documentation

See the [main repository](https://github.com/webhousecode/cms) for full documentation.

## License

MIT
