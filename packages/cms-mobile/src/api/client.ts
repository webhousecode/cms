import { getJwt, getServerUrl } from "@/lib/prefs";
import type {
  MobileMeResponse,
  MobilePingResponse,
  MobilePairExchangeResponse,
  CollectionsResponse,
  DocumentsResponse,
  DocumentEntry,
  MediaListResponse,
} from "./types";

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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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

// ─── Content Editing ─────────────────────────────────

/** List all collections for a site with field schemas and doc counts. */
export function getCollections(orgId: string, siteId: string): Promise<CollectionsResponse> {
  return request<CollectionsResponse>(
    `/api/mobile/content?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}`,
  );
}

/** List all documents in a collection (excludes trashed). */
export function getDocuments(orgId: string, siteId: string, collection: string): Promise<DocumentsResponse> {
  return request<DocumentsResponse>(
    `/api/mobile/content/docs?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}&collection=${encodeURIComponent(collection)}`,
  );
}

/** Load a single document by slug. */
export function getDocument(orgId: string, siteId: string, collection: string, slug: string): Promise<DocumentEntry> {
  return request<DocumentEntry>(
    `/api/mobile/content/docs?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}&collection=${encodeURIComponent(collection)}&slug=${encodeURIComponent(slug)}`,
  );
}

/** Create a new document (draft). */
export function createDocument(
  orgId: string,
  siteId: string,
  collection: string,
  slug: string,
  data?: Record<string, unknown>,
): Promise<DocumentEntry> {
  return request<DocumentEntry>(
    `/api/mobile/content/docs?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}&collection=${encodeURIComponent(collection)}`,
    { method: "POST", body: { slug, data } },
  );
}

/** Update a document's data and/or status. */
export function saveDocument(
  orgId: string,
  siteId: string,
  collection: string,
  slug: string,
  updates: { data?: Record<string, unknown>; status?: string },
): Promise<DocumentEntry> {
  return request<DocumentEntry>(
    `/api/mobile/content/docs?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}&collection=${encodeURIComponent(collection)}&slug=${encodeURIComponent(slug)}`,
    { method: "PATCH", body: updates },
  );
}

/** Upload a file (image). Returns { url, name }. */
export async function uploadFile(
  orgId: string,
  siteId: string,
  file: File,
): Promise<{ url: string; name: string }> {
  const baseUrl = await getServerUrl();
  if (!baseUrl) throw new ApiError(0, null, "No server URL configured");

  const jwt = await getJwt();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(
    `${baseUrl}/api/mobile/upload?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}`,
    {
      method: "POST",
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      body: formData,
      credentials: "omit",
    },
  );

  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body, body.error ?? `HTTP ${res.status}`);
  return body as { url: string; name: string };
}

/** Resolve a URL path to a collection + slug (for Edit FAB). */
export function resolveContentPath(
  orgId: string,
  siteId: string,
  path: string,
): Promise<{ collection: string; slug: string; label: string }> {
  return request(
    `/api/mobile/content/resolve?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}&path=${encodeURIComponent(path)}`,
  );
}

/** List media files for a site. Optional search query. */
export function getMedia(orgId: string, siteId: string, query?: string): Promise<MediaListResponse> {
  const params = new URLSearchParams({ orgId, siteId });
  if (query) params.set("q", query);
  return request<MediaListResponse>(`/api/mobile/media?${params.toString()}`);
}

/** Trigger AI analysis for a media file. Returns caption, alt, tags. */
export function analyzeMedia(
  orgId: string,
  siteId: string,
  filename: string,
  folder?: string,
): Promise<{ caption: string; alt: string; tags: string[] }> {
  return request(`/api/mobile/media/analyze?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}`, {
    method: "POST",
    body: { filename, folder: folder || undefined },
  });
}

// ─── Chat ────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { tool: string; input?: string; result?: string; status: "running" | "done" | "error" }[];
}

export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Start a chat job and poll for results.
 * Returns a jobId. Use pollChat() to get events.
 */
export async function startChat(
  orgId: string,
  siteId: string,
  messages: { role: string; content: string }[],
  conversationId?: string,
): Promise<string> {
  const data = await request<{ jobId: string }>(
    `/api/mobile/chat?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}`,
    { method: "POST", body: { messages, conversationId } },
  );
  return data.jobId;
}

export interface PollResult {
  events: { event: string; data: any }[];
  cursor: number;
  done: boolean;
}

/** Poll for new chat events since cursor position. */
export async function pollChat(jobId: string, after: number = 0): Promise<PollResult> {
  return request<PollResult>(
    `/api/mobile/chat/poll?jobId=${encodeURIComponent(jobId)}&after=${after}`,
  );
}

/** List saved conversations */
export function listConversations(orgId: string, siteId: string): Promise<any[]> {
  return request(`/api/mobile/chat/conversations?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}`);
}

/** Load a single conversation by ID */
export function getConversation(orgId: string, siteId: string, id: string): Promise<any> {
  return request(`/api/mobile/chat/conversations/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}`);
}

/** Delete a conversation */
export function deleteConversation(orgId: string, siteId: string, id: string): Promise<any> {
  return request(
    `/api/mobile/chat/conversations/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}`,
    { method: "DELETE" },
  );
}

/** Save a conversation */
export function saveConversation(
  orgId: string,
  siteId: string,
  conversation: { id?: string; title: string; messages: any[] },
): Promise<any> {
  return request(
    `/api/mobile/chat/conversations?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}`,
    { method: "POST", body: conversation },
  );
}

/** List chat memories */
export function getMemories(orgId: string, siteId: string): Promise<any> {
  return request(`/api/mobile/chat/memory?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}`);
}

/** Trash a document (soft delete). */
export function deleteDocument(orgId: string, siteId: string, collection: string, slug: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/mobile/content/docs?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}&collection=${encodeURIComponent(collection)}&slug=${encodeURIComponent(slug)}`,
    { method: "DELETE" },
  );
}
