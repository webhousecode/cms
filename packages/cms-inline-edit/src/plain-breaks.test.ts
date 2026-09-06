// @vitest-environment happy-dom
/**
 * A plain field must be able to hold a line break — and must never LOSE one.
 *
 * Christian, 6 Sep 2026, on a `prose` block on broberg.ai: "Denne paragraf kan
 * jeg ikke indsætte soft break eller hard break i." Measured: the field's text
 * is a plain string rendered into a `.lead` paragraph that already carries
 * `white-space: pre-line`, so the PAGE could always show a break. Two things
 * stopped it: Enter ended the edit (the only key handling there was), and the
 * value was read with `textContent`, which drops <br> silently.
 *
 * The second one is the dangerous half. It does not merely block a new break —
 * it deletes an existing one on the next save of a field nobody meant to change
 * that way.
 */
import { describe, it, expect } from "vitest";
import { plainTextWithBreaks } from "./index";

const el = (html: string): HTMLElement => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d;
};

describe("plainTextWithBreaks", () => {
  it("reads a <br> back as a newline", () => {
    expect(plainTextWithBreaks(el("Linje A<br>Linje B"))).toBe("Linje A\nLinje B");
  });

  it("keeps a BLANK line — two breaks are two breaks, not one", () => {
    // The paragraph gap is the whole point: one \n is a new line, two is air.
    expect(plainTextWithBreaks(el("Afsnit A<br><br>Afsnit B"))).toBe("Afsnit A\n\nAfsnit B");
  });

  it("reads a browser's <div> split as a break too", () => {
    // Chrome wraps a new line in a <div> when the editing host is a block, so
    // the same keystroke produces different markup in different browsers. Both
    // must read back identically or the value changes by browser.
    expect(plainTextWithBreaks(el("Linje A<div>Linje B</div>"))).toBe("Linje A\nLinje B");
  });

  it("leaves a value with no breaks exactly as it was", () => {
    // The negative control. If this ever changes, every existing field on every
    // site is being rewritten by the act of opening it.
    const s = "Kundeportalen giver dig et direkte vindue ind i dit eget projekt.";
    expect(plainTextWithBreaks(el(s))).toBe(s);
  });

  it("keeps inline formatting's TEXT and adds no break for it", () => {
    expect(plainTextWithBreaks(el("Noget <b>fedt</b> mere"))).toBe("Noget fedt mere");
  });

  it("does not invent a leading break when the value starts with a block", () => {
    expect(plainTextWithBreaks(el("<div>Kun én linje</div>"))).toBe("Kun én linje");
  });

  it("survives the round trip a save actually performs", () => {
    // What the field holds after Shift+Enter, read back, trimmed, and stored.
    const stored = plainTextWithBreaks(el("Første afsnit.<br><br>Andet afsnit.")).trim();
    expect(stored).toBe("Første afsnit.\n\nAndet afsnit.");
    // And re-rendered as a text node (`{b.text}` in the site's prose block),
    // the newlines are still there for `white-space: pre-line` to show.
    const p = document.createElement("p");
    p.textContent = stored;
    expect(plainTextWithBreaks(p)).toBe(stored);
  });
});
