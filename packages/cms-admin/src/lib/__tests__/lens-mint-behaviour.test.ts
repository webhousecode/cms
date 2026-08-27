import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { decodeJwt } from "jose";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { POST } from "@/app/api/lens-session/route";
import { resolveLensKey } from "@/lib/lens-keys";

/**
 * The key gate, RUN rather than read.
 *
 * lens-two-keys.test.ts proves this gate by asserting that a string appears in
 * the route's source:
 *
 *     expect(fn).toContain('if (write && bearer === write) return "write";');
 *
 * That is a claim about a file, not about behaviour. It goes green on any
 * refactor that moves the resolver into a helper WITH the bug in it — and it
 * would have gone green on the exact bug cardmem found in @broberg/lens itself
 * (intercom #22851), where `opts.secret ?? process.env.LENS_MINT_SECRET` falls
 * back to the LOOK-ONLY secret when the write variable is unset, so the write
 * gate quietly authenticates against the weak key.
 *
 * Our shape does not have that fallback — both secrets are read directly, per
 * request. But a test that cannot tell the difference is not what proves it,
 * and answering a peer "that doesn't apply to us" on the strength of a string
 * match is a firmer answer than the evidence carried. Same family as `toContain`
 * generally: a weaker predicate than it reads as, failing in the GREEN direction.
 *
 * So these call the route and judge the decoded claims. cardmem's own suggested
 * probe — unset the write secret, check the read key still cannot mint write —
 * is the second case below.
 */

const READ_KEY = "test-read-secret-aaaa";
const WRITE_KEY = "test-write-secret-bbbb";

