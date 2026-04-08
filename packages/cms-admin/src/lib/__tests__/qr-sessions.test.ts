/**
 * F59 phase 2 — QR session store tests.
 *
 * Covers the lifecycle, replay protection, and expiry. The store is
 * in-memory so each test resets it.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createQrSession,
  getQrSession,
  approveQrSession,
  rejectQrSession,
  claimQrSession,
  _resetQrSessions,
} from "../qr-sessions";

afterEach(() => {
  _resetQrSessions();
  vi.useRealTimers();
});

describe("qr-sessions", () => {
  it("creates a pending session with a unique id", () => {
    const a = createQrSession("ua/1");
    const b = createQrSession("ua/2");
    expect(a.id).not.toBe(b.id);
    expect(a.status).toBe("pending");
    expect(a.userAgent).toBe("ua/1");
  });

  it("approve transitions pending → approved with userId", () => {
    const s = createQrSession();
    const updated = approveQrSession(s.id, "user-1");
    expect(updated.status).toBe("approved");
    expect(updated.approvedUserId).toBe("user-1");
  });

  it("reject transitions pending → rejected", () => {
    const s = createQrSession();
    rejectQrSession(s.id);
    expect(getQrSession(s.id)?.status).toBe("rejected");
  });

  it("cannot approve an already-approved session", () => {
    const s = createQrSession();
    approveQrSession(s.id, "user-1");
    expect(() => approveQrSession(s.id, "user-2")).toThrow(/approved/);
  });

  it("claim returns userId once and only once (replay protection)", () => {
    const s = createQrSession();
    approveQrSession(s.id, "user-42");
    const first = claimQrSession(s.id);
    expect(first?.userId).toBe("user-42");
    const second = claimQrSession(s.id);
    expect(second).toBeNull();
    expect(getQrSession(s.id)?.status).toBe("claimed");
  });

  it("claim returns null for pending or rejected sessions", () => {
    const s = createQrSession();
    expect(claimQrSession(s.id)).toBeNull(); // still pending
    rejectQrSession(s.id);
    expect(claimQrSession(s.id)).toBeNull();
  });

  it("expired sessions cannot be approved", () => {
    vi.useFakeTimers();
    const s = createQrSession();
    vi.advanceTimersByTime(6 * 60 * 1000); // > 5 min TTL
    expect(() => approveQrSession(s.id, "user-1")).toThrow();
    expect(getQrSession(s.id)?.status).toBe("expired");
  });

  it("getQrSession returns null for unknown id", () => {
    expect(getQrSession("nope")).toBeNull();
  });
});
