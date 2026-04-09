import { createHmac } from "crypto";

/**
 * Short-lived HMAC tokens for preview proxy URLs.
 *
 * The mobile app loads previews via <iframe src="...">, which can't send
 * Authorization headers. Instead, /api/mobile/me embeds a signed token
 * in the preview URL. The proxy validates the token without needing
 * Bearer auth — works for both iframes and direct loads.
 *
 * Token format: `<expiry-epoch-seconds>.<hmac-hex>`
 * The HMAC signs: `<expiry>:<payload>` where payload is the upstream/dir param.
 */

const TOKEN_TTL_SECONDS = 3600; // 1 hour

function getSecret(): string {
  return process.env.CMS_JWT_SECRET ?? "insecure-dev-fallback-preview";
}

/** Create a signed token for a preview proxy URL parameter. */
export function signPreviewToken(payload: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const mac = createHmac("sha256", getSecret())
    .update(`${exp}:${payload}`)
    .digest("hex")
    .slice(0, 32); // 16 bytes is plenty for a short-lived URL token
  return `${exp}.${mac}`;
}

/** Validate a preview token. Returns true if valid and not expired. */
export function verifyPreviewToken(
  token: string | null,
  payload: string,
): boolean {
  if (!token) return false;

  const dotIdx = token.indexOf(".");
  if (dotIdx < 1) return false;

  const exp = parseInt(token.slice(0, dotIdx), 10);
  const mac = token.slice(dotIdx + 1);

  if (isNaN(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const expected = createHmac("sha256", getSecret())
    .update(`${exp}:${payload}`)
    .digest("hex")
    .slice(0, 32);

  // Constant-time compare
  if (mac.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) {
    diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
