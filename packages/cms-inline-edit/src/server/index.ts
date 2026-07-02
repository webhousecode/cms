/**
 * Optional server-side helpers (Node/Bun) for sites that want a same-origin
 * relay instead of calling the CMS directly from the browser. Not required
 * for the direct-from-browser flow used by initInlineEdit().
 */

export interface SaveInlineEditFieldOptions {
  cmsBaseUrl: string;
  siteId: string;
  collection: string;
  slug: string;
  field: string;
  value: string;
  sessionToken: string;
}

export type SaveInlineEditFieldResult = { ok: true } | { ok: false; error: string };

/** GET the doc, merge the changed field into .data, PATCH the full merged object back. */
export async function saveInlineEditField(
  options: SaveInlineEditFieldOptions,
): Promise<SaveInlineEditFieldResult> {
  const { cmsBaseUrl, siteId, collection, slug, field, value, sessionToken } = options;
  const headers = { Authorization: `Bearer ${sessionToken}` };

  const getRes = await fetch(`${cmsBaseUrl}/api/cms/${collection}/${slug}?site=${siteId}`, {
    headers,
  });
  if (!getRes.ok) return { ok: false, error: `GET failed: ${getRes.status}` };
  const doc = (await getRes.json()) as { data?: Record<string, unknown> };
  const mergedData = { ...doc.data, [field]: value };

  const patchRes = await fetch(`${cmsBaseUrl}/api/cms/${collection}/${slug}?site=${siteId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ data: mergedData }),
  });
  if (!patchRes.ok) return { ok: false, error: `PATCH failed: ${patchRes.status}` };
  return { ok: true };
}

export interface VerifyEditSessionOptions {
  cmsBaseUrl: string;
  token: string;
}

export interface EditSessionUser {
  sub: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Calls the CMS's existing GET /api/auth/me with the token as a Bearer header.
 * That endpoint always returns 200 — {"user": null} for anonymous/invalid
 * tokens, never a 401 — so absence of a user is read from the body, not the
 * status code.
 */
export async function verifyEditSession(
  options: VerifyEditSessionOptions,
): Promise<EditSessionUser | null> {
  const res = await fetch(`${options.cmsBaseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${options.token}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { user?: EditSessionUser | null };
  return body.user ?? null;
}
