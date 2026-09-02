// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "./index";

const bulletLines = (md: string) => md.split("\n").filter((l) => /^- /.test(l));

describe("htmlToMarkdown — list integrity", () => {
  // The sanneandersen incident (2026-08-16): a 13-item CV list came back from
  // the live site as 1 loose paragraph + 12 bullets, on EVERY save, silently
  // corrupting a public page. The editor had orphaned the first <li> out of its
  // <ul>; serializeBlock had no "li" case, so the orphan fell through to the
  // inline default and lost its "- " marker.
  it("keeps every item when the first <li> has been orphaned out of its list", () => {
    const html =
      "<p>Som zoneterapeut …</p>" +
      "<h2>Min baggrund</h2>" +
      "<li>RAB zoneterapeut og behandler med egen klinik siden 2000</li>" +
      "<ul><li>Indehaver og skoleleder</li><li>Udbyder af RAB-kurser</li></ul>";

    const md = htmlToMarkdown(html);

    expect(bulletLines(md)).toHaveLength(3);
    expect(md).toContain("- RAB zoneterapeut og behandler med egen klinik siden 2000");
    // The orphan must rejoin the list, not become its own loose block — a blank
    // line between item 1 and item 2 is what produced the broken public page.
    expect(md).not.toMatch(/- RAB zoneterapeut[^\n]*\n\n/);
  });

  it("puts the orphan back in FIRST position, preserving author order", () => {
    const html = "<li>one</li><ul><li>two</li><li>three</li></ul>";
    expect(bulletLines(htmlToMarkdown(html))).toEqual(["- one", "- two", "- three"]);
  });

  it("re-attaches an orphan that follows its list", () => {
    const html = "<ul><li>one</li><li>two</li></ul><li>three</li>";
    expect(bulletLines(htmlToMarkdown(html))).toEqual(["- one", "- two", "- three"]);
  });

  it("keeps an orphan numbered when its list is ordered", () => {
    const html = "<li>one</li><ol><li>two</li></ol>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("1. one");
    expect(md).toContain("2. two");
  });

  it("wraps a lone orphan with no adjacent list", () => {
    expect(bulletLines(htmlToMarkdown("<p>intro</p><li>solo</li>"))).toEqual(["- solo"]);
  });

  // Guard: the fix must not disturb the normal, uncorrupted path.
  it("leaves a well-formed list untouched", () => {
    const html = "<h2>Titel</h2><ul><li>a</li><li>b</li><li>c</li></ul>";
    const md = htmlToMarkdown(html);
    expect(bulletLines(md)).toEqual(["- a", "- b", "- c"]);
    expect(md).toContain("## Titel");
  });

  it("leaves ordered lists and paragraphs untouched", () => {
    const md = htmlToMarkdown("<p>intro</p><ol><li>a</li><li>b</li></ol>");
    expect(md).toContain("intro");
    expect(md).toContain("1. a");
    expect(md).toContain("2. b");
  });
});

// Same class as the orphaned <li>, one tag deeper (reported by the sanne
// session against 0.4.21). serializeBlock's default arm calls serializeInline
// on the ELEMENT — but serializeInline iterates a node's CHILDREN and switches
// on their tags, so the element's OWN formatting is never applied. A <strong>
// sitting at the top level of an edited field therefore came back as bare text,
// and mixed inline content was torn into separate blocks by the "\n\n" join.
describe("htmlToMarkdown — top-level inline content keeps its formatting", () => {
  it("keeps bold when <strong> is the whole field", () => {
    expect(htmlToMarkdown("<strong>Alt fra Blad</strong>")).toContain("**Alt fra Blad**");
  });

  it("keeps text and bold on ONE line instead of splitting into blocks", () => {
    const md = htmlToMarkdown("Noget <strong>fedt</strong> mere").trim();
    expect(md).toBe("Noget **fedt** mere");
    expect(md).not.toContain("\n");
  });

  it("keeps italic, code and links at the top level", () => {
    expect(htmlToMarkdown("<em>kursiv</em>")).toContain("*kursiv*");
    expect(htmlToMarkdown("<code>kode</code>")).toContain("`kode`");
    expect(htmlToMarkdown('<a href="/x">y</a>')).toContain("[y](/x)");
  });

  it("does not silently delete a top-level image", () => {
    expect(htmlToMarkdown('<img src="/u/a.jpg" alt="Sanne">')).toContain("![Sanne](/u/a.jpg)");
  });

  it("still separates real blocks with a blank line", () => {
    const md = htmlToMarkdown("<p>en</p><p>to</p>");
    expect(md).toContain("en\n\nto");
  });

  it("keeps an inline run next to a real block as its own paragraph", () => {
    const md = htmlToMarkdown("Intro <strong>her</strong><ul><li>a</li></ul>");
    expect(md).toContain("Intro **her**");
    expect(md).toContain("- a");
    expect(md).not.toContain("Intro\n\n**her**");
  });
});

