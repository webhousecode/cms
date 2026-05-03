/**
 * Auto-register a `page_build` webhook on a GitHub repo so cms-admin
 * receives a callback whenever GH Pages publishes the site.
 *
 * Idempotent: if a webhook to the same URL already exists, we update its
 * config (refresh secret) instead of creating a duplicate.
 */
export interface RegisterPageBuildHookOptions {
  repo: string;          // "owner/repo"
  token: string;         // GH PAT or OAuth access_token w/ admin:repo_hook
  callbackUrl: string;   // e.g. https://webhouse.app/api/admin/page-build-webhook
  secret: string;        // shared HMAC secret
}

export interface RegisterPageBuildHookResult {
  ok: boolean;
  hookId?: number;
  action?: "created" | "updated" | "noop";
  error?: string;
}

const HOOK_API = (repo: string) => `https://api.github.com/repos/${repo}/hooks`;

export async function registerPageBuildHook(
  opts: RegisterPageBuildHookOptions,
): Promise<RegisterPageBuildHookResult> {
  const headers = {
    Authorization: `Bearer ${opts.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  // 1. Look for an existing hook pointing to the same callback URL.
  let existing: { id: number; config?: { url?: string } } | null = null;
  try {
    const listRes = await fetch(`${HOOK_API(opts.repo)}?per_page=100`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (listRes.ok) {
      const hooks = await listRes.json() as Array<{ id: number; events: string[]; config: { url?: string } }>;
      const match = hooks.find(
        (h) =>
          h.config?.url === opts.callbackUrl &&
          (h.events ?? []).includes("page_build"),
      );
      if (match) existing = { id: match.id, config: match.config };
    }
  } catch { /* fall through to create */ }

  const payload = {
    name: "web",
    active: true,
    events: ["page_build"],
    config: {
      url: opts.callbackUrl,
      content_type: "json",
      secret: opts.secret,
      insecure_ssl: "0",
    },
  };

  // 2. Update if found, otherwise create.
  if (existing) {
    try {
      const res = await fetch(`${HOOK_API(opts.repo)}/${existing.id}/config`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload.config),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `update failed (${res.status}): ${body.slice(0, 200)}` };
      }
      return { ok: true, hookId: existing.id, action: "updated" };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  try {
    const res = await fetch(HOOK_API(opts.repo), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `create failed (${res.status}): ${body.slice(0, 200)}` };
    }
    const created = await res.json() as { id: number };
    return { ok: true, hookId: created.id, action: "created" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
