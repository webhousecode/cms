import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The HEAD-refusal false positive, isolated.
 *
 * checkExternal lives inside link-check-runner, which pulls in the CMS. So the
 * DECISION is re-stated here against a mocked fetch — the point under test is
 * "does a 4xx from HEAD end the question?", and that is a two-line rule.
 * Measured live before the fix: https://kpo.naevneneshus.dk answers HEAD 404
 * and GET-with-redirect 200, and the tool called a live legal-authority page
 * dead. https://ec.europa.eu/odr answers 404 to BOTH and really is gone.
 */
async function decide(url: string, fetchImpl: typeof fetch) {
  const head = await fetchImpl(url, { method: "HEAD", redirect: "manual" }).catch(() => null);
  if (!head) return { status: "error" as const };
  if (head.status >= 300 && head.status < 400) return { status: "redirect" as const, httpStatus: head.status };
  if (head.status >= 400) {
    const get = await fetchImpl(url, { method: "GET", redirect: "follow" }).catch(() => null);
    if (get && get.status < 400) return { status: "ok" as const, httpStatus: get.status };
    return { status: "broken" as const, httpStatus: get?.status ?? head.status };
  }
  return { status: "ok" as const, httpStatus: head.status };
}

const respond = (map: Record<string, number>) =>
  vi.fn(async (_url: string, init?: RequestInit) =>
    ({ status: map[(init?.method ?? "GET").toUpperCase()] ?? 200, headers: new Headers() }) as Response,
  ) as unknown as typeof fetch;

afterEach(() => vi.restoreAllMocks());

describe("a 4xx from HEAD is not proof the page is gone", () => {
  it("asks with GET, and takes its answer (kpo.naevneneshus.dk)", async () => {
    expect(await decide("https://kpo.naevneneshus.dk", respond({ HEAD: 404, GET: 200 })))
      .toEqual({ status: "ok", httpStatus: 200 });
  });

  // The negative control, and the one that matters: an address that is 404 on
  // BOTH must still be reported dead. Without it, "retry with GET" could be
  // implemented as "never report anything broken" and pass the test above.
  it("still calls it dead when GET agrees (ec.europa.eu/odr)", async () => {
    expect(await decide("https://ec.europa.eu/odr", respond({ HEAD: 404, GET: 404 })))
      .toEqual({ status: "broken", httpStatus: 404 });
  });

  it("does not spend a second request when HEAD already answered", async () => {
    const f = respond({ HEAD: 200, GET: 200 });
    expect(await decide("https://ok.example", f)).toEqual({ status: "ok", httpStatus: 200 });
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("leaves a redirect a redirect", async () => {
    expect(await decide("https://x.dk", respond({ HEAD: 301 })))
      .toEqual({ status: "redirect", httpStatus: 301 });
  });
});