// F164.1 — a link to a PAGE stores a reference (data-cms-ref) alongside a real
// working href, so the site can re-resolve it when the page moves or is
// renamed. Markdown link syntax has no slot for that metadata, so such links
// serialise as inline HTML (which `marked` passes through). Without this the
// reference would be stripped on the editor's FIRST save and the whole
// live-reference feature would be silently dead.
describe("htmlToMarkdown — page references survive a save", () => {
  const REF = '<a href="/da/om-sanne" data-cms-ref="sider-content:om-sanne" data-cms-ref-label="auto">Om Sanne</a>';

  it("keeps href AND the reference attributes on a page link", () => {
    const md = htmlToMarkdown(`<p>Se ${REF} for mere.</p>`);
    expect(md).toContain('href="/da/om-sanne"');
    expect(md).toContain('data-cms-ref="sider-content:om-sanne"');
    expect(md).toContain('data-cms-ref-label="auto"');
    expect(md).toContain("Om Sanne");
    // NOT collapsed to a plain markdown link — that is what loses the reference.
    expect(md).not.toContain("[Om Sanne](/da/om-sanne)");
  });

  it("omits the auto-label marker when the editor wrote their own text", () => {
    const md = htmlToMarkdown(
      '<p><a href="/da/om-sanne" data-cms-ref="sider-content:om-sanne">min historie</a></p>',
    );
    expect(md).toContain('data-cms-ref="sider-content:om-sanne"');
    expect(md).not.toContain("data-cms-ref-label");
    expect(md).toContain("min historie");
  });

  it("leaves a plain link as ordinary markdown — unchanged behaviour", () => {
    const md = htmlToMarkdown('<p><a href="https://example.com">eksternt</a></p>');
    expect(md).toContain("[eksternt](https://example.com)");
    expect(md).not.toContain("<a ");
  });

  it("is stable across a second save — the reference does not degrade", () => {
    const once = htmlToMarkdown(`<p>Se ${REF} for mere.</p>`);
    const twice = htmlToMarkdown(`<p>${once.trim()}</p>`);
    expect(twice.trim()).toBe(once.trim());
  });

  it("keeps inline formatting inside a page link", () => {
    const md = htmlToMarkdown(
      '<p><a href="/x" data-cms-ref="pages:x"><strong>fed</strong> tekst</a></p>',
    );
    expect(md).toContain("**fed** tekst");
    expect(md).toContain('data-cms-ref="pages:x"');
  });

  it("escapes quotes in attribute values so the anchor cannot break out", () => {
    const md = htmlToMarkdown('<p><a href=\'/x?a="b\' data-cms-ref="pages:x">t</a></p>');
    expect(md).not.toContain('href="/x?a="b"');
    expect(md).toContain("&quot;");
  });
});

