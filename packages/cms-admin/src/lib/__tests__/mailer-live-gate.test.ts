import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getMailer, assertMailGateSane } from "../mailer";

/**
 * The one line that stands between a dev box and a customer's inbox.
 *
 * @broberg/mail defaults `live` to `!!apiKey` — so ANY environment holding a
 * Resend key delivers to real recipients unless the caller says otherwise.
 * mailer.ts says otherwise, explicitly:
 *
 *     live: process.env.NODE_ENV === "production" || process.env.MAIL_LIVE === "1"
 *
 * Two fleet repos (xrt81, upmetrics) hit the default independently and neither
 * noticed in advance — a mail that goes out looks exactly like a mail that was
 * meant to go out. cms was never exposed because that line is there, which
 * makes the line load-bearing: delete it and nothing fails, nothing logs, and
 * the next preview deploy quietly mails strangers.
 *
 * So it gets a test. Mutation-checked: drop `live:` from getMailer() and the
 * first case here goes red.
 */

const STRANGER = "en-rigtig-kunde@example.com";
const FLEET_ADMIN = "cb@webhouse.dk";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Nothing in this file may reach the network. A test that mails a stranger
  // to prove it doesn't mail strangers would be its own incident.
  fetchSpy = vi.fn(async () =>
    new Response(JSON.stringify({ id: "test-id" }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubEnv("MAIL_ALLOWLIST", "");
  vi.stubEnv("MAIL_DISABLED", "");
  vi.stubEnv("MAIL_LIVE", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const send = (to: string) =>
  getMailer("re_a_key_that_looks_real").send({
    from: "CMS <no-reply@webhouse.app>",
    to,
    subject: "test",
    html: "<p>test</p>",
  });

describe("mailer live-gate", () => {
  it("does NOT deliver to a stranger outside production, key or no key", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await send(STRANGER);
    expect(res).toEqual({ ok: true, skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled(); // never even reached Resend
  });

  it("does NOT deliver to a stranger in a preview build either", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await send(STRANGER);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("DOES deliver in production — the gate must not be 'always off'", async () => {
    // Without this case the suite would still pass if getMailer never sent
    // anything at all, which would be a different outage.
    vi.stubEnv("NODE_ENV", "production");
    const res = await send(STRANGER);
    expect(res.ok).toBe(true);
    expect(res.skipped).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("api.resend.com");
  });

  it("still reaches a fleet admin in dev, so test sends are testable", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await send(FLEET_ADMIN);
    expect(res.skipped).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("honours MAIL_ALLOWLIST in dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MAIL_ALLOWLIST", `${STRANGER}, someone-else@example.com`);
    const res = await send(STRANGER);
    expect(res.skipped).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("MAIL_LIVE=1 is the deliberate opt-in for a non-production run", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MAIL_LIVE", "1");
    await send(STRANGER);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("MAIL_DISABLED=1 stops everything, production included", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_DISABLED", "1");
    const res = await send(FLEET_ADMIN);
    expect(res).toEqual({ ok: true, skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends nothing at all when no key is configured (ship-dark)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await getMailer(undefined).send({
      from: "CMS <no-reply@webhouse.app>",
      to: FLEET_ADMIN,
      subject: "test",
      html: "<p>test</p>",
    });
    expect(res).toEqual({ ok: true, skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/**
 * The mirror failure, raised by the package's author: guarding against
 * "accidentally live" buys us "accidentally NOT live". If NODE_ENV is ever not
 * exactly "production" in the container, prod delivers to allowlist + fleet
 * admins only — and nothing says so. @broberg/mail warns only when `live` is
 * left undefined, and we always pass a boolean, so its warning can never fire
 * for us. This boot check is the thing that breaks that silence.
 *
 * A test cannot catch an environment that lies about itself; it can only make
 * sure the complaint is wired up and does not cry wolf.
 */
describe("mail gate boot check", () => {
  const said: string[] = [];
  const check = () => {
    said.length = 0;
    return assertMailGateSane((m) => said.push(m));
  };

  it("complains when a DEPLOYED instance boots with the gate shut", () => {
    // The drift case: the platform says this is webhouse-app, our own env says
    // it is not production. Mail would keep "succeeding" while reaching nobody.
    vi.stubEnv("FLY_APP_NAME", "webhouse-app");
    vi.stubEnv("NODE_ENV", "development");
    expect(check()).toBe(false);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("webhouse-app");
    expect(said[0]).toContain("GATED OFF");
  });

  it("complains just as loudly when NODE_ENV is missing entirely", () => {
    vi.stubEnv("FLY_APP_NAME", "webhouse-app");
    vi.stubEnv("NODE_ENV", "");
    expect(check()).toBe(false);
    expect(said[0]).toContain("unset");
  });

  it("stays quiet on a healthy deployed boot", () => {
    vi.stubEnv("FLY_APP_NAME", "webhouse-app");
    vi.stubEnv("NODE_ENV", "production");
    expect(check()).toBe(true);
    expect(said).toHaveLength(0);
  });

  it("accepts MAIL_LIVE=1 as the deliberate override on a deployed box", () => {
    vi.stubEnv("FLY_APP_NAME", "webhouse-app");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MAIL_LIVE", "1");
    expect(check()).toBe(true);
    expect(said).toHaveLength(0);
  });

  it("complains when a deployed instance is disabled outright", () => {
    // The gap the package author named: more than one thing shuts the gate,
    // and all of them return the same success-shaped result. A check written
    // against "is it live" sails straight past MAIL_DISABLED.
    vi.stubEnv("FLY_APP_NAME", "webhouse-app");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_DISABLED", "1");
    expect(check()).toBe(false);
    expect(said[0]).toContain('mode="disabled"');
    expect(said[0]).toContain("NOTHING is sent");
  });

  it("names WHICH way the gate is shut, not just that it is", () => {
    vi.stubEnv("FLY_APP_NAME", "webhouse-app");
    vi.stubEnv("NODE_ENV", "development");
    expect(check()).toBe(false);
    expect(said[0]).toContain('mode="allowlist-only"');
  });

  it("never complains on a laptop — a dev box is SUPPOSED to be gated", () => {
    vi.stubEnv("FLY_APP_NAME", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(check()).toBe(true);
    expect(said).toHaveLength(0);
  });

  it("does not use NODE_ENV to decide whether it is deployed", () => {
    // Guards the circularity this check was rewritten to escape: if "deployed"
    // were read from NODE_ENV, the complaint branch could never be reached,
    // because the gate is open exactly when NODE_ENV is "production".
    vi.stubEnv("FLY_APP_NAME", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(check()).toBe(true); // quiet: not deployed
    vi.stubEnv("FLY_APP_NAME", "webhouse-app");
    vi.stubEnv("NODE_ENV", "staging");
    expect(check()).toBe(false); // loud: deployed, gate shut
  });
});