const mint = (bearer: string | null, body: Record<string, unknown> = {}) =>
  POST(
    new NextRequest("https://webhouse.app/api/lens-session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

/** The claims of the session cookie the route handed back, or null if none. */
async function claimsOf(res: Response): Promise<Record<string, unknown> | null> {
  if (res.status !== 200) return null;
  const json = (await res.json()) as { cookies?: Array<{ name: string; value: string }> };
  const session = json.cookies?.find((c) => c.name === "cms-session");
  return session ? (decodeJwt(session.value) as Record<string, unknown>) : null;
}

const WRITE_REQUEST = { mode: "write", writes: true };

beforeEach(() => {
  vi.stubEnv("CMS_JWT_SECRET", "test-jwt-secret-for-lens-mint-behaviour-only");
  vi.stubEnv("LENS_MINT_SECRET", READ_KEY);
  vi.stubEnv("LENS_WRITE_SECRET", WRITE_KEY);
  vi.stubEnv("LENS_ACTIVE_ORG", "");
  vi.stubEnv("LENS_ACTIVE_SITE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the write gate, exercised", () => {
  it("mints a write session for the write key that asks for one", async () => {
    // The positive control. Without it every case below would pass on a route
    // that refuses everything, which is a different outage.
    const claims = await claimsOf(await mint(WRITE_KEY, WRITE_REQUEST));
    expect(claims?.lensWrite).toBe(true);
    expect(claims?.lens).toBe(true); // additive — never a replacement
  });

  it("refuses the look-only key a write session", async () => {
    const res = await mint(READ_KEY, WRITE_REQUEST);
    expect(res.status).toBe(403);
    expect(await claimsOf(res)).toBeNull();
  });

  it("STILL refuses it when LENS_WRITE_SECRET is unset — no fallback to the read key", async () => {
    // cardmem's probe, run. The bug being excluded: a resolver that falls back
    // to the look-only secret when the write variable is absent would mint here
    // — the split would read as configured and be worth nothing.
    //
    // `undefined`, NOT `""`. The first draft of this test stubbed an empty
    // string and passed against a deliberately introduced
    // `process.env.LENS_WRITE_SECRET ?? process.env.LENS_MINT_SECRET` — because
    // `??` only falls back on undefined, and an empty string is a value. The
    // test described the right bug and could not see it. An unset variable is
    // absent, and the test has to be absent too.
    vi.stubEnv("LENS_WRITE_SECRET", undefined);
    const res = await mint(READ_KEY, WRITE_REQUEST);
    expect(res.status).toBe(403);
    expect(await claimsOf(res)).toBeNull();
  });

  // Worth knowing, and only visible by mutation-checking: introducing the
  // fallback ALONE does not break this. It makes `write` equal `read`, and the
  // identical-secrets guard below then refuses — so that guard is quietly doing
  // double duty as the backstop for a bug it was not written for. Both have to
  // go before anything is exposed, which makes removing the identical-secrets
  // guard more dangerous than its own test suggests. Said here rather than
  // discovered again.

  it("ships dark: with no write secret, not even the write key mints a write session", async () => {
    vi.stubEnv("LENS_WRITE_SECRET", undefined);
    const res = await mint(WRITE_KEY, WRITE_REQUEST);
    expect(res.status).toBe(401); // that bearer is now nobody's key
  });

  it("holding the write key is not using it — no lensWrite unless asked", async () => {
    const claims = await claimsOf(await mint(WRITE_KEY, {}));
    expect(claims?.lens).toBe(true);
    expect(claims?.lensWrite).toBeUndefined();
  });

  it("refuses mode:write without writes:true rather than quietly downgrading", async () => {
    const res = await mint(WRITE_KEY, { mode: "write" });
    expect(res.status).toBe(400);
    expect(await claimsOf(res)).toBeNull();
  });

  it("refuses to mint at all when the two secrets are the same value", async () => {
    // Configured that way, the look-only key silently gains write access — the
    // one thing the split exists to prevent. Proven by running the route with
    // both variables set to one value, not by grepping for "write === read".
    vi.stubEnv("LENS_WRITE_SECRET", READ_KEY);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await mint(READ_KEY, WRITE_REQUEST);
    expect(res.status).toBe(403);
    expect(await claimsOf(res)).toBeNull();
  });

  it("gives the write principal a separate identity, not the same user with a flag", async () => {
    const read = await claimsOf(await mint(READ_KEY, {}));
    const write = await claimsOf(await mint(WRITE_KEY, WRITE_REQUEST));
    expect(write?.email).not.toEqual(read?.email);
    expect(write?.email).not.toEqual("cb@webhouse.dk"); // never a real user
  });

  it("refuses an unknown bearer, and a missing one", async () => {
    expect((await mint("not-either-key", WRITE_REQUEST)).status).toBe(401);
    expect((await mint(null, WRITE_REQUEST)).status).toBe(401);
  });
});

/**
 * cardmem's second finding, checked by COUNTING.
 *
 * Their audit ran before the handler, so every write-SHAPED request wrote a
 * `lens_write_mint` row — including ones rejected 401 straight after. Measured
 * live: 6 write-shaped requests, 1 successful mint, 2 rows. It fails in the
 * reassuring direction, inflating exactly the log an unauthorised-write
 * investigation would read.
 *
 * Their point about the test matters as much as the fix: a per-request
 * assertion goes green on precisely the case that is wrong. So count.
 *
 * We keep a console line rather than a database row, and it sits after all
 * three gates — but the ordering is the only thing holding that, and ordering
 * is what a refactor moves.
 */
describe("a refused write request leaves no write trace", () => {
  it("logs exactly one write mint across five write-shaped requests", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "log").mockImplementation((m: unknown) => {
      if (typeof m === "string" && m.includes("write session minted")) logged.push(m);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await mint(READ_KEY, WRITE_REQUEST); //          403 — wrong key
    await mint("not-either-key", WRITE_REQUEST); //  401 — no key
    await mint(null, WRITE_REQUEST); //              401 — no bearer
    await mint(WRITE_KEY, { mode: "write" }); //     400 — writes:true missing
    await mint(WRITE_KEY, WRITE_REQUEST); //         200 — the only real one

    expect(logged).toHaveLength(1);
  });
});

/**
 * The ORDER in which the two keys are identified is a security property.
 *
 * cardmem measured the difference across the two implementations of this
 * contract (#22866). Asking "is this the WRITE key?" first answers yes when the
 * two secrets happen to be equal, and hands write access to the weak key.
 * Asking "is this the LOOK-ONLY key?" first refuses by name, so a collapsed
 * configuration makes write mode USELESS rather than OPEN.
 *
 * Generalised: identifying the key that must NOT work is stronger than
 * recognising the one that may. The first fails closed, the second fails open —
 * and the second is the common shape, which is what makes this worth a test
 * rather than a comment.
 */
describe("the gate fails closed when the configuration collapses", () => {
  it("refuses write mode with the specific reason when both secrets are one value", async () => {
    vi.stubEnv("LENS_WRITE_SECRET", READ_KEY);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await mint(READ_KEY, WRITE_REQUEST);
    expect(res.status).toBe(403);
    // cardmem's error code, so the Lens daemon handles both implementations
    // identically. "wrong key" is not actionable; "you set both to the same
    // value" is.
    expect(await res.json()).toEqual({ error: "write_key_must_differ_from_read_key" });
  });

  it("still mints a LOOK-ONLY session when the secrets collide — only write is barred", async () => {
    // Failing closed must not mean failing off. Lens still has to be able to
    // look, or a misconfiguration takes visual verification down entirely.
    vi.stubEnv("LENS_WRITE_SECRET", READ_KEY);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const claims = await claimsOf(await mint(READ_KEY, {}));
    expect(claims?.lens).toBe(true);
    expect(claims?.lensWrite).toBeUndefined();
  });

  it("identifies the look-only key BEFORE the write key", () => {
    // Called DIRECTLY, not through the handler. Through HTTP this cannot be
    // pinned: the collision gate returns 403 first, so the first version of
    // this test passed with the order reversed — a different gate caught it,
    // which is the exact trap we had just warned cardmem about. Found by
    // mutation-checking our own new test an hour later.
    vi.stubEnv("LENS_WRITE_SECRET", READ_KEY);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(resolveLensKey(READ_KEY)).toBe("read");
  });

  it("the ordering holds with no collision at all", () => {
    // The positive side: with two genuinely different secrets, each key is
    // still identified as itself. Without this, "always read" would pass above.
    expect(resolveLensKey(READ_KEY)).toBe("read");
    expect(resolveLensKey(WRITE_KEY)).toBe("write");
    expect(resolveLensKey("neither")).toBe("none");
  });
});

/**
 * The comparison changed from `===` to constant-time.
 *
 * STATED PLAINLY: these cases do NOT prove it is timing-safe. `===` and
 * timingSafeEqual return the same VALUE — only the duration differs — so
 * restoring `===` leaves every case below green. Measured, not assumed.
 * The timing property is pinned by the source guard at the bottom of this file,
 * which is the honest tool for a property that is invisible at runtime.
 *
 * What these DO prove is the half that would otherwise go unchecked: the new
 * comparison still judges correctly. A boundary that is beautifully timing-safe
 * and accepts the wrong key is worse than the one it replaced.
 *
 * The unequal-length case is the one that would throw: `timingSafeEqual` rejects
 * mismatched buffers, which is why both sides are hashed to a fixed 32 bytes
 * first. Catching the throw instead would leak the length through control flow.
 */
describe("constant-time comparison still judges correctly", () => {
  it("accepts the right key", async () => {
    expect(await claimsOf(await mint(WRITE_KEY, WRITE_REQUEST))).not.toBeNull();
  });

  it("rejects a wrong key of the SAME length", async () => {
    const wrong = "test-read-secret-zzzz";
    // The premise of this case, asserted rather than assumed: same length,
    // differing only in the last bytes — the shape `===` short-circuits on.
    expect(wrong.length).toBe(READ_KEY.length);
    expect(wrong).not.toBe(READ_KEY);
    expect((await mint(wrong, {})).status).toBe(401);
  });

  it("rejects a wrong key of a DIFFERENT length without throwing", async () => {
    expect((await mint("x", {})).status).toBe(401);
    expect((await mint(`${READ_KEY}-and-more`, {})).status).toBe(401);
    expect((await mint("", {})).status).toBe(401); // empty bearer, not a match
  });
});

/**
 * The one property here that a behavioural test genuinely cannot reach.
 *
 * Timing-safety is not observable from a return value, and a real timing
 * measurement in a unit test is a flake generator. So this reads the source —
 * the same tool F151.3 removed eight of, kept HERE for the reason that
 * justified keeping the proxy scan: the file itself is the only place the
 * property exists.
 *
 * The positive control matters more than usual: a guard that scans nothing
 * reports "no violations" and looks identical to a guard that passed.
 */
describe("no secret is compared with ===", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "lens-keys.ts"),
    "utf-8",
  );

  it("scanned the file it thinks it scanned", () => {
    expect(src.length, "lens-keys.ts empty — guard scanned nothing").toBeGreaterThan(500);
    expect(src).toContain("export function resolveLensKey");
  });

  it("compares through timingSafeEqual, not an equality operator", () => {
    expect(src).toContain("timingSafeEqual");
    const fn = src.slice(src.indexOf("export function secretEquals"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body, "secretEquals fell back to an equality operator")
      .not.toMatch(/[!=]==/);
  });

  it("no comparison operator touches either secret variable anywhere", () => {
    // Not just inside secretEquals — a caller that short-circuits with
    // `bearer === read` before calling it would undo the whole thing.
    expect(src).not.toMatch(/(bearer|presented)\s*[!=]==\s*(read|write|secret)\b/);
    expect(src).not.toMatch(/(read|write|secret)\s*[!=]==\s*(bearer|presented)\b/);
  });
});
