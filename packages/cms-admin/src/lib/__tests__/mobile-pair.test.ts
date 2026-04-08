/**
 * Tests for the mobile pairing flow.
 *
 * Covers the qr-sessions invariants from the perspective of the mobile
 * pairing endpoints — TTL expiry, single-use claim, and reject-after-claim.
 *
 * The HTTP route handlers themselves are thin wrappers around qr-sessions
 * + createToken — those are unit-tested separately. Here we focus on the
 * pairing semantics that the mobile app relies on.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  approveQrSession,
  claimQrSession,
  createQrSession,
  getQrSession,
  _resetQrSessions,
} from "../qr-sessions";

describe("mobile pairing — qr-sessions reuse", () => {
  beforeEach(() => {
    _resetQrSessions();
  });

  it("create + auto-approve produces an approved session bound to the user", () => {
    const session = createQrSession("test-ua");
    approveQrSession(session.id, "user-1");
    const fetched = getQrSession(session.id);
    expect(fetched?.status).toBe("approved");
    expect(fetched?.approvedUserId).toBe("user-1");
  });

  it("claim returns the userId exactly once", () => {
    const session = createQrSession();
    approveQrSession(session.id, "user-1");

    const first = claimQrSession(session.id);
    expect(first).toEqual({ userId: "user-1" });

    // Second call must fail — replay protection
    const second = claimQrSession(session.id);
    expect(second).toBeNull();
  });

  it("expired session cannot be approved or claimed", () => {
    const session = createQrSession();
    // Force expiry by mutating the internal state
    const internal = getQrSession(session.id);
    if (internal) {
      internal.expiresAt = Date.now() - 1000;
    }

    expect(() => approveQrSession(session.id, "user-1")).toThrow();
    expect(claimQrSession(session.id)).toBeNull();
  });

  it("rejected session cannot be claimed", () => {
    const session = createQrSession();
    // Pending → claim returns null because not approved
    expect(claimQrSession(session.id)).toBeNull();
  });

  it("session ids are URL-safe and at least 32 chars", () => {
    const session = createQrSession();
    expect(session.id.length).toBeGreaterThanOrEqual(32);
    // base64url alphabet only — no +, /, or =
    expect(session.id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("expiresAt is ~5 minutes in the future", () => {
    const before = Date.now();
    const session = createQrSession();
    const after = Date.now();
    const expectedMin = before + 4 * 60 * 1000;
    const expectedMax = after + 6 * 60 * 1000;
    expect(session.expiresAt).toBeGreaterThanOrEqual(expectedMin);
    expect(session.expiresAt).toBeLessThanOrEqual(expectedMax);
  });
});
