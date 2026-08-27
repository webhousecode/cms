import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Which of the two Lens keys was presented, and the rules that decide it.
 *
 * Extracted from the route so the ORDERING can be tested on its own. Through
 * the HTTP handler it cannot be: the collision gate returns 403 first, so a
 * test that reversed the order still went green — the exact "a different gate
 * caught it" trap this repo warned cardmem about, reproduced in our own test
 * an hour later. A security property that is only reachable behind another
 * gate is a property nothing pins.
 */

/**
 * Constant-time secret comparison.
 *
 * `===` on a secret short-circuits at the first differing byte, so repeated
 * probes can time a secret out one character at a time. Hard over HTTPS with
 * network jitter — and free to avoid, in the one function whose entire job is
 * to be a boundary. Raised by cardmem from their own review of the shared
 * contract (#22866); ours had the same three comparisons.
 *
 * Hashing first is not decoration: `timingSafeEqual` throws on unequal lengths,
 * and catching that would leak the length through control flow. Two digests are
 * always 32 bytes.
 */
export function secretEquals(secret: string | undefined, presented: string | null): boolean {
  if (!secret || !presented) return false;
  return timingSafeEqual(
    createHash("sha256").update(secret).digest(),
    createHash("sha256").update(presented).digest(),
  );
}

/** True when both Lens secrets are set to the SAME value — a misconfiguration. */
export function lensKeysCollide(): boolean {
  const read = process.env.LENS_MINT_SECRET;
  const write = process.env.LENS_WRITE_SECRET;
  return !!read && !!write && secretEquals(read, write);
}

export function resolveLensKey(bearer: string | null): "none" | "read" | "write" {
  const read = process.env.LENS_MINT_SECRET;
  const write = process.env.LENS_WRITE_SECRET;
  if (!bearer) return "none";

  if (lensKeysCollide()) {
    console.error(
      "[lens] LENS_WRITE_SECRET is identical to LENS_MINT_SECRET — refusing to mint a " +
        "write session. The two keys exist to be different; set a distinct value.",
    );
  }

  // The LOOK-ONLY key is identified FIRST, and that ordering is the security
  // property — not a style choice. cardmem measured the difference on the two
  // implementations of this contract (#22866): asking "is this the WRITE key?"
  // first answers yes when the two secrets happen to be equal, and hands write
  // access to the weak key. Asking "is this the LOOK-ONLY key?" first refuses
  // by name instead, so a collapsed configuration makes write mode USELESS
  // rather than OPEN.
  //
  // Generalised, because it is the useful half: identifying the key that must
  // NOT work is stronger than recognising the one that may. The first fails
  // closed, the second fails open. The second is the common shape.
  //
  // It also means the collision check above is a CLARITY gate (it produces a
  // better error) and no longer the thing standing between a leaked look-only
  // secret and write access. Before this, it was silently both.
  if (secretEquals(read, bearer)) return "read";
  // Ship dark: with no LENS_WRITE_SECRET set, secretEquals is false for every
  // bearer, so a machine that never opted in cannot hand out a write session.
  if (secretEquals(write, bearer)) return "write";
  return "none";
}

