// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { setLinkTarget } from "./index";

const link = (attrs: Record<string, string> = {}) => {
  const a = document.createElement("a");
  a.setAttribute("href", "https://www.trailmem.com");
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  return a;
};

describe("setLinkTarget", () => {
  // Christian, 2026-09-02: "Vores inline edit tool kan ikke lave en web adresse
  // der åbner en ny fane." Before this, `_blank` appeared nowhere in the package.
  it("writes target AND rel together", () => {
    const a = link();
    setLinkTarget(a, true);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener");
  });

  // The pair is one decision. A _blank link without rel="noopener" hands the
  // page it opens a live handle back to ours — half of this feature is not a
  // smaller feature, it is a security hole.
  it("never leaves target set without rel", () => {
    const a = link();
    setLinkTarget(a, true);
    expect(!!a.getAttribute("target")).toBe(!!a.getAttribute("rel"));
  });

  // The negative control: turning the box off must clear BOTH, not just the
  // one that is visible in the editor.
  it("clears both when the editor turns the new tab off", () => {
    const a = link({ target: "_blank", rel: "noopener" });
    setLinkTarget(a, false);
    expect(a.hasAttribute("target")).toBe(false);
    expect(a.hasAttribute("rel")).toBe(false);
  });

  it("leaves the address itself untouched in both directions", () => {
    const a = link();
    setLinkTarget(a, true);
    setLinkTarget(a, false);
    expect(a.getAttribute("href")).toBe("https://www.trailmem.com");
  });
});

describe("setLinkTarget — rel belongs to the author", () => {
  // Caught by the code-review pass on this very card. The first version wrote
  // rel="noopener" and cleared the attribute outright, so opening an existing
  // link just to fix a typo in its label deleted nofollow/sponsored/ugc —
  // an SEO and monetisation attribute, gone with no trace and no error.
  it("keeps every rel token the author put there when turning the tab ON", () => {
    const a = link({ rel: "nofollow sponsored" });
    setLinkTarget(a, true);
    const rel = (a.getAttribute("rel") ?? "").split(/\s+/);
    expect(rel).toContain("noopener");
    expect(rel).toContain("nofollow");
    expect(rel).toContain("sponsored");
  });

  it("keeps them when turning the tab OFF, and drops only our own token", () => {
    const a = link({ target: "_blank", rel: "noopener noreferrer nofollow" });
    setLinkTarget(a, false);
    expect(a.hasAttribute("target")).toBe(false);
    const rel = (a.getAttribute("rel") ?? "").split(/\s+/);
    expect(rel).not.toContain("noopener");
    expect(rel).toContain("noreferrer");
    expect(rel).toContain("nofollow");
  });

  // The negative control: with nothing of the author's to keep, the attribute
  // must go away entirely rather than linger as rel="".
  it("removes rel completely when nothing of the author's remains", () => {
    const a = link({ target: "_blank", rel: "noopener" });
    setLinkTarget(a, false);
    expect(a.hasAttribute("rel")).toBe(false);
  });

  it("does not accumulate noopener across repeated toggles", () => {
    const a = link();
    setLinkTarget(a, true);
    setLinkTarget(a, true);
    setLinkTarget(a, true);
    expect((a.getAttribute("rel") ?? "").split(/\s+/).filter((t) => t === "noopener")).toHaveLength(1);
  });
});
