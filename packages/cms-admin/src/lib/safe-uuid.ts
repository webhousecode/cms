/**
 * crypto.randomUUID is only available in secure contexts (HTTPS or
 * localhost). When the CMS admin is accessed over plain HTTP via a LAN IP
 * (e.g. `http://192.168.x.x:3010` from a phone for QR-login testing),
 * Web Crypto is unavailable and `crypto.randomUUID()` throws TypeError.
 *
 * This helper returns a UUID-shaped string in any context. It uses the
 * native API when available and falls back to a Math.random-based v4
 * shape otherwise — fine for client-side IDs that are not used as
 * security tokens.
 */
export function safeUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  // RFC 4122 v4-shape fallback
  const hex = (n: number) => Math.floor(Math.random() * n).toString(16);
  let s = "";
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) s += "-";
    if (i === 12) s += "4";
    else if (i === 16) s += ((Math.floor(Math.random() * 4) + 8)).toString(16);
    else s += hex(16);
  }
  return s;
}
