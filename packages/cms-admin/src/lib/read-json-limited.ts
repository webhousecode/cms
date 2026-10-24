/* i18n-ignore-file: protocol errors returned to an API/MCP client in the response body, not shown to a person */
/**
 * Read a JSON request body, refusing it once it passes `maxBytes`.
 *
 * Why: zod (GHSA-mrhx-c7xc-m3w5) builds one issue object per failing array
 * element. 4.6.6+ stops early only on an array that HAS a .max() — measured on
 * 4.6.7: an unbounded z.array of 2,000,000 bad elements still costs ~923 MB.
 * The MCP SDK parses every message on the public /api/mcp endpoint with its own
 * schemas, which we do not control. So two limits, before the SDK sees anything:
 * bytes (request.json() has none; a chunked body has no Content-Length, so the
 * stream is counted) and SHAPE (256 KB still holds ~128k elements).
 */
export const MCP_MAX_BODY_BYTES = 256 * 1024;

/** MCP read clients send small arguments (a slug, a search string). */
export const MCP_JSON_SHAPE_LIMITS = {
  /** Elements in any one array. */
  maxArrayLength: 1_000,
  /** Keys in any one object — what bounds a z.record, which has no .max(). */
  maxObjectKeys: 1_000,
  /** Array elements + object keys in the whole body. */
  maxTotalEntries: 10_000,
} as const;

export type JsonShapeLimits = { maxArrayLength: number; maxObjectKeys: number; maxTotalEntries: number };

/**
 * Where the value first breaks a limit, or null. Iterative, so deep nesting
 * cannot blow the stack. Ported from cardmem apps/server/src/json-shape-guard.ts
 * (ff41e864) measureJsonShape.
 */
export function measureJsonShape(value: unknown, limits: JsonShapeLimits): string | null {
  const stack: Array<{ v: unknown; path: string }> = [{ v: value, path: "" }];
  let total = 0;
  while (stack.length) {
    const { v, path } = stack.pop()!;
    if (v === null || typeof v !== "object") continue;
    const at = (k: string | number) => (path ? `${path}.${k}` : String(k));
    const where = path || "(root)";
    if (Array.isArray(v)) {
      if (v.length > limits.maxArrayLength) return `${where}: array of ${v.length} exceeds ${limits.maxArrayLength}`;
      total += v.length;
      if (total > limits.maxTotalEntries) return `${where}: ${total} entries exceed ${limits.maxTotalEntries}`;
      for (let i = 0; i < v.length; i++) if (v[i] !== null && typeof v[i] === "object") stack.push({ v: v[i], path: at(i) });
    } else {
      const keys = Object.keys(v);
      if (keys.length > limits.maxObjectKeys) return `${where}: object with ${keys.length} keys exceeds ${limits.maxObjectKeys}`;
      total += keys.length;
      if (total > limits.maxTotalEntries) return `${where}: ${total} entries exceed ${limits.maxTotalEntries}`;
      for (const k of keys) {
        const c = (v as Record<string, unknown>)[k];
        if (c !== null && typeof c === "object") stack.push({ v: c, path: at(k) });
      }
    }
  }
  return null;
}

export type LimitedJson =
  | { ok: true; value: unknown }
  | { ok: false; status: 413 | 400; error: string };

export async function readJsonLimited(request: Request, maxBytes: number, shape?: JsonShapeLimits): Promise<LimitedJson> {
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
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }
  const violation = shape ? measureJsonShape(value, shape) : null;
  if (violation) return { ok: false, status: 400, error: `Body shape refused — ${violation}` };
  return { ok: true, value };
}
