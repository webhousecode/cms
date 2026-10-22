/**
 * Security W41 C7 — a "*" token with no site list reached every site, whatever
 * its owner could reach.
 */
import { describe, it, expect } from "vitest";
import { tokenOwnerMayAct } from "../token-owner";

const users = [{ id: "owner", role: "admin" as const }, { id: "customer", role: "editor" as const }];

describe("tokenOwnerMayAct", () => {
  it("a customer's token acts only on sites the customer is on", () => {
    expect(tokenOwnerMayAct("customer", users, [{ userId: "customer" }])).toBe(true);
    expect(tokenOwnerMayAct("customer", users, [{ userId: "owner" }])).toBe(false);
    expect(tokenOwnerMayAct("customer", users, null)).toBe(false);
  });
  it("the instance admin's token acts anywhere", () => {
    expect(tokenOwnerMayAct("owner", users, [])).toBe(true);
  });
  it("a token minted by the internal service principal belongs to the instance", () => {
    expect(tokenOwnerMayAct("service-token", users, [])).toBe(true);
    expect(tokenOwnerMayAct("lens", users, [])).toBe(false);
  });
  it("a token whose owner was deleted acts nowhere", () => {
    expect(tokenOwnerMayAct("gone", users, [{ userId: "gone" }])).toBe(false);
  });
});
