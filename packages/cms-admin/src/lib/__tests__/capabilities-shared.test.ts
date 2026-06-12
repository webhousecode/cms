/**
 * F153 capabilities foundation tests.
 *
 * Pins the two load-bearing rules: (1) an unset capability resolves ON
 * (backward compatibility — existing tenants behave exactly as today), and
 * (2) a capability whose required parent is off is forced off (cascade).
 */
import { describe, it, expect } from "vitest";
import {
  CAPABILITIES,
  CAPABILITY_KEYS,
  CAPABILITY_PROFILES,
  resolveCapabilities,
  hasCapability,
  capabilityProfile,
} from "../capabilities-shared";

describe("resolveCapabilities — default ON (backward compat)", () => {
  it("undefined / empty → everything ON (the 'full' profile)", () => {
    const r1 = resolveCapabilities(undefined);
    const r2 = resolveCapabilities({});
    expect(CAPABILITY_KEYS.every((k) => r1[k] === true)).toBe(true);
    expect(r2).toEqual(CAPABILITY_PROFILES.full);
  });

  it("only the explicitly-disabled keys go off; the rest stay on", () => {
    const r = resolveCapabilities({ ai: false });
    expect(r.ai).toBe(false);
    expect(r.seo).toBe(true);
    expect(r.forms).toBe(true);
  });
});

describe("requires-cascade", () => {
  it("turning ai off forces agents + chat off (they require ai)", () => {
    const r = resolveCapabilities({ ai: false });
    expect(r.ai).toBe(false);
    expect(r.agents).toBe(false); // cascaded
    expect(r.chat).toBe(false);   // cascaded
  });

  it("agents/chat can still be individually off while ai is on", () => {
    const r = resolveCapabilities({ agents: false });
    expect(r.ai).toBe(true);
    expect(r.agents).toBe(false);
    expect(r.chat).toBe(true);
  });

  it("every catalogued `requires` parent is itself a known capability", () => {
    for (const k of CAPABILITY_KEYS) {
      for (const req of (CAPABILITIES[k] as { requires?: string[] }).requires ?? []) {
        expect(CAPABILITY_KEYS).toContain(req);
      }
    }
  });
});

describe("profiles", () => {
  it("minimal disables all toggleable capabilities", () => {
    expect(CAPABILITY_KEYS.every((k) => CAPABILITY_PROFILES.minimal[k] === false)).toBe(true);
  });
  it("standard enables seo + forms + scheduling only", () => {
    const s = CAPABILITY_PROFILES.standard;
    expect(s.seo && s.forms && s.scheduling).toBe(true);
    expect(s.ai || s.agents || s.maps || s.interactives).toBe(false);
  });
  it("resolving a stored profile round-trips to that profile name", () => {
    expect(capabilityProfile(resolveCapabilities(CAPABILITY_PROFILES.minimal))).toBe("minimal");
    expect(capabilityProfile(resolveCapabilities(CAPABILITY_PROFILES.full))).toBe("full");
  });
  it("a partial custom set reports as 'custom'", () => {
    expect(capabilityProfile(resolveCapabilities({ maps: false }))).toBe("custom");
  });
});

describe("hasCapability", () => {
  it("reads the resolved flag", () => {
    const r = resolveCapabilities({ ai: false });
    expect(hasCapability(r, "ai")).toBe(false);
    expect(hasCapability(r, "seo")).toBe(true);
  });
  it("unknown keys fail open (never block on a typo)", () => {
    const r = resolveCapabilities({});
    expect(hasCapability(r, "does-not-exist")).toBe(true);
  });
});
