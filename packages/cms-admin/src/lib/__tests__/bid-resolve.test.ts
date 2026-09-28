/**
 * F199.2 — who a Broberg ID login becomes in cms.
 *
 * BID proves WHO (sub); users.json + team.json decide WHAT. These tests pin the
 * one function that maps the first onto the second, because a wrong answer here
 * is either a lock-out (Sanne cannot edit her own clinic) or a takeover (a BID
 * account lands on someone else's cms user).
 */
import { describe, it, expect } from "vitest";
import { resolveBidUser } from "../bid-resolve";
import type { User } from "../auth";

const u = (id: string, email: string, extra: Partial<User> = {}): User => ({
  id, email, name: id, role: "editor", createdAt: "2026-01-01T00:00:00Z", ...extra,
});

const CB = u("cb", "cb@webhouse.dk", { role: "admin", bidSub: "sub-cb" });
const SANNE = u("sanne", "mail@sanneandersen.dk");
const USERS = [CB, SANNE];

describe("resolveBidUser — login", () => {
  it("a known sub logs in as its user, whatever address the token carries", () => {
    // Christian's BID primary is cb@broberg.ai; cms knows him as cb@webhouse.dk.
    const r = resolveBidUser(USERS, { sub: "sub-cb", email: "cb@broberg.ai", email_verified: true });
    expect(r).toEqual({ user: CB, bind: false });
  });

  it("an unbound user is bound on first login when BID has VERIFIED the same address", () => {
    const r = resolveBidUser(USERS, { sub: "sub-sanne", email: "Mail@SanneAndersen.dk", email_verified: true });
    expect(r).toEqual({ user: SANNE, bind: true });
  });

  it("an UNVERIFIED address never binds — anyone can type an address into a sign-up form", () => {
    const r = resolveBidUser(USERS, { sub: "sub-x", email: "mail@sanneandersen.dk", email_verified: false });
    expect(r).toEqual({ error: "unknown_account" });
  });

  it("a missing email_verified claim is treated as unverified", () => {
    const r = resolveBidUser(USERS, { sub: "sub-x", email: "mail@sanneandersen.dk" });
    expect(r).toEqual({ error: "unknown_account" });
  });

  it("a verified address that belongs to a user ALREADY bound to another sub does not take it over", () => {
    const r = resolveBidUser(USERS, { sub: "sub-attacker", email: "cb@webhouse.dk", email_verified: true });
    expect(r).toEqual({ error: "unknown_account" });
  });

  it("an unknown account gets nothing — no user is created (fail-closed)", () => {
    const r = resolveBidUser(USERS, { sub: "sub-new", email: "stranger@example.com", email_verified: true });
    expect(r).toEqual({ error: "unknown_account" });
  });
});

describe("resolveBidUser — linking from a signed-in session", () => {
  it("binds the BID account to the signed-in user even when the addresses differ", () => {
    const r = resolveBidUser([u("cb", "cb@webhouse.dk", { role: "admin" })], { sub: "sub-cb", email: "cb@broberg.ai", email_verified: true }, "cb");
    expect(r).toEqual({ user: u("cb", "cb@webhouse.dk", { role: "admin" }), bind: true });
  });

  it("re-linking the same sub is a no-op, not an error", () => {
    const r = resolveBidUser(USERS, { sub: "sub-cb" }, "cb");
    expect(r).toEqual({ user: CB, bind: false });
  });

  it("refuses a sub that is already bound to ANOTHER cms user", () => {
    const r = resolveBidUser(USERS, { sub: "sub-cb" }, "sanne");
    expect(r).toEqual({ error: "sub_taken" });
  });

  it("refuses to replace a user's existing binding with a different sub", () => {
    const r = resolveBidUser(USERS, { sub: "sub-other" }, "cb");
    expect(r).toEqual({ error: "already_linked" });
  });

  it("a session for a user that no longer exists links nothing", () => {
    const r = resolveBidUser(USERS, { sub: "sub-x" }, "ghost");
    expect(r).toEqual({ error: "unknown_account" });
  });
});