describe("htmlToMarkdown — an inline field is not a document", () => {
  // Measured on webhouse.dk 2026-08-24, the day every heading on that site
  // became a rich field: saving "Drift & Infrastruktur" untouched stored
  // "Drift & Infrastruktur\n". The ampersand survived; a newline appeared out
  // of nowhere. It is invisible on the page, and it is right there in the CMS
  // editor — a value the editor never typed, added by the act of editing.
  it("does not append a newline to a single-line value", () => {
    expect(htmlToMarkdown("Drift &amp; Infrastruktur")).toBe("Drift & Infrastruktur");
  });

  it("keeps the ampersand a plain ampersand", () => {
    expect(htmlToMarkdown("Drift &amp; Infrastruktur")).not.toContain("&amp;");
  });

  it("still ends a multi-block document with a newline", () => {
    expect(htmlToMarkdown("<p>one</p><p>two</p>")).toBe("one\n\ntwo\n");
  });
});

describe("htmlToMarkdown — a link keeps what makes it that link", () => {
  // F157.7, measured on broberg.ai 2026-08-25: a byline contained a
  // hand-written link. An edit to a DIFFERENT sentence in the same field sent
  // it back as a bare Markdown link, and target + rel were gone. The link still
  // worked, so nothing looked broken — it just stopped opening in a new tab and
  // lost rel="noopener noreferrer", which is a security attribute.
  // F164.6: the same guarantee, but for the pair the DIALOG now writes. The
  // hand-written case above proved the serializer copes with attributes that
  // were already there; this proves the exact attributes our own new-tab
  // control produces survive a save. Strict equality on the extracted values —
  // a "contains" check passes on a truncated or doubled attribute.
  it("keeps the exact target/rel pair the new-tab control writes", () => {
    const a = document.createElement("a");
    a.setAttribute("href", "https://www.trailmem.com");
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
    a.textContent = "Trail";

    const md = htmlToMarkdown(`se <a href="${a.getAttribute("href")}" target="${a.getAttribute("target")}" rel="${a.getAttribute("rel")}">${a.textContent}</a> her`);

    expect(md.match(/target="([^"]*)"/)?.[1]).toBe("_blank");
    expect(md.match(/rel="([^"]*)"/)?.[1]).toBe("noopener");
    expect(md.match(/href="([^"]*)"/)?.[1]).toBe("https://www.trailmem.com");
  });

  // The negative control for the pair: a link WITHOUT a new tab must not
  // acquire target/rel from anywhere, and must stay ordinary Markdown.
  it("adds no target or rel to a link the editor left in this tab", () => {
    const md = htmlToMarkdown('se <a href="https://www.trailmem.com">Trail</a> her');
    expect(md).not.toContain("target=");
    expect(md).not.toContain("rel=");
    expect(md).toContain("[Trail](https://www.trailmem.com)");
  });

  it("keeps target and rel on a hand-written link", () => {
    const html =
      'af <a href="https://example.com/" target="_blank" rel="noopener noreferrer">@nogen</a> på Instagram';
    const md = htmlToMarkdown(html);
    expect(md).toContain('target="_blank"');
    expect(md).toContain('rel="noopener noreferrer"');
    expect(md).toContain('href="https://example.com/"');
  });

  // The other half: an ordinary link must NOT turn into raw HTML, or every
  // link the editor's own button inserts would become markup in the stored
  // value and an author would stop recognising their own text.
  it("still writes a plain link as Markdown", () => {
    expect(htmlToMarkdown('se <a href="/kontakt">kontakt</a>')).toBe("se [kontakt](/kontakt)");
  });

  it("keeps an F164 page reference", () => {
    const html = '<a href="/da/om-sanne" data-cms-ref="sider:om-sanne" data-cms-ref-label="auto">Om os</a>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('data-cms-ref="sider:om-sanne"');
    expect(md).toContain('data-cms-ref-label="auto"');
  });

  it("refuses to write an event handler back out", () => {
    const md = htmlToMarkdown('<a href="/x" onclick="alert(1)" title="ok">t</a>');
    expect(md).not.toContain("onclick");
    expect(md).toContain('title="ok"');
  });

  it("refuses an attribute carrying a javascript: URL", () => {
    const md = htmlToMarkdown('<a href="/x" data-src="javascript:alert(1)" title="ok">t</a>');
    expect(md).not.toContain("javascript:");
    expect(md).toContain('title="ok"');
  });
});

