import { getJwt, getServerUrl } from "@/lib/prefs";
import type { MobileMeResponse, MobilePingResponse, MobilePairExchangeResponse } from "./types";

/**
 * Typed JSON API client for the user's CMS server.
 *
 * Conventions:
 *  - Base URL = whatever the user entered in onboarding (read from Preferences)
 *  - Auth = Bearer JWT in Authorization header (NEVER cookies)
 *  - Errors throw ApiError with the HTTP status + parsed body
 *  - All responses are JSON
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Override the server URL — used during onboarding before it's stored */
  serverUrl?: string;
  /** Skip JWT — used by ping/pair endpoints that auth differently */
  noAuth?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const baseUrl = opts.serverUrl ?? (await getServerUrl());
  if (!baseUrl) {
    throw new ApiError(0, null, "No server URL configured");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (!opts.noAuth) {
    const jwt = await getJwt();
    if (jwt) {
      headers["Authorization"] = `Bearer ${jwt}`;
    }
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      // Important: do NOT send cookies — auth is purely Bearer JWT
      credentials: "omit",
    });
  } catch (err) {
    throw new ApiError(0, null, `Network error: ${(err as Error).message}`);
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, body, message);
  }

  return body as T;
}

// ─── Endpoints ────────────────────────────────────────

/** Validate a server URL during onboarding. No auth required. */
export function ping(serverUrl: string): Promise<MobilePingResponse> {
  return request<MobilePingResponse>("/api/mobile/ping", {
    serverUrl,
    noAuth: true,
  });
}

/** Exchange a one-time pairing token for a long-lived JWT. */
export function exchangePairingToken(
  token: string,
  serverUrl?: string,
): Promise<MobilePairExchangeResponse> {
  return request<MobilePairExchangeResponse>("/api/mobile/pair/exchange", {
    method: "POST",
    body: { token },
    serverUrl,
    noAuth: true,
  });
}

/** Email/password login fallback — hits the existing CMS auth endpoint. */
export function loginWithPassword(
  email: string,
  password: string,
  serverUrl?: string,
): Promise<MobilePairExchangeResponse> {
  return request<MobilePairExchangeResponse>("/api/mobile/login", {
    method: "POST",
    body: { email, password },
    serverUrl,
    noAuth: true,
  });
}

/** Authenticated: returns the current user, their orgs/sites, and counters. */
export function getMe(): Promise<MobileMeResponse> {
  return request<MobileMeResponse>("/api/mobile/me");
}
