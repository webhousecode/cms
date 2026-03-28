/**
 * F99 — API test client for Vitest integration tests.
 *
 * Typed fetch wrapper that automatically injects JWT auth cookies.
 *
 * Usage:
 *   import { api, getTestToken } from "../helpers/api-client";
 *   const res = await api("/api/cms/content/posts");
 *   const data = await res.json();
 */
import { SignJWT } from "jose";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3010";
const SECRET =
  process.env.CMS_JWT_SECRET ??
  process.env.JWT_SECRET ??
  "***REMOVED-JWT-SECRET***";

let cachedToken: string | null = null;

/** Get a signed JWT token for the test admin user */
export async function getTestToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const secret = new TextEncoder().encode(SECRET);
  cachedToken = await new SignJWT({
    sub: "test-user",
    email: "cb@webhouse.dk",
    name: "Test Admin",
    role: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
  return cachedToken;
}

/** Make an authenticated API request */
export async function api(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getTestToken();
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Cookie: `cms-session=${token}; cms-active-org=default; cms-active-site=default`,
      ...options.headers,
    },
  });
}

/** POST JSON to an API endpoint */
export async function apiPost(path: string, body: unknown): Promise<Response> {
  return api(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** PATCH JSON to an API endpoint */
export async function apiPatch(path: string, body: unknown): Promise<Response> {
  return api(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** DELETE an API endpoint */
export async function apiDelete(path: string): Promise<Response> {
  return api(path, { method: "DELETE" });
}
