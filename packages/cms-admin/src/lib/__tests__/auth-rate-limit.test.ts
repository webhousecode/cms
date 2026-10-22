/** Security W41 H7 — unlimited password/code guessing on four doors. */
import { describe, it, expect, beforeEach } from "vitest";
import { authAttemptLimited, AUTH_ATTEMPTS_PER_WINDOW, _resetAuthRateLimit } from "../auth-rate-limit";

beforeEach(() => _resetAuthRateLimit());

describe("authAttemptLimited", () => {
  it("allows the window's attempts, refuses the next", () => {
    for (let i = 0; i < AUTH_ATTEMPTS_PER_WINDOW; i++) expect(authAttemptLimited("login", "1.2.3.4", 0)).toBe(false);
    expect(authAttemptLimited("login", "1.2.3.4", 0)).toBe(true);
  });
  it("counts per door and per IP", () => {
    for (let i = 0; i <= AUTH_ATTEMPTS_PER_WINDOW; i++) authAttemptLimited("login", "1.2.3.4", 0);
    expect(authAttemptLimited("totp", "1.2.3.4", 0)).toBe(false);
    expect(authAttemptLimited("login", "5.6.7.8", 0)).toBe(false);
  });
  it("opens again after the window", () => {
    for (let i = 0; i <= AUTH_ATTEMPTS_PER_WINDOW; i++) authAttemptLimited("login", "1.2.3.4", 0);
    expect(authAttemptLimited("login", "1.2.3.4", 10 * 60 * 1000 + 1)).toBe(false);
  });
});
