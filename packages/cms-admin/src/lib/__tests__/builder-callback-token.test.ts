/**
 * F144 P4 — Builder callback token (HMAC) tests.
 *
 * Verifies:
 *   - issue + verify roundtrip with correct (siteId, sha)
 *   - rejected when siteId differs
 *   - rejected when sha differs
 *   - rejected after expiry
 *   - rejected when secret missing
 *   - rejected for malformed token
 *   - constant-time comparison (bad signature rejected without crash)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { issueCallbackToken, verifyCallbackToken } from "../build-orchestrator/callback-token";

const ORIG_SECRET = process.env.CMS_BUILDER_CALLBACK_SECRET;

beforeEach(() => {
  process.env.CMS_BUILDER_CALLBACK_SECRET = "test-secret-please-rotate";
});

afterEach(() => {
  if (ORIG_SECRET !== undefined) process.env.CMS_BUILDER_CALLBACK_SECRET = ORIG_SECRET;
  else delete process.env.CMS_BUILDER_CALLBACK_SECRET;
});

describe("callback-token", () => {
  it("issues + verifies a token for the same (siteId, sha)", () => {
    const tok = issueCallbackToken({ siteId: "trail", sha: "abc123" });
    expect(verifyCallbackToken(tok, "trail", "abc123").valid).toBe(true);
  });

  it("rejects token for a different siteId", () => {
    const tok = issueCallbackToken({ siteId: "trail", sha: "abc" });
    const r = verifyCallbackToken(tok, "other-site", "abc");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("bad_signature");
  });

  it("rejects token for a different sha", () => {
    const tok = issueCallbackToken({ siteId: "trail", sha: "abc" });
    const r = verifyCallbackToken(tok, "trail", "xyz");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("bad_signature");
  });

  it("rejects an expired token", () => {
    const tok = issueCallbackToken({ siteId: "trail", sha: "abc", ttlSec: -1 });
    const r = verifyCallbackToken(tok, "trail", "abc");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("rejects malformed tokens", () => {
    expect(verifyCallbackToken("garbage", "trail", "abc").valid).toBe(false);
    expect(verifyCallbackToken("123.notreallyhex", "trail", "abc").valid).toBe(false);
    expect(verifyCallbackToken("notanumber.sig", "trail", "abc").valid).toBe(false);
  });

  it("rejects when secret is unavailable in env", () => {
    delete process.env.CMS_BUILDER_CALLBACK_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    expect(() => issueCallbackToken({ siteId: "x", sha: "y" })).toThrow(
      /CMS_BUILDER_CALLBACK_SECRET/,
    );
  });

  it("falls back to NEXTAUTH_SECRET when builder secret missing", () => {
    delete process.env.CMS_BUILDER_CALLBACK_SECRET;
    process.env.NEXTAUTH_SECRET = "fallback-secret";
    const tok = issueCallbackToken({ siteId: "trail", sha: "abc" });
    expect(verifyCallbackToken(tok, "trail", "abc").valid).toBe(true);
    delete process.env.NEXTAUTH_SECRET;
  });

  it("rejects signatures of mismatched length without crashing timingSafeEqual", () => {
    const tok = issueCallbackToken({ siteId: "trail", sha: "abc" });
    const dotIdx = tok.indexOf(".");
    const truncated = tok.slice(0, dotIdx + 5); // very short signature
    const r = verifyCallbackToken(truncated, "trail", "abc");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("bad_signature");
  });
});
