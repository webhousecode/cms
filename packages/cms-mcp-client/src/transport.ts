import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP Transport that uses Web Streams API (compatible with Next.js App Router).
 * - GET handler creates the transport, returns transport.stream as SSE Response
 * - POST handler calls transport.handleClientMessage(body) to deliver messages
 */
export class NextSSETransport {
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private encoder = new TextEncoder();

  readonly stream: ReadableStream<Uint8Array>;
  readonly sessionId: string;

  // MCP Transport interface callbacks
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(sessionId: string, endpointUrl?: string) {
    this.sessionId = sessionId;
    const encoder = this.encoder;
    this.stream = new ReadableStream<Uint8Array>({
      start: (ctrl) => {
        this.controller = ctrl;
        // MCP SSE protocol requires an initial "endpoint" event so the client
        // knows where to POST messages. Send it synchronously before any other event.
        if (endpointUrl) {
          ctrl.enqueue(encoder.encode(`event: endpoint\ndata: ${endpointUrl}\n\n`));
        }
      },
      cancel: () => {
        this.onclose?.();
      },
    });
  }

  /** Called by MCP SDK on startup — nothing to do since stream is already open. */
  async start(): Promise<void> {}

  /** Called by MCP SDK to send a message to the client via SSE. */
  async send(message: JSONRPCMessage): Promise<void> {
    const line = `data: ${JSON.stringify(message)}\n\n`;
    this.controller?.enqueue(this.encoder.encode(line));
  }

  /** Called when the server shuts down or the client disconnects. */
  async close(): Promise<void> {
    try {
      this.controller?.close();
    } catch {
      // Already closed
    }
    this.onclose?.();
  }

  /** Called by the POST route handler to deliver a client message into the MCP server. */
  handleClientMessage(body: unknown): void {
    this.onmessage?.(body as JSONRPCMessage);
  }
}

// ── In-memory session store ───────────────────────────────────────

const sessions = new Map<string, NextSSETransport>();

export function getTransportSession(id: string): NextSSETransport | undefined {
  return sessions.get(id);
}

export function registerTransportSession(t: NextSSETransport): void {
  sessions.set(t.sessionId, t);
  t.onclose = () => sessions.delete(t.sessionId);
}
