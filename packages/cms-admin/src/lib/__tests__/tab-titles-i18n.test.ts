import { describe, it, expect } from "vitest";
import { displayTabTitle } from "../tabs-context";
import { getT } from "../../i18n/locale";

/**
 * F211.2 — a built-in route's tab name follows the admin language at render
 * time. Before, the title was frozen into localStorage when the tab opened, so
 * cms.fysio.work showed "Settings" in an otherwise Danish admin.
 */
const da = getT("da");
const en = getT("en");

describe("displayTabTitle", () => {
  it("names a built-in route in the reader's language, whatever was stored", () => {
    const tab = { id: "1", path: "/admin/settings", title: "Settings" };
    expect(displayTabTitle(tab, da)).toBe("Indstillinger");
    expect(displayTabTitle(tab, en)).toBe("Settings");
  });

  it("names a settings sub-tab, including the Features tab", () => {
    const tab = { id: "1", path: "/admin/settings?tab=capabilities", title: "Settings" };
    expect(displayTabTitle(tab, da)).toBe("Indstillinger: Funktioner");
    expect(displayTabTitle(tab, en)).toBe("Settings: Features");
  });

  it("CONTROL: a document's own name is shown exactly as stored", () => {
    const tab = { id: "2", path: "/admin/content/posts/hello", title: "Hello world" };
    expect(displayTabTitle(tab, da)).toBe("Hello world");
  });

  it("every built-in route resolves to real text in both languages, never a key", () => {
    for (const path of ["/admin", "/admin/media", "/admin/trash", "/admin/forms/builder", "/admin/deploy/docker"]) {
      const tab = { id: "x", path, title: "" };
      for (const t of [da, en]) expect(displayTabTitle(tab, t)).not.toMatch(/^shell\./);
    }
  });
});
