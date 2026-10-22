// @vitest-environment happy-dom
/**
 * F157.20 — inline editing without the CMS.
 *
 * cardmem's mockup view runs in a sandboxed iframe with no CMS behind it and
 * saves by postMessage. So the package must edit a field and hand the value to
 * a caller-supplied save — with NO token, no CMS address and no request to a
 * CMS. The fetch spy is the load-bearing assertion: a version that still
 * reached for the CMS would fail inside the sandbox and look fine here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Mod = typeof import("./index");

async function freshModule(): Promise<Mod> {
  vi.resetModules();
  return import("./index");
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function edit(el: HTMLElement, text: string): void {
  el.click();
  el.textContent = text;
  el.dispatchEvent(new FocusEvent("blur"));
}

beforeEach(() => {
  document.body.innerHTML = "";
  // A fresh, empty store per test — this happy-dom build ships a localStorage
  // without the Storage methods, and CMS mode reads the token from it.
  const mem = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});

describe("adapter mode", () => {
  it("edits and saves through the adapter with no token, no CMS and no fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    document.body.innerHTML = `<h1 data-cms-field="title">Gammel</h1>`;
    const save = vi.fn().mockResolvedValue(undefined);
    const { initInlineEdit } = await freshModule();

    await initInlineEdit({ adapter: { save } });
    const el = document.querySelector("h1") as HTMLElement;
    el.click();
    expect(el.getAttribute("contenteditable")).toBe("true");
    el.innerHTML = "Ny<br>linje";
    el.dispatchEvent(new FocusEvent("blur"));
    await tick();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0]).toBe(el);
    expect(save.mock.calls[0]![1]).toBe("Ny\nlinje");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not save when nothing changed", async () => {
    document.body.innerHTML = `<p data-cms-field="x">Samme</p>`;
    const save = vi.fn().mockResolvedValue(undefined);
    const { initInlineEdit } = await freshModule();
    await initInlineEdit({ adapter: { save } });
    edit(document.querySelector("p") as HTMLElement, "Samme");
    await tick();
    expect(save).not.toHaveBeenCalled();
  });

  it("shows saving → saved when the adapter resolves", async () => {
    document.body.innerHTML = `<p data-cms-field="x">A</p>`;
    let resolve!: () => void;
    const save = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const { initInlineEdit } = await freshModule();
    await initInlineEdit({ adapter: { save } });
    edit(document.querySelector("p") as HTMLElement, "B");
    const pill = () => document.querySelector("[data-cms-inline-edit-pill]")?.textContent;
    expect(pill()).toBe("Gemmer…");
    resolve();
    await tick();
    expect(pill()).toBe("Gemt ✓");
  });

  it("shows the error pill when the adapter rejects", async () => {
    document.body.innerHTML = `<p data-cms-field="x">A</p>`;
    const save = vi.fn().mockRejectedValue(new Error("nope"));
    const { initInlineEdit } = await freshModule();
    await initInlineEdit({ adapter: { save } });
    edit(document.querySelector("p") as HTMLElement, "B");
    await tick();
    expect(document.querySelector("[data-cms-inline-edit-pill]")?.textContent).toBe("Fejl — prøv igen");
  });

  it("binds only to the given selector", async () => {
    document.body.innerHTML = `<p data-mockup-text id="a">A</p><p data-cms-field="x" id="b">B</p>`;
    const save = vi.fn().mockResolvedValue(undefined);
    const { initInlineEdit } = await freshModule();
    await initInlineEdit({ adapter: { save }, selector: "[data-mockup-text]" });
    (document.getElementById("a") as HTMLElement).click();
    (document.getElementById("b") as HTMLElement).click();
    expect(document.getElementById("a")!.getAttribute("contenteditable")).toBe("true");
    expect(document.getElementById("b")!.getAttribute("contenteditable")).toBeNull();
  });

  it("treats a rich-marked field as plain text — no toolbar", async () => {
    document.body.innerHTML = `<div data-cms-field="body" data-cms-richtext="true">Tekst</div>`;
    const save = vi.fn().mockResolvedValue(undefined);
    const { initInlineEdit } = await freshModule();
    await initInlineEdit({ adapter: { save } });
    const el = document.querySelector("div") as HTMLElement;
    edit(el, "Ny tekst");
    await tick();
    expect(document.querySelector("[data-cms-inline-edit-toolbar]")).toBeNull();
    expect(save).toHaveBeenCalledWith(el, "Ny tekst");
  });

  it("shows no login pill or badge — the host owns its own UI", async () => {
    document.body.innerHTML = `<p data-cms-field="x">A</p>`;
    const { initInlineEdit } = await freshModule();
    await initInlineEdit({ adapter: { save: vi.fn().mockResolvedValue(undefined) } });
    expect(document.querySelector("[data-cms-inline-edit-idle]")).toBeNull();
    expect(document.querySelector("[data-cms-inline-edit-badge]")).toBeNull();
  });
});

describe("CMS mode is unchanged", () => {
  it("without an adapter and without a token, nothing becomes editable", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ enabled: true })));
    document.body.innerHTML = `<p data-cms-field="x">A</p>`;
    const { initInlineEdit } = await freshModule();
    await initInlineEdit({ cmsBaseUrl: "https://cms.example", siteId: "s" });
    (document.querySelector("p") as HTMLElement).click();
    expect(document.querySelector("p")!.getAttribute("contenteditable")).toBeNull();
    fetchSpy.mockRestore();
  });
});
