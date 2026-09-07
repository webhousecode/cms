import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { decodeJwt } from "jose";
import { isReadOnlyLensSession, mintEditSessionToken } from "../inline-edit-token";

/**
 * F157.17 — a key that may only LOOK must not be able to mint itself a token
 * that may WRITE.
 *
 * Measured against production on 7 September 2026, four calls apart, with one
 * identity:
 *
 *   PATCH /api/cms/platforms/trail   (lens cookie)   → 403 "read-only"
 *   GET   /admin/inline-edit/connect (same cookie)   → 200 + editSession token
 *   PATCH /api/cms/platforms/trail   (that token)    → 200
 *
 * The reason it stood for three months: proxy.ts's boundary is one expression
 * that reads the TOKEN (`lens === true && lensWrite !== true`), minting drops
 * the mark, and minting is a GET — so the method guard never looks at it. An
 * unmarked token and a real editor's token are indistinguishable to the guard.
 * Nothing about it looked wrong from either side.
 */

const BASE = { userId: "u1", email: "e@x.dk", name: "E", siteId: "broberg-ai" };

describe("isReadOnlyLensSession", () => {
  it("says yes to the look-only Lens principal", () => {
    expect(isReadOnlyLensSession({ lens: true })).toBe(true);
    expect(isReadOnlyLensSession({ lens: true, lensWrite: false })).toBe(true);
  });

  it("says NO to the write-key Lens session — the sanctioned way to prove a save works", () => {
    // The positive control. A fix that also locks out F151.2's write key would
    // close the one path that can verify a save end-to-end, which is how a
    // security fix quietly removes the ability to measure anything.
    expect(isReadOnlyLensSession({ lens: true, lensWrite: true })).toBe(false);
  });

  it("says NO to a real human — they carry no lens claim at all", () => {
    expect(isReadOnlyLensSession({ sub: "cb", role: "admin" } as Record<string, unknown>)).toBe(false);
    expect(isReadOnlyLensSession(null)).toBe(false);
    expect(isReadOnlyLensSession(undefined)).toBe(false);
  });

  it("is not fooled by a truthy non-true value", () => {
    expect(isReadOnlyLensSession({ lens: "true" })).toBe(false);
    expect(isReadOnlyLensSession({ lens: 1 })).toBe(false);
  });
});

describe("mintEditSessionToken carries the Lens marks into the token", () => {
  it("marks a token minted from a write-key Lens session", async () => {
    const { token } = await mintEditSessionToken({ ...BASE, lens: true, lensWrite: true });
    const c = decodeJwt(token);
    expect(c.lens).toBe(true);
    expect(c.lensWrite).toBe(true);
    expect(c.editSession).toBe(true);
  });

  it("leaves a real editor's token unmarked, so the guard never touches it", async () => {
    const c = decodeJwt((await mintEditSessionToken(BASE)).token);
    expect(c.lens).toBeUndefined();
    expect(c.lensWrite).toBeUndefined();
  });

  it("a look-only mark survives the mint — the second layer", async () => {
    // Layer 1 (the route refusal) is what works today. This is what still works
    // when someone adds a third minting path and never reads layer 1: the token
    // itself carries the mark, so proxy.ts can refuse it whichever door it came
    // out of.
    const c = decodeJwt((await mintEditSessionToken({ ...BASE, lens: true })).token);
    expect(c.lens).toBe(true);
    expect(c.lensWrite).toBeUndefined();
  });
});

/**
 * Both doors, not just the one that was found. A closed door beside an open one
 * is not a door — and these two mint the SAME credential from different
 * handlers, so a guard in one says nothing about the other.
 */
describe("every minting door refuses a read-only Lens session", () => {
  const DOORS = [
    "src/app/admin/inline-edit/connect/route.ts",
    "src/app/api/inline-edit/token/route.ts",
  ];

  for (const rel of DOORS) {
    it(`${rel} calls the guard BEFORE it mints`, () => {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
      const guard = src.indexOf("isReadOnlyLensSession(");
      const mint = src.indexOf("await mintEditSessionToken(");
      expect(guard, "the door does not call isReadOnlyLensSession at all").toBeGreaterThan(-1);
      expect(mint).toBeGreaterThan(-1);
      // Ordering is the property, not mere presence: a guard after the mint
      // would still grep as present while the token had already been signed.
      expect(guard).toBeLessThan(mint);
    });
  }

  it("finds every OTHER place that mints one, so a third door cannot be added unnoticed", () => {
    // The real risk is not these two — it is the third handler someone adds in
    // six months. This fails loudly on a new call site instead of letting it
    // inherit the hole, which is exactly how the connect route got it.
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
          if (fs.readFileSync(p, "utf-8").includes("mintEditSessionToken(")) {
            found.push(path.relative(process.cwd(), p));
          }
        }
      }
    };
    walk(path.join(process.cwd(), "src"));
    expect(found.sort()).toEqual([...DOORS, "src/lib/inline-edit-token.ts"].sort());
  });
});
