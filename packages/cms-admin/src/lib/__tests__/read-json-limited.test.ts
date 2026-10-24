import { describe, it, expect } from "vitest";
import { readJsonLimited } from "../read-json-limited";

// A body with no Content-Length — the case request.json() and a header check both miss.
function chunked(text: string): Request {
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 1024) c.enqueue(bytes.slice(i, i + 1024));
      c.close();
    },
  });
  return new Request("http://x/", { method: "POST", body: stream, duplex: "half" } as RequestInit);
}

describe("readJsonLimited", () => {
  it("parses a body under the limit", async () => {
    const r = await readJsonLimited(chunked('{"jsonrpc":"2.0","id":1,"method":"tools/list"}'), 1024);
    expect(r).toEqual({ ok: true, value: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  });

  it("refuses a huge array streamed without Content-Length", async () => {
    const big = JSON.stringify({ params: { arguments: { a: new Array(200_000).fill(1) } } });
    const r = await readJsonLimited(chunked(big), 64 * 1024);
    expect(r).toEqual({ ok: false, status: 413, error: "Body exceeds 65536 bytes" });
  });

  it("refuses on a declared Content-Length before reading", async () => {
    const req = new Request("http://x/", { method: "POST", body: "{}", headers: { "content-length": "999999" } });
    const r = await readJsonLimited(req, 1024);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(413);
  });

  it("answers 400 on invalid JSON instead of throwing", async () => {
    const r = await readJsonLimited(chunked("{not json"), 1024);
    expect(r).toEqual({ ok: false, status: 400, error: "Invalid JSON" });
  });
});
