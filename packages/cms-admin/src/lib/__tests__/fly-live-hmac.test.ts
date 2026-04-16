/**
 * Cross-verify that the client-side HMAC signing (fly-live-provider.ts)
 * produces signatures the server-side verification (fly-live-assets/server.ts)
 * will accept. The two files live in different runtime contexts (admin Node
 * process vs. Bun inside Docker) so they must share no code — instead we
 * duplicate the scheme and keep them in sync via this test.
 */
import { describe, it, expect } from "vitest";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { signIcdRequest, diffManifests } from "../deploy/fly-live-provider";

// Mirror of server.ts:verifyAuth — must stay byte-for-byte identical.
function verifyOnServer(params: {
  method: string;
  pathWithQuery: string;
  body: Uint8Array;
  secret: string;
  timestamp: string;
  signature: string;
  nowSeconds?: number;
  maxSkew?: number;
}): { ok: true } | { ok: false; error: string } {
  const { method, pathWithQuery, body, secret, timestamp, signature } = params;
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxSkew = params.maxSkew ?? 300;

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, error: "bad timestamp" };
  const skew = Math.abs(now - tsNum);
  if (skew > maxSkew) return { ok: false, error: "timestamp skew too large" };

  const bodyHash = createHash("sha256").update(body).digest("hex");
  const payload = `${timestamp}\n${method}\n${pathWithQuery}\n${bodyHash}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const given = signature.replace(/^sha256=/, "");

  if (expected.length !== given.length) return { ok: false, error: "invalid signature" };
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
    return { ok: false, error: "invalid signature" };
  }
  return { ok: true };
}

describe("fly-live HMAC cross-compatibility", () => {
  const secret = "test-secret-abc123";

  it("signed GET /_icd/manifest verifies on server", () => {
    const { timestamp, signature } = signIcdRequest("GET", "/_icd/manifest", new Uint8Array(), secret);
    const res = verifyOnServer({
      method: "GET",
      pathWithQuery: "/_icd/manifest",
      body: new Uint8Array(),
      secret,
      timestamp,
      signature,
    });
    expect(res.ok).toBe(true);
  });

  it("signed PUT with binary body verifies on server", () => {
    const body = new TextEncoder().encode("<html>hello</html>");
    const p = "/_icd/deploys/abc-123/files?path=index.html";
    const { timestamp, signature } = signIcdRequest("PUT", p, body, secret);
    const res = verifyOnServer({
      method: "PUT",
      pathWithQuery: p,
      body,
      secret,
      timestamp,
      signature,
    });
    expect(res.ok).toBe(true);
  });

  it("wrong secret rejects", () => {
    const body = new Uint8Array([1, 2, 3]);
    const { timestamp, signature } = signIcdRequest("POST", "/_icd/deploys", body, secret);
    const res = verifyOnServer({
      method: "POST",
      pathWithQuery: "/_icd/deploys",
      body,
      secret: "other-secret",
      timestamp,
      signature,
    });
    expect(res.ok).toBe(false);
  });

  it("tampered body rejects", () => {
    const body = new TextEncoder().encode("original");
    const { timestamp, signature } = signIcdRequest("PUT", "/_icd/x?path=a", body, secret);
    const res = verifyOnServer({
      method: "PUT",
      pathWithQuery: "/_icd/x?path=a",
      body: new TextEncoder().encode("tampered"),
      secret,
      timestamp,
      signature,
    });
    expect(res.ok).toBe(false);
  });

  it("timestamp skew > 5 min rejects", () => {
    const { timestamp, signature } = signIcdRequest("GET", "/_icd/health", new Uint8Array(), secret);
    const future = Number(timestamp) + 400; // 6m40s future
    const res = verifyOnServer({
      method: "GET",
      pathWithQuery: "/_icd/health",
      body: new Uint8Array(),
      secret,
      timestamp,
      signature,
      nowSeconds: future,
    });
    expect(res.ok).toBe(false);
  });

  it("signature includes method — GET sig doesn't verify as PUT", () => {
    const p = "/_icd/x";
    const body = new Uint8Array();
    const getSig = signIcdRequest("GET", p, body, secret);
    const res = verifyOnServer({
      method: "PUT",
      pathWithQuery: p,
      body,
      secret,
      timestamp: getSig.timestamp,
      signature: getSig.signature,
    });
    expect(res.ok).toBe(false);
  });
});

describe("diffManifests", () => {
  it("detects added, changed, removed, unchanged", () => {
    const local = {
      "index.html": "hash-a",
      "new.html": "hash-new",
      "changed.html": "hash-x2",
    };
    const remote = {
      "index.html": "hash-a",
      "changed.html": "hash-x1",
      "removed.html": "hash-old",
    };
    const d = diffManifests(local, remote);
    expect(d.added).toEqual(["new.html"]);
    expect(d.changed).toEqual(["changed.html"]);
    expect(d.removed).toEqual(["removed.html"]);
    expect(d.unchanged).toBe(1);
  });

  it("empty remote = everything added", () => {
    const local = { "a.html": "h1", "b.html": "h2" };
    const d = diffManifests(local, {});
    expect(d.added.sort()).toEqual(["a.html", "b.html"]);
    expect(d.changed).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.unchanged).toBe(0);
  });

  it("empty local = everything removed", () => {
    const remote = { "a.html": "h1" };
    const d = diffManifests({}, remote);
    expect(d.removed).toEqual(["a.html"]);
    expect(d.added).toEqual([]);
    expect(d.unchanged).toBe(0);
  });
});
