import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMembershipRole, isSelfDescribingPrincipal } from "../require-role";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf-8");
const mint = read("app/api/lens-session/route.ts");
const proxy = read("proxy.ts");

describe("two Lens keys — look-only and look-and-save", () => {
  it("reads the files it thinks it reads", () => {
    expect(mint.length, "mint route empty — guard scanned nothing").toBeGreaterThan(1000);
    expect(proxy.length, "proxy empty — guard scanned nothing").toBeGreaterThan(1000);
  });

  // A write session must carry lens:true TOO. Changing `lens` to a string
  // instead would silently alter the meaning of every existing comparison.
  it("the write session is additive — it keeps lens:true", () => {
    expect(mint).toContain("lens: true");
    expect(mint).toContain('...(kind === "write" ? { lensWrite: true } : {})');
  });

  it("ships dark — no LENS_WRITE_SECRET means no write session can be minted", () => {
    const fn = mint.slice(mint.indexOf("function resolveLensKey("));
    expect(fn).toContain('if (write && bearer === write) return "write";');
    // The `write &&` is the whole ship-dark guarantee: unset → never matches.
    expect(fn).not.toMatch(/if \(bearer === write\)/);
  });

  // Same value for both keys would silently hand the look-only key write
  // access — exactly what the split exists to prevent.
  it("refuses to mint a write session when the two keys are identical", () => {
    const fn = mint.slice(mint.indexOf("function resolveLensKey("));
    expect(fn).toContain("write === read");
    expect(fn).toContain("console.error");
  });

  it("the proxy blocks writes for a look-only session and allows them with the write claim", () => {
    expect(proxy).toContain("payload.lens === true && payload.lensWrite !== true");
    const guard = proxy.slice(proxy.indexOf("const lensReadOnly ="));
    expect(guard).toContain('"POST", "PUT", "PATCH", "DELETE"');
    expect(guard).toContain("Lens session is read-only");
  });
});

describe("membership — Lens reaches admin pages, a stranger still does not", () => {
  const members = [{ userId: "u-real", role: "admin" }];

  it("Lens gets its role from its own token, with no team row", () => {
    expect(resolveMembershipRole({ sub: "lens", role: "admin" }, members)).toBe("admin");
    expect(isSelfDescribingPrincipal("lens")).toBe(true);
  });

  it("the dev and service tokens keep working", () => {
    expect(resolveMembershipRole({ sub: "dev-token", role: "admin" }, members)).toBe("admin");
    expect(resolveMembershipRole({ sub: "service-token", role: "admin" }, members)).toBe("admin");
  });

  // NEGATIVE CONTROL — without this, "Lens can reach Settings" would also pass
  // on a gate that had been switched off entirely.
  it("an ordinary user without a membership is still refused", () => {
    expect(resolveMembershipRole({ sub: "u-stranger", role: "admin" }, members)).toBeNull();
    expect(isSelfDescribingPrincipal("u-stranger")).toBe(false);
  });

  it("a real member gets the role their membership says, not the one their token claims", () => {
    expect(resolveMembershipRole({ sub: "u-real", role: "viewer" }, members)).toBe("admin");
  });

  it("no session at all is refused", () => {
    expect(resolveMembershipRole(null, members)).toBeNull();
    expect(resolveMembershipRole({}, members)).toBeNull();
  });
});

describe("every page that gates on membership uses the shared helper", () => {
  it.each([
    "app/admin/(workspace)/settings/page.tsx",
    "app/admin/(workspace)/deploy/docker/page.tsx",
    "app/admin/(workspace)/layout.tsx",
  ])("%s", (rel) => {
    const src = read(rel);
    expect(src.length, `${rel} empty — guard scanned nothing`).toBeGreaterThan(200);
    expect(src, `${rel} still hand-rolls the membership lookup`)
      .not.toMatch(/sub === "dev-token" \? \{ role: "admin" \}/);
    expect(src).toContain("resolveMembershipRole(");
  });
});
