// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveExistingRef, renderCurrentRefLine } from "./index";

const PAGES = [
  { collection: "sider", slug: "om-sanne", title: "Om Sanne", path: "/da/om-sanne", label: "Side" },
  { collection: "shop", slug: "5:element", title: "5 element", path: "/da/shop/5-element", label: "Shop" },
] as Parameters<typeof renderCurrentRefLine>[2];

const box = () => document.createElement("div");

describe("resolveExistingRef", () => {
  it("finds the page a reference points at", () => {
    expect(resolveExistingRef("sider:om-sanne", PAGES)?.title).toBe("Om Sanne");
  });

  it("returns null for a reference no page matches", () => {
    expect(resolveExistingRef("sider:findes-ikke", PAGES)).toBeNull();
  });

  // Only the FIRST segment is the collection — a slug may contain a colon.
  it("treats everything after the first colon as the slug", () => {
    expect(resolveExistingRef("shop:5:element", PAGES)?.title).toBe("5 element");
  });

  it("returns null for empty, malformed or missing references", () => {
    expect(resolveExistingRef(null, PAGES)).toBeNull();
    expect(resolveExistingRef("", PAGES)).toBeNull();
    expect(resolveExistingRef("sider", PAGES)).toBeNull();
    expect(resolveExistingRef(":om-sanne", PAGES)).toBeNull();
  });
});

describe("renderCurrentRefLine", () => {
  it("names the page the link currently points at", () => {
    const el = box();
    renderCurrentRefLine(el, "sider:om-sanne", PAGES);
    expect(el.style.display).toBe("block");
    expect(el.textContent).toBe("Linker til: Om Sanne /da/om-sanne");
  });

  // A new link, or a free URL, has no page reference — the line must stay away
  // rather than claim something.
  it("stays hidden when there is no page reference", () => {
    const el = box();
    renderCurrentRefLine(el, null, PAGES);
    expect(el.style.display).toBe("none");
    expect(el.textContent).toBe("");
  });

  // A reference to a deleted (or no-longer-linkable) page has no row to
  // highlight. Showing the raw reference beats saying nothing at all.
  it("shows the raw reference when the page is not in the list", () => {
    const el = box();
    renderCurrentRefLine(el, "sider:slettet-side", PAGES);
    expect(el.style.display).toBe("block");
    expect(el.textContent).toBe("Linker til: sider:slettet-side");
  });

  it("escapes a title so a page name cannot inject markup", () => {
    const el = box();
    renderCurrentRefLine(el, "x:y", [
      { collection: "x", slug: "y", title: "<img src=x onerror=alert(1)>", path: "/x", label: "S" },
    ] as typeof PAGES);
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

// The pre-select used to live INSIDE the fetch callback, so it ran the first
// time the dialog opened and never again: every later open in the same
// page-load hit the cached-list early return and showed no selection at all.
// Driving the real dialog would need the whole editing session, so this pins
// the structure instead — stated plainly, it is a source guard, not a run.
describe("renderLinkList — both paths pre-select", () => {
  it("pre-selects on the cached path, not only after a fetch", () => {
    const src = readFileSync(join(process.cwd(), "src/index.ts"), "utf-8");
    const body = src.slice(src.indexOf("function renderLinkList("));
    const cached = body.slice(body.indexOf("if (linkPages) {"), body.indexOf("fetchLinkablePages()"));
    expect(cached).toContain("preselect(linkPages)");
    expect(cached.indexOf("preselect(linkPages)")).toBeLessThan(cached.indexOf("return;"));
  });
});
