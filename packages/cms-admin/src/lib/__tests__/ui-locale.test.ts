/**
 * F211.1 — the admin's own language.
 *
 * The order is the contract: the user's choice beats the brand's default
 * (cms.fysio.work opens in Danish), which beats the browser, which beats
 * English. And no request may see another's choice: the language is passed in,
 * never held in module state.
 */
import { describe, it, expect } from "vitest";
import { missingKeys } from "@broberg/i18n";
import { MESSAGES, UI_LOCALES, getT, resolveUiLocale, clientMessages } from "@/i18n/locale";

describe("resolveUiLocale", () => {
  it("the user's own choice wins over everything", () => {
    expect(resolveUiLocale({ user: "en", brand: "da", acceptLanguage: "da" })).toBe("en");
    expect(resolveUiLocale({ user: "da", brand: null, acceptLanguage: "en-US" })).toBe("da");
  });

  it("then the brand's default", () => {
    expect(resolveUiLocale({ user: null, brand: "da", acceptLanguage: "en-US,en;q=0.9" })).toBe("da");
  });

  it("then the browser, by quality", () => {
    expect(resolveUiLocale({ acceptLanguage: "da-DK,da;q=0.9,en;q=0.8" })).toBe("da");
    expect(resolveUiLocale({ acceptLanguage: "de-DE,da;q=0.5,en;q=0.9" })).toBe("en");
  });

  it("then English", () => {
    expect(resolveUiLocale({})).toBe("en");
    expect(resolveUiLocale({ acceptLanguage: "de-DE,fr;q=0.8" })).toBe("en");
  });

  it("skips anything that is not a supported language", () => {
    expect(resolveUiLocale({ user: "xx", brand: "<script>", acceptLanguage: "da" })).toBe("da");
    expect(resolveUiLocale({ user: "", brand: "", acceptLanguage: "" })).toBe("en");
  });
});

describe("getT", () => {
  it("two requests in different languages at the same time each get their own", async () => {
    const [da, en] = await Promise.all([
      Promise.resolve().then(() => getT("da")("account.language.label")),
      Promise.resolve().then(() => getT("en")("account.language.label")),
    ]);
    expect(da).toBe("Sprog i admin");
    expect(en).toBe("Admin language");
  });

  it("a text not yet translated to Danish shows the English text, not its key", () => {
    const messages = { en: { greet: { hello: "Hello" } }, da: { greet: {} } };
    expect(getT("da", messages)("greet.hello")).toBe("Hello");
  });

  it("an unknown key shows the key, never an empty string", () => {
    expect(getT("da")("does.not.exist")).toBe("does.not.exist");
  });
});

describe("catalog", () => {
  it("every language has every key the English source has", () => {
    for (const l of UI_LOCALES) expect(missingKeys(MESSAGES.en, MESSAGES[l]), l).toEqual([]);
  });

  it("the browser gets only the active language and the English fallback", () => {
    expect(Object.keys(clientMessages("da")).sort()).toEqual(["da", "en"]);
    expect(Object.keys(clientMessages("en"))).toEqual(["en"]);
  });
});
