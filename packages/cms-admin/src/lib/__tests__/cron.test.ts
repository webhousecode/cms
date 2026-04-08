/**
 * Tests for the tiny cron evaluator used by the agent scheduler.
 */
import { describe, it, expect } from "vitest";
import { parseCron, cronMatches, cronMatchesWithinWindow } from "../cron";

// Helper: build a date with explicit local-time fields so test cases
// don't depend on the runner's timezone.
function at(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe("parseCron", () => {
  it("rejects invalid expressions", () => {
    expect(parseCron("")).toBeNull();
    expect(parseCron("invalid")).toBeNull();
    expect(parseCron("* * * *")).toBeNull(); // 4 fields
    expect(parseCron("* * * * * *")).toBeNull(); // 6 fields
    expect(parseCron("99 * * * *")).toBeNull(); // minute out of range
    expect(parseCron("* 25 * * *")).toBeNull(); // hour out of range
  });

  it("parses 5-star (every minute)", () => {
    const p = parseCron("* * * * *");
    expect(p).not.toBeNull();
    expect(p!.minute.size).toBe(60);
    expect(p!.hour.size).toBe(24);
  });

  it("parses literal values", () => {
    const p = parseCron("5 9 * * *");
    expect(p!.minute.has(5)).toBe(true);
    expect(p!.minute.has(6)).toBe(false);
    expect(p!.hour.has(9)).toBe(true);
  });

  it("parses lists", () => {
    const p = parseCron("0,15,30,45 * * * *");
    expect([...p!.minute].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
  });

  it("parses ranges", () => {
    const p = parseCron("0 9-17 * * 1-5");
    expect([...p!.hour].sort((a, b) => a - b)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect([...p!.dayOfWeek].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("parses step syntax with *", () => {
    const p = parseCron("*/15 * * * *");
    expect([...p!.minute].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
  });

  it("parses step syntax with a range", () => {
    const p = parseCron("0-30/10 * * * *");
    expect([...p!.minute].sort((a, b) => a - b)).toEqual([0, 10, 20, 30]);
  });
});

describe("cronMatches", () => {
  it("matches every minute when all fields are *", () => {
    expect(cronMatches("* * * * *", at(2026, 4, 8, 13, 37))).toBe(true);
  });

  it("matches a literal hour:minute", () => {
    expect(cronMatches("0 9 * * *", at(2026, 4, 8, 9, 0))).toBe(true);
    expect(cronMatches("0 9 * * *", at(2026, 4, 8, 9, 1))).toBe(false);
    expect(cronMatches("0 9 * * *", at(2026, 4, 8, 10, 0))).toBe(false);
  });

  it("matches every 15 minutes", () => {
    const cron = "*/15 * * * *";
    expect(cronMatches(cron, at(2026, 4, 8, 12, 0))).toBe(true);
    expect(cronMatches(cron, at(2026, 4, 8, 12, 15))).toBe(true);
    expect(cronMatches(cron, at(2026, 4, 8, 12, 14))).toBe(false);
  });

  it("matches weekday-only schedules", () => {
    const cron = "0 9 * * 1-5"; // 9am Mon-Fri
    expect(cronMatches(cron, at(2026, 4, 6, 9, 0))).toBe(true);  // Monday
    expect(cronMatches(cron, at(2026, 4, 10, 9, 0))).toBe(true); // Friday
    expect(cronMatches(cron, at(2026, 4, 11, 9, 0))).toBe(false); // Saturday
    expect(cronMatches(cron, at(2026, 4, 12, 9, 0))).toBe(false); // Sunday
  });

  it("matches a specific day of the month", () => {
    const cron = "0 8 1 * *"; // 1st of each month at 08:00
    expect(cronMatches(cron, at(2026, 4, 1, 8, 0))).toBe(true);
    expect(cronMatches(cron, at(2026, 5, 1, 8, 0))).toBe(true);
    expect(cronMatches(cron, at(2026, 4, 2, 8, 0))).toBe(false);
  });

  it("uses OR semantics when both DOM and DOW are restricted", () => {
    // Vixie cron: this means "1st of the month OR Sunday at 9am"
    const cron = "0 9 1 * 0";
    expect(cronMatches(cron, at(2026, 4, 1, 9, 0))).toBe(true); // 1st (Wednesday)
    expect(cronMatches(cron, at(2026, 4, 5, 9, 0))).toBe(true); // Sunday
    expect(cronMatches(cron, at(2026, 4, 6, 9, 0))).toBe(false); // Monday
  });

  it("returns false on invalid expression", () => {
    expect(cronMatches("nonsense", at(2026, 4, 8, 9, 0))).toBe(false);
  });
});

describe("cronMatchesWithinWindow", () => {
  it("matches a cron that would have fired earlier in the window", () => {
    // Cron fires at minute 0; tick window starts at 09:00, length 5
    expect(cronMatchesWithinWindow("0 9 * * *", at(2026, 4, 8, 9, 0), 5)).toBe(true);
    // Cron fires at 09:03; tick covers 09:00-09:04
    expect(cronMatchesWithinWindow("3 9 * * *", at(2026, 4, 8, 9, 0), 5)).toBe(true);
    // Cron fires at 09:10; tick covers 09:00-09:04 — out of window
    expect(cronMatchesWithinWindow("10 9 * * *", at(2026, 4, 8, 9, 0), 5)).toBe(false);
  });

  it("default window is 5 minutes", () => {
    expect(cronMatchesWithinWindow("4 9 * * *", at(2026, 4, 8, 9, 0))).toBe(true);
    expect(cronMatchesWithinWindow("5 9 * * *", at(2026, 4, 8, 9, 0))).toBe(false);
  });
});
