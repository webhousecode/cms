#!/usr/bin/env node
/**
 * MCP stdio→SSE bridge for Claude Desktop.
 *
 * Connects to the CMS MCP admin SSE endpoint and bridges
 * stdin/stdout (stdio transport) to HTTP SSE + POST.
 *
 * Usage in claude_desktop_config.json:
 *   "command": "node",
 *   "args": ["/path/to/mcp-stdio-bridge.js"],
 *   "env": {
 *     "MCP_URL": "http://localhost:3010/api/mcp/admin",
 *     "MCP_API_KEY": "your-api-key"
 *   }
 */
const http = require("http");
const https = require("https");

const MCP_URL = process.env.MCP_URL || "http://localhost:3010/api/mcp/admin";
const MCP_API_KEY = process.env.MCP_API_KEY;

if (!MCP_API_KEY) {
  process.stderr.write("MCP_API_KEY env var required\n");
  process.exit(1);
}

const parsed = new URL(MCP_URL);
const client = parsed.protocol === "https:" ? https : http;

let messageUrl = null;

// Step 1: Open SSE connection to get session
const sseReq = client.get(MCP_URL, {
  headers: {
    "Authorization": `Bearer ${MCP_API_KEY}`,
    "Accept": "text/event-stream",
  },
}, (res) => {
  if (res.statusCode !== 200) {
    let body = "";
    res.on("data", d => body += d);
    res.on("end", () => {
      process.stderr.write(`MCP SSE error ${res.statusCode}: ${body}\n`);
      process.exit(1);
    });
    return;
  }

  let buffer = "";
  res.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ") && !messageUrl) {
        // First data line is the message endpoint URL
        messageUrl = line.slice(6).trim();
        process.stderr.write(`MCP connected: ${messageUrl}\n`);
        // Now we can start reading stdin
        startStdinReader();
      } else if (line.startsWith("data: ") && messageUrl) {
        // SSE response from server → write to stdout
        const jsonStr = line.slice(6).trim();
        if (jsonStr) {
          process.stdout.write(jsonStr + "\n");
        }
      }
    }
  });

  res.on("error", (err) => {
    process.stderr.write(`SSE error: ${err.message}\n`);
    process.exit(1);
  });

  res.on("end", () => {
    process.stderr.write("SSE connection closed\n");
    process.exit(0);
  });
});

sseReq.on("error", (err) => {
  process.stderr.write(`SSE connection failed: ${err.message}\n`);
  process.exit(1);
});

// Step 2: Read JSON-RPC messages from stdin, POST to message endpoint
function startStdinReader() {
  let stdinBuf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    stdinBuf += chunk;
    // Try to parse complete JSON messages (newline-delimited)
    const lines = stdinBuf.split("\n");
    stdinBuf = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      sendMessage(trimmed);
    }
  });

  process.stdin.on("end", () => {
    process.exit(0);
  });
}

function sendMessage(jsonStr) {
  if (!messageUrl) return;
  const u = new URL(messageUrl);
  const reqClient = u.protocol === "https:" ? https : http;

  const postReq = reqClient.request({
    hostname: u.hostname,
    port: u.port,
    path: u.pathname + u.search,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MCP_API_KEY}`,
      "Content-Type": "application/json",
    },
  }, (res) => {
    if (res.statusCode !== 202 && res.statusCode !== 200) {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => {
        process.stderr.write(`POST ${res.statusCode}: ${body}\n`);
      });
    } else {
      res.resume(); // drain
    }
  });

  postReq.on("error", (err) => {
    process.stderr.write(`POST error: ${err.message}\n`);
  });

  postReq.write(jsonStr);
  postReq.end();
}
