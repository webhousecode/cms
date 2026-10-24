/**
 * Read a JSON request body, refusing it once it passes `maxBytes`.
 *
 * Why: zod < 4.6.6 (GHSA-mrhx-c7xc-m3w5) builds one issue object per failing
 * array element, so a large array sent to a parser can exhaust memory. The MCP
 * SDK parses every message on the public /api/mcp endpoint. Until F209.3 moves
 * us to zod 4.6.7, a huge array must not get in at all. `request.json()` has no
 * limit, and a chunked body has no Content-Length, so the stream is counted.
 */
export const MCP_MAX_BODY_BYTES = 256 * 1024;

export type LimitedJson =
  | { ok: true; value: unknown }
  | { ok: false; status: 413 | 400; error: string };

export async function readJsonLimited(request: Request, maxBytes: number): Promise<LimitedJson> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: `Body exceeds ${maxBytes} bytes` };
  }
  if (!request.body) return { ok: false, status: 400, error: "Missing body" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413, error: `Body exceeds ${maxBytes} bytes` };
    }
    chunks.push(value);
  }

  const text = new TextDecoder().decode(Buffer.concat(chunks));
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }
}
