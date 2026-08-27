import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getMailer, mailGateMode, explainSkippedSend } from "../mailer";

/**
 * A mail that was never sent must never be reported as sent.
 *
 * @broberg/mail answers `{ ok: true, skipped: true }` — success-SHAPED — for
 * four unrelated situations: no key, the kill-switch, the gate closed, and a
 * recipient outside the allowlist. lib/email.ts read `r.ok` alone and threw the
 * `skipped` flag away, so `POST /api/admin/invitations` set `emailSent = true`
 * and answered the admin UI accordingly.
 *
 * Measured on 0.1.0's own dist before the upgrade (lines 44 and 48 both
 * `return { ok: true, skipped: true }`): an admin could invite a customer, be
 * told the invitation had gone out, and nothing had left the building. Four
 * different causes, one identical green answer.
 *
 * These tests drive sendEmail() through a mocked site-config so the whole chain
 * runs — mailer built, send attempted, result interpreted — rather than
 * asserting on a helper in isolation. That is the layer where the lie was told.
 */

let mockSiteConfig: { resendApiKey?: string; emailFrom?: string; emailFromName?: string } = {};
vi.mock("../site-config", () => ({
  readSiteConfig: async () => mockSiteConfig,
}));

const { sendEmail } = await import("../email");

const STRANGER = "en-rigtig-kunde@example.com";
const FLEET_ADMIN = "cb@webhouse.dk";
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn(
    async () => new Response(JSON.stringify({ id: "test-id" }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubEnv("MAIL_ALLOWLIST", "");
  vi.stubEnv("MAIL_DISABLED", "");
  vi.stubEnv("MAIL_LIVE", "");
  vi.stubEnv("RESEND_API_KEY", "");
  mockSiteConfig = { resendApiKey: "re_a_key_that_looks_real" };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const invite = (to: string) =>
  sendEmail({ to, subject: "You've been invited", html: "<p>hi</p>" });

describe("a skipped send is not a sent mail", () => {
  it("does NOT report success when the gate held the mail back", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await invite(STRANGER);
    expect(fetchSpy).not.toHaveBeenCalled(); // nothing left the building
    expect(res.ok).toBe(false); // ...and nothing said it did
    expect(res.error).toBeTruthy();
  });

  it("does NOT report success when mail is switched off outright", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_DISABLED", "1");
    const res = await invite(FLEET_ADMIN);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
  });

  it("still reports success on a real send — the fix must not be 'always false'", async () => {
    // Without this the suite would pass on a sendEmail() that failed every
    // invitation, which is a worse outage than the one being fixed.
    vi.stubEnv("NODE_ENV", "production");
    const res = await invite(STRANGER);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(res).toEqual({ ok: true });
  });

  it("reports success for an allowlisted recipient in dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await invite(FLEET_ADMIN);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(res).toEqual({ ok: true });
  });
});

describe("the reason names what to fix, not just that it failed", () => {
  it("names the kill-switch by the variable an operator would set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_DISABLED", "1");
    const res = await invite(FLEET_ADMIN);
    expect(res.error).toContain("MAIL_DISABLED");
  });

  it("names the recipient and the way out when the gate is allowlist-only", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await invite(STRANGER);
    // An admin cannot act on "not sent". They can act on which address was
    // refused and which switch opens the gate.
    expect(res.error).toContain(STRANGER);
    expect(res.error).toContain("MAIL_LIVE");
  });

  it("gives a DIFFERENT reason for each cause", async () => {
    // The whole point of reading mailer.mode instead of writing one generic
    // sentence: four causes that looked identical must now read differently.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_DISABLED", "1");
    const disabled = (await invite(STRANGER)).error;
    vi.stubEnv("MAIL_DISABLED", "");
    vi.stubEnv("NODE_ENV", "development");
    const gated = (await invite(STRANGER)).error;
    expect(disabled).not.toEqual(gated);
    expect(disabled).toBeTruthy();
    expect(gated).toBeTruthy();
  });

  it("reads the mode off the mailer that ran, so it cannot describe another one", () => {
    // explainSkippedSend takes the mode as an argument rather than re-deriving
    // it. Re-deriving is how you end up explaining a mailer that never sent.
    vi.stubEnv("NODE_ENV", "development");
    expect(explainSkippedSend("disabled", STRANGER)).toContain("MAIL_DISABLED");
    expect(explainSkippedSend("no-key", STRANGER)).toMatch(/nøgle/i);
    expect(explainSkippedSend("allowlist-only", STRANGER)).toContain(STRANGER);
  });
});

/**
 * Our own mailGateMode() and the package's mailer.mode answer the same question
 * in two places. They agreed when this was written; nothing made them keep
 * agreeing. If @broberg/mail ever changes which condition wins — disabled over
 * live, say — our boot check would describe a gate that is not the one running,
 * and every test above would stay green while doing it.
 *
 * So this compares them directly, for every combination, against the real
 * package rather than a stub.
 */
describe("our gate reading matches the package's own", () => {
  const combos = [
    { NODE_ENV: "production", MAIL_LIVE: "", MAIL_DISABLED: "" },
    { NODE_ENV: "development", MAIL_LIVE: "", MAIL_DISABLED: "" },
    { NODE_ENV: "development", MAIL_LIVE: "1", MAIL_DISABLED: "" },
    { NODE_ENV: "production", MAIL_LIVE: "", MAIL_DISABLED: "1" },
    { NODE_ENV: "development", MAIL_LIVE: "1", MAIL_DISABLED: "1" },
    { NODE_ENV: "", MAIL_LIVE: "", MAIL_DISABLED: "" },
  ];

  for (const c of combos) {
    it(`agrees for NODE_ENV="${c.NODE_ENV}" MAIL_LIVE="${c.MAIL_LIVE}" MAIL_DISABLED="${c.MAIL_DISABLED}"`, () => {
      vi.stubEnv("NODE_ENV", c.NODE_ENV);
      vi.stubEnv("MAIL_LIVE", c.MAIL_LIVE);
      vi.stubEnv("MAIL_DISABLED", c.MAIL_DISABLED);
      expect(mailGateMode()).toBe(getMailer("re_a_key_that_looks_real").mode);
    });
  }

  it("diverges ONLY on the key question, and that divergence is deliberate", () => {
    // cms resolves the Resend key per tenant at send time, so "no-key" is not a
    // boot-time property here. mailGateMode() therefore keeps answering the
    // gate question with no key in hand; the package answers the key question
    // first. Pinned so the difference stays a decision and not a surprise.
    vi.stubEnv("NODE_ENV", "production");
    expect(getMailer(undefined).mode).toBe("no-key");
    expect(mailGateMode()).toBe("live");
  });
});
