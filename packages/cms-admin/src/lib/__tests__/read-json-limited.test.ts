import { describe, it, expect } from "vitest";
import { readJsonLimited, measureJsonShape } from "../read-json-limited";

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

describe("readJsonLimited — shape (F209.4)", () => {
  const L = { maxArrayLength: 10, maxObjectKeys: 10, maxTotalEntries: 50 };
  const send = (v: unknown) => readJsonLimited(chunked(JSON.stringify(v)), 64 * 1024, L);

  it("refuses an array longer than the limit, naming where", async () => {
    const r = await send({ params: { arguments: { a: new Array(11).fill(1) } } });
    expect(r).toEqual({ ok: false, status: 400, error: "Body shape refused — params.arguments.a: array of 11 exceeds 10" });
  });

  it("refuses an object with too many keys (z.record has no .max())", async () => {
    const r = await send({ params: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, 1])) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/params: object with 11 keys exceeds 10/);
  });

  it("refuses many small arrays that add up past the total", async () => {
    const r = await send({ a: Array.from({ length: 6 }, () => new Array(9).fill(1)) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/entries exceed 50/);
  });

  it("walks deep nesting without blowing the stack", () => {
    // Built and measured directly: JSON.stringify/parse are themselves recursive
    // and overflow on CI's smaller stack at this depth (they would answer 400
    // "Invalid JSON" through readJsonLimited, which is also safe).
    let v: unknown = 1;
    for (let i = 0; i < 100_000; i++) v = [v];
    expect(measureJsonShape(v, { maxArrayLength: 10, maxObjectKeys: 10, maxTotalEntries: 1_000_000 })).toBeNull();
  });

  it("a body too deep for JSON.parse is refused, not thrown", async () => {
    const deep = "[".repeat(200_000) + "]".repeat(200_000);
    const r = await readJsonLimited(chunked(deep), 1024 * 1024, L);
    expect(r.ok).toBe(false);
  });

  it("passes a normal MCP message unchanged", async () => {
    const msg = { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_page", arguments: { slug: "home" } } };
    expect(await send(msg)).toEqual({ ok: true, value: msg });
  });

  it("without shape limits, behaves as before", async () => {
    const r = await readJsonLimited(chunked(JSON.stringify({ a: new Array(100).fill(1) })), 64 * 1024);
    expect(r.ok).toBe(true);
  });
});
