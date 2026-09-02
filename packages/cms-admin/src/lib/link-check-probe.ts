/**
 * The one place that asks whether an address answers.
 *
 * It lives outside link-check-runner.ts on purpose: the runner imports the CMS,
 * so a test of the runner needs a CMS. The first version of this rule was
 * therefore tested by RE-STATING it in the test file — which meant deleting the
 * real rule left every test green. Caught in review; the fix is that the real
 * function is now importable and the test drives IT.
 */
export type ProbeVerdict = {
  status: "ok" | "broken" | "redirect" | "error";
  httpStatus?: number;
  redirectTo?: string;
  error?: string;
};

const UA = "webhouse-cms-link-checker/1.0";
const TIMEOUT_MS = 6000;

/**
 * One request, with its OWN deadline.
 *
 * The previous shape cleared a single timer when the first request settled, so
 * the retry that followed carried an already-spent AbortController — no time
 * bound at all. A host that answers HEAD fast and then stalls on GET (exactly
 * the hosts the retry exists for) hung on undici's ~300s default and froze its
 * whole concurrency batch. A timeout that is cancelled before the request it
 * guards is not a timeout.
 *
 * The body is cancelled once the status is read: `Range: bytes=0-0` is a hint a
 * server may ignore, and an unread body keeps the socket and its buffer alive
 * for the rest of an hourly, long-lived run.
 */
type Attempt = { res: Response } | { res: null; cause: string };

async function once(url: string, method: "HEAD" | "GET", redirect: RequestRedirect, fetchImpl: typeof fetch): Promise<Attempt> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method,
      signal: ctrl.signal,
      redirect,
      headers: method === "GET" ? { "User-Agent": UA, Range: "bytes=0-0" } : { "User-Agent": UA },
    });
    await res.body?.cancel().catch(() => {});
    return { res };
  } catch (err) {
    // WHY the cause is carried rather than swallowed: "the domain does not
    // exist" and "the host was slow today" are opposite findings. The first is
    // definitive and worth acting on; the second means we learned nothing. The
    // first version of this function returned null for both, so every failure
    // rendered as one generic sentence and an editor could not tell them apart
    // — information the code this replaced actually had.
    const raw = (err as Error)?.message ?? String(err);
    const cause = /abort/i.test(raw) ? `Intet svar inden ${TIMEOUT_MS / 1000}s` : raw.slice(0, 120);
    return { res: null, cause };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<ProbeVerdict> {
  let attempt = await once(url, "HEAD", "manual", fetchImpl);
  if (!attempt.res) attempt = await once(url, "GET", "manual", fetchImpl);
  if (!attempt.res) return { status: "error", error: attempt.cause };
  const head = attempt.res;

  if (head.status >= 300 && head.status < 400)
    return { status: "redirect", httpStatus: head.status, redirectTo: head.headers.get("location") ?? url };

  // A 4xx/5xx from HEAD is not proof the page is gone. Plenty of hosts (and
  // most WAFs) refuse HEAD outright and answer GET perfectly — measured on
  // https://kpo.naevneneshus.dk: HEAD 404, GET-with-redirect 200, and the tool
  // called a live legal-authority page dead. Only a method the server actually
  // honours can settle it.
  if (head.status >= 400) {
    const viaGet = await once(url, "GET", "follow", fetchImpl);
    if (!viaGet.res) return { status: "error", error: `HEAD ${head.status}, og GET: ${viaGet.cause}` };
    if (viaGet.res.status < 400) return { status: "ok", httpStatus: viaGet.res.status };
    return { status: "broken", httpStatus: viaGet.res.status };
  }
  return { status: "ok", httpStatus: head.status };
}
