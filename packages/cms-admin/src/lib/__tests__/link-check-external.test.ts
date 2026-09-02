import { describe, expect, it, vi } from "vitest";
import { probeUrl } from "@/lib/link-check-probe";

/**
 * The HEAD-refusal false positive, isolated — driving the REAL function.
 *
 * The first version of this file re-stated the rule in a local `decide()`
 * helper, because the rule lived inside link-check-runner and importing that
 * pulls in the whole CMS. That made the suite worthless in the one direction
 * that matters: delete the real rule and every test here still passed. Moving
 * the rule into link-check-probe.ts was done FOR this — the export exists so
 * the test can drive it rather than a copy of it.
 *
 * Measured live before the fix: https://kpo.naevneneshus.dk answers HEAD 404
 * and GET-with-redirect 200, and the tool called a live legal-authority page
 * dead. https://ec.europa.eu/odr answers 404 to BOTH and really is gone.
 */
const respond = (map: Record<string, number>) =>
  vi.fn(async (_url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const status = map[method];
    if (status === undefined) throw new Error(`no route for ${method}`);
    return { status, headers: new Headers(), body: null } as unknown as Response;
  }) as unknown as typeof fetch;

/** A host that never answers — the shape that must NOT be called dead. */
const hangs = (() =>
  vi.fn(async () => {
    const e = new Error("This operation was aborted");
    e.name = "AbortError";
    throw e;
  })) as unknown as () => typeof fetch;

describe("a 4xx from HEAD is not proof the page is gone", () => {
  it("asks with GET, and takes its answer (kpo.naevneneshus.dk)", async () => {
    expect(await probeUrl("https://kpo.naevneneshus.dk", respond({ HEAD: 404, GET: 200 })))
      .toEqual({ status: "ok", httpStatus: 200 });
  });

  // The negative control, and the one that matters: an address that is 404 on
  // BOTH must still be reported dead. Without it, "retry with GET" could be
  // implemented as "never report anything broken" and pass the test above.
  it("still calls it dead when GET agrees (ec.europa.eu/odr)", async () => {
    expect(await probeUrl("https://ec.europa.eu/odr", respond({ HEAD: 404, GET: 404 })))
      .toEqual({ status: "broken", httpStatus: 404 });
  });

  it("does not spend a second request when HEAD already answered", async () => {
    const f = respond({ HEAD: 200, GET: 200 });
    expect(await probeUrl("https://ok.example", f)).toEqual({ status: "ok", httpStatus: 200 });
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("leaves a redirect a redirect", async () => {
    const r = await probeUrl("https://x.dk", respond({ HEAD: 301 }));
    expect(r.status).toBe("redirect");
    expect(r.httpStatus).toBe(301);
  });

  it("falls back to GET when the host refuses HEAD outright", async () => {
    // HEAD throws (some hosts reset the connection rather than answer), so the
    // question is settled by the GET that follows — not by the throw.
    expect(await probeUrl("https://no-head.example", respond({ GET: 200 })))
      .toEqual({ status: "ok", httpStatus: 200 });
  });
});

describe("a host that never answers is not a dead page", () => {
  it("reports error, and says WHICH failure it was", async () => {
    const r = await probeUrl("https://slow.example", hangs());
    expect(r.status).toBe("error");
    // The cause has to survive: "the domain does not exist" and "the host was
    // slow" are opposite findings, and an editor acts differently on each.
    expect(r.error).toBe("Intet svar inden 6s");
  });

  it("keeps a DNS failure's own words rather than calling it a timeout", async () => {
    const dead = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND nope.invalid");
    }) as unknown as typeof fetch;
    const r = await probeUrl("https://nope.invalid", dead);
    expect(r).toEqual({ status: "error", error: "getaddrinfo ENOTFOUND nope.invalid" });
  });
});
