// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { positionPopover } from "./index";

const MARGIN = 8;

/** happy-dom has no layout engine, so the popover's height is injected. */
function popover(height: number): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  el.getBoundingClientRect = () => ({ height, width: 392, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return el;
}

const viewport = (w: number, h: number) => {
  (window as unknown as { innerWidth: number }).innerWidth = w;
  (window as unknown as { innerHeight: number }).innerHeight = h;
};

const px = (v: string) => parseFloat(v);

describe("positionPopover", () => {
  beforeEach(() => { viewport(1440, 900); });

  // Reported from production 2026-08-26: on a short laptop screen the link
  // dialog opened downwards past the bottom edge, putting Gem/Annullér out of
  // reach with no way to scroll to them.
  it("flips above the selection when the dialog would overflow the bottom", () => {
    const el = popover(420);
    positionPopover(el, { top: 690, bottom: 700, left: 300 }, 8, 392);
    const top = px(el.style.top);
    expect(top).toBeGreaterThanOrEqual(MARGIN);
    expect(top + 420).toBeLessThanOrEqual(900 - MARGIN);
  });

  it("still opens below the selection when there is room", () => {
    const el = popover(420);
    positionPopover(el, { top: 90, bottom: 100, left: 300 }, 8, 392);
    expect(px(el.style.top)).toBe(108);
  });

  it("never places the top above the viewport, however short the screen", () => {
    viewport(1440, 400);
    const el = popover(420);
    positionPopover(el, { top: 300, bottom: 320, left: 300 }, 8, 392);
    expect(px(el.style.top)).toBeGreaterThanOrEqual(MARGIN);
  });

  it("caps its height and turns on scrolling so the footer stays reachable", () => {
    viewport(1440, 400);
    const el = popover(420);
    positionPopover(el, { top: 300, bottom: 320, left: 300 }, 8, 392);
    expect(px(el.style.maxHeight)).toBe(400 - MARGIN * 2);
    expect(el.style.overflowY).toBe("auto");
  });

  // The old clamp ran min-after-max, so `innerWidth - 400` won on any viewport
  // narrower than the dialog and pushed it off the LEFT edge instead.
  it("never places the left edge off-screen on a narrow viewport", () => {
    viewport(360, 900);
    const el = popover(300);
    positionPopover(el, { top: 90, bottom: 100, left: 120 }, 8, 392);
    expect(px(el.style.left)).toBeGreaterThanOrEqual(MARGIN);
  });

  it("keeps the popover left-aligned to the anchor when it fits", () => {
    const el = popover(300);
    positionPopover(el, { top: 90, bottom: 100, left: 300 }, 8, 392);
    expect(px(el.style.left)).toBe(300);
  });
});
