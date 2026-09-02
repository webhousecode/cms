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