describe("htmlToMarkdown — whitespace at the edge of an inline mark", () => {
  // sanneandersen, 2026-08-26 (reported by the sanne session, 13 occurrences
  // across two live pages): an editor put the caret at the end of a bold
  // sub-heading and pressed Shift+Enter. The browser inserts the <br> INSIDE
  // the still-active <strong>, and serializeInlineNode wrote the mark as
  // `**${inner.trim()}**` — so .trim() deleted the line break outright and the
  // two sentences came back glued together with no separator at all.
  //
  // The trim itself is required: `** bold **` is not valid Markdown emphasis.
  // The bug is that the whitespace was DROPPED instead of MOVED outside the
  // delimiters.
  it("keeps a hard break that sits inside <strong> (the live corruption)", () => {
    const md = htmlToMarkdown(
      "<p><strong>Mulig økonomisk støtte<br></strong>I visse tilfælde.</p>",
    );
    expect(md).toBe("**Mulig økonomisk støtte**  \nI visse tilfælde.\n");
  });

  it("keeps a hard break that sits inside <em>", () => {
    expect(htmlToMarkdown("<p><em>Linje et<br></em>Linje to.</p>")).toBe(
      "*Linje et*  \nLinje to.\n",
    );
  });

  it("keeps a hard break inside nested <strong><em>", () => {
    expect(htmlToMarkdown("<p><strong><em>Linje et<br></em></strong>Linje to.</p>")).toBe(
      "***Linje et***  \nLinje to.\n",
    );
  });

  // Same defect, plain space instead of a line break. Measured on webhouse.dk
  // 2026-08-25: "noget exceptionelt?" came back as "noget**exceptionelt**?"
  // because the space lived inside the <strong>.
  it("keeps a trailing space that sits inside <strong>", () => {
    expect(htmlToMarkdown("<p><strong>Mulig støtte </strong>I visse.</p>")).toBe(
      "**Mulig støtte** I visse.",
    );
  });

  it("keeps a leading space that sits inside <strong>", () => {
    expect(htmlToMarkdown("<p>Noget<strong> exceptionelt</strong>?</p>")).toBe(
      "Noget **exceptionelt**?",
    );
  });

  // The space must not be emitted twice when the neighbouring text already
  // carries one — a stray double space at the end of a line IS a hard break in
  // Markdown, so duplicating it would invent line breaks nobody typed.
  it("does not double a space that already sits outside the mark", () => {
    expect(htmlToMarkdown("<p>Noget <strong> exceptionelt</strong>?</p>")).toBe(
      "Noget **exceptionelt**?",
    );
    expect(htmlToMarkdown("<p><strong>Mulig støtte </strong> I visse.</p>")).toBe(
      "**Mulig støtte** I visse.",
    );
  });

  // A break at the very end of a paragraph means nothing — the block trim must
  // still strip it, or every save would grow trailing whitespace.
  it("does not leave trailing whitespace when the break ends the block", () => {
    expect(htmlToMarkdown("<p><strong>Mulig støtte<br></strong></p>")).toBe(
      "**Mulig støtte**",
    );
  });

  // Guard the reason the trim exists in the first place: `** fed **` is not
  // valid Markdown emphasis, so the whitespace must end up OUTSIDE the
  // delimiters — moved, never kept inside. Asserted by exact equality, because
  // a "does it contain" check passes on both the right and the wrong answer.
  it("never leaves whitespace inside the emphasis delimiters", () => {
    expect(htmlToMarkdown("<p><strong> fed </strong>x</p>")).toBe("**fed** x");
    expect(htmlToMarkdown("<p><em> kursiv </em>x</p>")).toBe("*kursiv* x");
    expect(htmlToMarkdown("<p><strong>fed<br></strong>x</p>")).toBe("**fed**  \nx\n");
  });
});
