import { timingSafeEqual } from "node:crypto";

export interface ApiKeyConfig {
  key: string;
  label: string;
  scopes: string[];
}

export type AuthResult =
  | { authenticated: true; label: string; scopes: string[] }
  | { authenticated: false; error: string };

// Timing-safe string compare to prevent timing attacks
function safeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export function validateApiKey(
  authHeader: string | null | undefined,
  keys: ApiKeyConfig[],
): { authenticated: true; label: string; scopes: string[] } | { authenticated: false; error: string } {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authenticated: false, error: "Missing Authorization: Bearer <key>" };
  }

  const provided = authHeader.slice(7).trim();

  for (const k of keys) {
    if (safeEqual(provided, k.key)) {
      return { authenticated: true, label: k.label, scopes: k.scopes };
    }
  }

  return { authenticated: false, error: "Invalid API key" };
}

export function hasScope(userScopes: string[], required: string[]): boolean {
  return required.every((r) => userScopes.includes(r));
}
