import { describe, it, expect, beforeAll } from "vitest";
import { jwtVerify } from "jose";
import { mintEditSessionToken, EDIT_SESSION_TTL_SECONDS } from "../inline-edit-token";

const SECRET = "test-secret-for-inline-edit-token";

beforeAll(() => {
  process.env.CMS_JWT_SECRET = SECRET;
});

const verify = (token: string) =>
  jwtVerify(token, new TextEncoder().encode(SECRET));

describe("mintEditSessionToken", () => {
  it("mints a token that verifies with CMS_JWT_SECRET and carries the editSession claims", async () => {
    const { token, expiresIn } = await mintEditSessionToken({
      userId: "u1",
      email: "cb@webhouse.dk",
      name: "Christian",
      role: "admin",
      siteId: "sanneandersen",
    });
    expect(expiresIn).toBe(EDIT_SESSION_TTL_SECONDS);
    const { payload } = await verify(token);
    expect(payload.editSession).toBe(true);
    expect(payload.site).toBe("sanneandersen");
    expect(payload.sub).toBe("u1");
    expect(payload.email).toBe("cb@webhouse.dk");
    expect(payload.role).toBe("admin");
    // 30-day TTL, within a second of now+TTL
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(now + EDIT_SESSION_TTL_SECONDS - 5);
    expect(payload.exp).toBeLessThanOrEqual(now + EDIT_SESSION_TTL_SECONDS + 1);
  });

  it("defaults role to editor when not supplied", async () => {
    const { token } = await mintEditSessionToken({
      userId: "u2",
      email: "e@e.dk",
      name: "E",
      siteId: "broberg-ai",
    });
    const { payload } = await verify(token);
    expect(payload.role).toBe("editor");
    expect(payload.site).toBe("broberg-ai");
  });

  it("is scoped to the requested site only", async () => {
    const { token } = await mintEditSessionToken({
      userId: "u3",
      email: "e@e.dk",
      name: "E",
      siteId: "site-a",
    });
    const { payload } = await verify(token);
    expect(payload.site).toBe("site-a");
    expect(payload.site).not.toBe("site-b");
  });
});
