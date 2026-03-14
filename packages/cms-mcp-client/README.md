# @webhouse/cms-mcp-client

Public read-only [Model Context Protocol](https://modelcontextprotocol.io/) server for `@webhouse/cms` sites. Lets AI assistants read your CMS content through a standardized interface.

## Installation

```bash
npm install @webhouse/cms-mcp-client
```

## Usage

```typescript
import { createMcpClient } from "@webhouse/cms-mcp-client";

const server = createMcpClient({
  siteUrl: "https://my-site.example.com",
});

// The MCP server exposes tools for listing collections,
// reading documents, and searching content.
```

## Documentation

See the [main repository](https://github.com/webhousecode/cms) for full documentation.

## License

MIT
