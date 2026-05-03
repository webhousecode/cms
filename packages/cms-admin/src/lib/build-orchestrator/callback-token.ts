/**
 * F144 P4 — Builder callback token (HMAC).
 *
 * Each builder VM gets a short-lived HMAC token that lets it POST status
 * updates back to cms-admin. Token format:
 *
 *   <unixSecExpiry>.<hex(hmacSha256(siteId+"\n"+sha+"\n"+expiry, secret))>
 *
 * Secret comes from CMS_BUILDER_CALLBACK_SECRET env var. Falls back to
 * NEXTAUTH_SECRET only in dev so local testing works without extra setup.
 *
 * Token binds to (siteId, sha) — a leaked token from one build cannot
 * post status for another. Expiry caps the window so a long-running build
 * cannot replay status forever.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_SEC = 60 * 60; // 1 hour — generous for slow builds

function getSecret(): string {
  const secret =
    process.env.CMS_BUILDER_CALLBACK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "";
  if (!secret) {
    throw new Error(
      "F144: CMS_BUILDER_CALLBACK_SECRET (or NEXTAUTH_SECRET in dev) " +
        "must be set to issue builder callback tokens.",
    );
  }
  return secret;
}

export interface IssueTokenOptions {
  siteId: string;
  sha: string;
  /** TTL in seconds. Default 1 hour. */
  ttlSec?: number;
}

export function issueCallbackToken(opts: IssueTokenOptions): string {
  const ttl = opts.ttlSec ?? DEFAULT_TTL_SEC;
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const sig = createHmac("sha256", getSecret())
    .update(`${opts.siteId}\n${opts.sha}\n${expiry}`)
    .digest("hex");
  return `${expiry}.${sig}`;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

export function verifyCallbackToken(token: string, siteId: string, sha: string): VerifyResult {
  if (!token.includes(".")) return { valid: false, reason: "malformed" };
  const dotIdx = token.indexOf(".");
  const expiryStr = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expiry = parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry)) return { valid: false, reason: "bad_expiry" };
  if (Math.floor(Date.now() / 1000) > expiry) return { valid: false, reason: "expired" };

  let expected: string;
  try {
    expected = createHmac("sha256", getSecret())
      .update(`${siteId}\n${sha}\n${expiry}`)
      .digest("hex");
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : "secret_unavailable" };
  }

  // timingSafeEqual requires equal-length buffers; reject mismatched-length
  // signatures up front so the comparison itself is constant-time.
  if (sig.length !== expected.length) return { valid: false, reason: "bad_signature" };
  const ok = timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  return ok ? { valid: true } : { valid: false, reason: "bad_signature" };
}
