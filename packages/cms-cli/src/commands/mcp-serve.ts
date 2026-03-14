import { loadConfig } from '../utils/config-loader.js';
import { logger } from '../utils/logger.js';

/**
 * Start a stdio-based MCP server that exposes CMS content tools.
 * Designed to be used as an MCP server in Claude Code / .mcp.json:
 *
 *   { "mcpServers": { "cms": { "command": "npx", "args": ["cms", "mcp", "serve"] } } }
 *
 * Tools available:
 * - get_site_summary: Overview of collections and document counts
 * - list_collection: List documents in a collection
 * - get_document: Read a single document by slug
 * - search_content: Full-text search across collections
 * - get_schema: Return the CMS config schema
 * - write_document: Create or update a document
 */
export async function mcpServeCommand(args: { cwd?: string }) {
  const cwd = args.cwd ?? process.cwd();

  // Suppress all console output — stdio is reserved for MCP protocol
  logger.silent = true;

  try {
    const config = await loadConfig(cwd);
    const { createCms } = await import('@webhouse/cms');
    const cms = await createCms(config);

    const { createPublicMcpServer } = await import('@webhouse/cms-mcp-client');
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

    const server = createPublicMcpServer(cms.content, config);
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Keep alive until stdin closes
    process.stdin.on('end', async () => {
      await cms.storage.close();
      process.exit(0);
    });
  } catch (err) {
    // Write error to stderr (not stdout — that's for MCP)
    process.stderr.write(`CMS MCP server error: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
