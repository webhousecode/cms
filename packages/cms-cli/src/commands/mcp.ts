import { loadConfig } from '../utils/config-loader.js';
import { logger } from '../utils/logger.js';
import { randomBytes } from 'node:crypto';

export async function mcpKeygenCommand(args: { label?: string; scopes?: string; cwd?: string }) {
  const key = randomBytes(32).toString('hex');
  const label = args.label ?? 'My key';
  const scopes = args.scopes ?? 'read,write,publish,deploy,ai';

  logger.success('Generated MCP API key:');
  logger.log('');
  logger.log(`  Key:    ${key}`);
  logger.log(`  Label:  ${label}`);
  logger.log(`  Scopes: ${scopes}`);
  logger.log('');
  logger.log('Add to your environment:');
  logger.log(`  MCP_API_KEY=${key}`);
  logger.log('');
  logger.log('Or for named keys (supports up to 5):');
  logger.log(`  MCP_API_KEY_1=${key}`);
  logger.log(`  MCP_API_KEY_1_LABEL=${label}`);
  logger.log(`  MCP_API_KEY_1_SCOPES=${scopes}`);
}

export async function mcpTestCommand(args: { cwd?: string; endpoint?: string }) {
  const cwd = args.cwd ?? process.cwd();
  const config = await loadConfig(cwd);

  logger.info('Testing public MCP server (get_site_summary)...');
  logger.log('');

  const endpoint = args.endpoint ?? `http://localhost:${config.api?.port ?? 3000}/api/mcp`;

  try {
    // Connect to SSE stream
    const sseRes = await fetch(endpoint, {
      headers: { Accept: 'text/event-stream' },
      signal: AbortSignal.timeout(5000),
    });

    if (!sseRes.ok) {
      logger.error(`SSE connection failed: HTTP ${sseRes.status}`);
      return;
    }

    const sessionId = sseRes.headers.get('x-mcp-session-id');
    if (!sessionId) {
      logger.error('No X-MCP-Session-Id in response headers');
      return;
    }

    logger.success(`Connected — session: ${sessionId}`);

    // Send initialize message
    const msgUrl = new URL(endpoint.replace(/\/mcp$/, '/mcp/message'));
    msgUrl.searchParams.set('sessionId', sessionId);

    const initMsg = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'cms-cli-test', version: '1.0.0' },
      },
    };

    await fetch(msgUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initMsg),
      signal: AbortSignal.timeout(3000),
    });

    logger.log('  MCP initialize sent');
    logger.success('MCP server is reachable and accepting connections');
  } catch (err) {
    logger.error(`Connection failed: ${(err as Error).message}`);
    logger.log('');
    logger.log('Make sure the CMS admin server is running.');
  }
}

export async function mcpStatusCommand(args: { cwd?: string; endpoint?: string }) {
  const endpoint = args.endpoint ?? 'http://localhost:3001';

  // Check public MCP info
  logger.info('Checking MCP server status...');
  logger.log('');

  try {
    const infoRes = await fetch(`${endpoint}/api/mcp/info`, {
      signal: AbortSignal.timeout(5000),
    });

    if (infoRes.ok) {
      const info = await infoRes.json() as Record<string, unknown>;
      logger.success(`Public MCP server: online`);
      logger.log(`  Endpoint:    ${info['endpoint']}`);
      logger.log(`  Auth:        ${info['auth']}`);
      logger.log(`  Rate limit:  ${info['rateLimit']}`);
      const tools = info['tools'] as Array<{ name: string }> | undefined;
      logger.log(`  Tools:       ${tools?.length ?? 0}`);
      const collections = info['collections'] as Array<{ name: string }> | undefined;
      logger.log(`  Collections: ${collections?.map((c) => c.name).join(', ') ?? 'none'}`);
    } else {
      logger.warn(`Public MCP server: HTTP ${infoRes.status}`);
    }
  } catch {
    logger.warn('Public MCP server: not reachable');
  }

  logger.log('');

  // Check admin MCP (just that it exists, don't need auth for OPTIONS)
  const apiKey = process.env.MCP_API_KEY;
  if (!apiKey) {
    logger.log('Admin MCP server: not configured (set MCP_API_KEY to check)');
    return;
  }

  try {
    const adminRes = await fetch(`${endpoint}/api/mcp/admin`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });

    if (adminRes.status === 200 || adminRes.headers.get('content-type')?.includes('text/event-stream')) {
      logger.success('Admin MCP server: online (authenticated)');
    } else if (adminRes.status === 401) {
      logger.warn('Admin MCP server: online but invalid key');
    } else {
      logger.warn(`Admin MCP server: HTTP ${adminRes.status}`);
    }
  } catch {
    logger.warn('Admin MCP server: not reachable');
  }
}
